// app/(tabs)/routes.tsx
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeftRight,
  Crosshair,
  MapPin,
  Route as RouteIcon,
  Search as SearchIcon,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { MapPressEvent, Marker, Polyline, Region } from "react-native-maps";

type Coord = { lat: number; lon: number };

const rawBase =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  ((Constants?.expoConfig?.extra as any)?.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  "";
const API_BASE = rawBase.trim().replace(/[,\s]+$/g, "").replace(/\/+$/g, "");

type Field = "source" | "dest";

export default function RoutesScreen() {
  const [activeField, setActiveField] = useState<Field>("source");

  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [destLabel, setDestLabel] = useState<string>("");

  const [sourceCoord, setSourceCoord] = useState<Coord | null>(null);
  const [destCoord, setDestCoord] = useState<Coord | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<{ name: string; latitude: number; longitude: number }[]>(
    []
  );

  const [polyline, setPolyline] = useState<Coord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState({
    distance: "-",
    duration: "-",
    safetyScore: "-",
    warnings: [] as string[],
  });

  const mapRef = useRef<MapView>(null);

  const coordToRegion = (c: Coord): Region => ({
    latitude: c.lat,
    longitude: c.lon,
    latitudeDelta: 0.05,
    longitudeDelta: 0.05,
  });

  const formatAddress = (addr: Partial<Location.LocationGeocodedAddress>) => {
    const parts = [
      addr.street || addr.name,
      addr.district || addr.subregion,
      addr.city || addr.region,
    ].filter(Boolean);
    return parts.join(", ");
  };

  const reverseLabel = async (lat: number, lon: number) => {
    try {
      const [addr] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
      const nice = addr ? formatAddress(addr) : null;
      return nice || addr?.name || `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    } catch {
      return `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    }
  };

  const useMyLocation = async () => {
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services)
        return Alert.alert("Location is off", "Enable Location Services and try again.");
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted")
        return Alert.alert("Permission required", "Allow location permission to proceed.");
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 5000,
        timeout: 20000,
      });
      const coord = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const label = await reverseLabel(coord.lat, coord.lon);
      setSourceCoord(coord);
      setSourceLabel(label);
      setActiveField("dest");
      mapRef.current?.animateToRegion(coordToRegion(coord), 600);
    } catch {
      Alert.alert("Couldn’t get your location", "Try again with GPS/Wi-Fi enabled.");
    }
  };

  const searchPlaces = async () => {
    if (!query.trim()) return;
    try {
      setSearching(true);
      Keyboard.dismiss();
      const arr = await Location.geocodeAsync(query.trim());
      const mapped = arr.slice(0, 8).map((r) => ({
        name: [r.name, r.street, r.district, r.city, r.region].filter(Boolean).join(", ") || query.trim(),
        latitude: r.latitude!,
        longitude: r.longitude!,
      }));
      setResults(mapped);
    } catch {
      Alert.alert("Search failed", "Could not find that place. Try a more specific name.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = async (item: { name: string; latitude: number; longitude: number }) => {
    const c = { lat: item.latitude, lon: item.longitude };
    if (activeField === "source") {
      setSourceCoord(c);
      setSourceLabel(item.name);
      setActiveField("dest");
    } else {
      setDestCoord(c);
      setDestLabel(item.name);
    }
    setResults([]);
    setQuery("");
    mapRef.current?.animateToRegion(coordToRegion(c), 600);
  };

  const onMapLongPress = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const label = await reverseLabel(latitude, longitude);
    const c = { lat: latitude, lon: longitude };
    if (activeField === "source") {
      setSourceCoord(c);
      setSourceLabel(label);
      setActiveField("dest");
    } else {
      setDestCoord(c);
      setDestLabel(label);
    }
  };

  const onDragEndMarker =
    (which: "source" | "dest") =>
    async (e: any) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      const label = await reverseLabel(latitude, longitude);
      const c = { lat: latitude, lon: longitude };
      if (which === "source") {
        setSourceCoord(c);
        setSourceLabel(label);
      } else {
        setDestCoord(c);
        setDestLabel(label);
      }
    };

  const swapEndpoints = () => {
    const sc = sourceCoord,
      dc = destCoord,
      sl = sourceLabel,
      dl = destLabel;
    setSourceCoord(dc);
    setDestCoord(sc);
    setSourceLabel(dl);
    setDestLabel(sl);
  };

  const calculateSafeRoute = async () => {
    if (!API_BASE) {
      return Alert.alert(
        "Missing API URL",
        "Set EXPO_PUBLIC_API_BASE_URL in app.json and restart Expo."
      );
    }
    if (!sourceCoord || !destCoord) {
      return Alert.alert(
        "Pick both points",
        "Choose a start and an end (search or long-press on the map)."
      );
    }
    try {
      setIsLoading(true);
      setPolyline([]);
      const res = await fetch(`${API_BASE}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: sourceCoord, dest: destCoord }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      setPolyline(json.polyline as Coord[]);
      setRouteInfo({
        distance: `${(json.distance_m / 1000).toFixed(1)} km`,
        duration: `${Math.round(json.duration_min)} mins`,
        safetyScore: `${Math.max(0, Math.min(100, Math.round(100 - json.safety_score)))}%`,
        warnings: json.warnings ?? [],
      });
      if (mapRef.current && (json.polyline?.length ?? 0) > 1) {
        const coords = (json.polyline as Coord[]).map((p) => ({
          latitude: p.lat,
          longitude: p.lon,
        }));
        // @ts-ignore
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, bottom: 60, left: 40, right: 40 },
          animated: true,
        });
      }
    } catch (e: any) {
      Alert.alert("Routing failed", e.message || "Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const center = useMemo<Coord>(() => sourceCoord ?? { lat: 23.8103, lon: 90.4125 }, [sourceCoord]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#2563EB", "#1D4ED8"]} style={styles.header}>
        <View style={styles.headerContent}>
          <RouteIcon size={28} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Safer Route</Text>
          <Text style={styles.headerSubtitle}>Pick start & destination (search or map)</Text>
        </View>
      </LinearGradient>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {/* Active field selector */}
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => setActiveField("source")}
            style={[styles.chip, activeField === "source" && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeField === "source" && styles.chipTextActive]}>
              Set Start
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveField("dest")}
            style={[styles.chip, activeField === "dest" && styles.chipActive]}
          >
            <Text style={[styles.chipText, activeField === "dest" && styles.chipTextActive]}>
              Set Destination
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={swapEndpoints} style={styles.swapBtn} accessibilityLabel="Swap">
            <ArrowLeftRight size={16} color="#2563EB" /> {/* ✅ fixed icon */}
          </TouchableOpacity>
        </View>

        {/* Search bar */}
        <View style={styles.searchRow}>
          <SearchIcon size={18} color="#6B7280" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeField === "source"
                ? 'Search start (e.g. "Dhanmondi Road 6")'
                : 'Search destination (e.g. "Gulshan 2")'
            }
            value={query}
            onChangeText={setQuery}
            placeholderTextColor="#9CA3AF"
            returnKeyType="search"
            onSubmitEditing={searchPlaces}
          />
          <TouchableOpacity onPress={searchPlaces} style={styles.searchBtn} disabled={searching}>
            <Text style={styles.searchBtnText}>{searching ? "…" : "Search"}</Text>
          </TouchableOpacity>
          {activeField === "source" && (
            <TouchableOpacity onPress={useMyLocation} style={styles.locBtn}>
              <Crosshair color="#2563EB" size={18} />
            </TouchableOpacity>
          )}
        </View>

        {/* Results */}
        {results.length > 0 && (
          <View style={styles.resultsBox}>
            <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
              {results.map((item, i) => (
                <TouchableOpacity key={i} style={styles.resultItem} onPress={() => chooseResult(item)}>
                  <MapPin size={16} color="#2563EB" />
                  <Text style={styles.resultText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Selected human-readable addresses */}
        <View style={styles.selBox}>
          <View style={styles.selRow}>
            <Text style={styles.selLabel}>Start</Text>
            <Text style={styles.selValue}>{sourceLabel || "— not set —"}</Text>
          </View>
          <View style={styles.selRow}>
            <Text style={styles.selLabel}>Destination</Text>
            <Text style={styles.selValue}>{destLabel || "— not set —"}</Text>
          </View>
        </View>

        <TouchableOpacity onPress={calculateSafeRoute} disabled={isLoading} style={[styles.button, { opacity: isLoading ? 0.7 : 1 }]}>
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Calculate</Text>}
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat label="Distance" value={routeInfo.distance} />
          <Stat label="Duration" value={routeInfo.duration} />
          <Stat label="Safety" value={routeInfo.safetyScore} />
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{ latitude: center.lat, longitude: center.lon, latitudeDelta: 0.12, longitudeDelta: 0.12 }}
            onLongPress={onMapLongPress}
            showsUserLocation
            showsMyLocationButton
          >
            {sourceCoord && (
              <Marker
                coordinate={{ latitude: sourceCoord.lat, longitude: sourceCoord.lon }}
                title="Start"
                pinColor="#2563EB"
                draggable
                onDragEnd={onDragEndMarker("source")}
              />
            )}
            {destCoord && (
              <Marker
                coordinate={{ latitude: destCoord.lat, longitude: destCoord.lon }}
                title="Destination"
                pinColor="#16A34A"
                draggable
                onDragEnd={onDragEndMarker("dest")}
              />
            )}
            {polyline.length > 1 && (
              <Polyline
                coordinates={polyline.map((p) => ({ latitude: p.lat, longitude: p.lon }))}
                strokeWidth={5}
                strokeColor="#22C55E"
              />
            )}
          </MapView>
        </View>

        {routeInfo.warnings.length > 0 && (
          <View style={styles.warningBox}>
            {routeInfo.warnings.map((w, i) => (
              <Text key={i} style={styles.warningText}>• {w}</Text>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.statItem}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, backgroundColor: "#2563EB" },
  headerContent: { alignItems: "center" },
  headerTitle: { fontSize: 28, fontWeight: "bold", color: "#FFFFFF", marginTop: 8, marginBottom: 4 },
  headerSubtitle: { fontSize: 16, color: "#BFDBFE", textAlign: "center" },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },

  row: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 10 },
  chip: { flex: 1, borderWidth: 1, borderColor: "#E5E7EB", paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: "#FFFFFF" },
  chipActive: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  chipText: { color: "#374151", fontWeight: "600" },
  chipTextActive: { color: "#1D4ED8" },
  swapBtn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB" },

  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: "#1F2937" },
  searchBtn: { backgroundColor: "#2563EB", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchBtnText: { color: "#FFFFFF", fontWeight: "700" },
  locBtn: { backgroundColor: "#F3F4F6", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },

  resultsBox: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", marginBottom: 8 },
  resultItem: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: "#F3F4F6" },
  resultText: { color: "#111827", flex: 1 },

  selBox: { backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#E5E7EB", padding: 12, gap: 6, marginTop: 2 },
  selRow: { flexDirection: "row", gap: 8 },
  selLabel: { width: 100, color: "#6B7280" },
  selValue: { flex: 1, color: "#111827", fontWeight: "600" },

  button: { backgroundColor: "#2563EB", padding: 14, borderRadius: 12, alignItems: "center", marginTop: 12 },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  statItem: { flex: 1, padding: 14, backgroundColor: "#FFFFFF", borderRadius: 12, borderWidth: 1, borderColor: "#EEEEEE", alignItems: "center" },
  statLabel: { color: "#6B7280", marginBottom: 6 },
  statValue: { fontWeight: "800", fontSize: 18, color: "#111827" },

  mapContainer: { height: 360, borderRadius: 12, overflow: "hidden", marginTop: 14, backgroundColor: "#E5E7EB" },

  warningBox: { marginTop: 14, backgroundColor: "#FEF3C7", borderColor: "#F59E0B", borderWidth: 1, padding: 12, borderRadius: 10 },
  warningText: { color: "#7C2D12", fontSize: 12 },
});
