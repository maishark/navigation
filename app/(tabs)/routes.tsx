// app/(tabs)/routes.tsx
import Constants from "expo-constants";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import {
  ArrowLeftRight,
  Bike,
  Car,
  Crosshair,
  Footprints,
  MapPin,
  Route as RouteIcon,
  Search as SearchIcon,
} from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, {
  LatLng,
  MapPressEvent,
  Marker,
  Polyline,
  Region,
} from "react-native-maps";

type Coord = { lat: number; lon: number };
type Field = "source" | "dest";
type TravelMode = "walk" | "bike" | "car";
type PlaceResult = { name: string; latitude: number; longitude: number };

type RouteResponse = {
  polyline: Coord[];
  distance_m: number;
  duration_min: number; // minutes
  mode?: string;
  warnings?: string[];
};

const rawBase =
  (process.env.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  ((Constants?.expoConfig?.extra as any)
    ?.EXPO_PUBLIC_API_BASE_URL as string | undefined) ??
  "";
const API_BASE = rawBase.trim().replace(/[,\s]+$/g, "").replace(/\/+$/g, "");

// region helper
const coordToRegion = (c: Coord): Region => ({
  latitude: c.lat,
  longitude: c.lon,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
});

// duration -> "1 hr 30 mins" / "45 mins" / "1 hr"
const formatHrsMins = (durationMin?: number | null): string => {
  const n = Number(durationMin);
  if (!Number.isFinite(n) || n < 0) return "-";
  const total = Math.round(n);
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hp = h > 0 ? `${h} ${h === 1 ? "hr" : "hrs"}` : "";
  const mp = m > 0 ? `${m} ${m === 1 ? "min" : "mins"}` : "";
  if (hp && mp) return `${hp} ${mp}`;
  if (hp) return hp;
  if (mp) return mp;
  return "0 min";
};

// ---- OSM search/reverse search (simple, no API key) ----
async function nominatimGeocode(q: string): Promise<PlaceResult[]> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=8&q=${encodeURIComponent(
      q
    )}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "DhakaSafetyApp/1.0 (academic)" },
    });
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr.map((r: any) => ({
      name: r.display_name as string,
      latitude: Number(r.lat),
      longitude: Number(r.lon),
    }));
  } catch {
    return [];
  }
}

async function nominatimReverse(
  lat: number,
  lon: number
): Promise<string | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "DhakaSafetyApp/1.0 (academic)" },
    });
    const json = await res.json();
    const r = json?.address ?? {};
    const parts = [
      r.road,
      r.neighbourhood || r.suburb,
      r.city || r.town || r.village,
    ].filter(Boolean);
    return parts.join(", ") || (json?.display_name as string) || null;
  } catch {
    return null;
  }
}

export default function RoutesScreen() {
  const [activeField, setActiveField] = useState<Field>("source");
  const [travelMode, setTravelMode] = useState<TravelMode>("car");

  const [sourceLabel, setSourceLabel] = useState<string>("");
  const [destLabel, setDestLabel] = useState<string>("");

  const [sourceCoord, setSourceCoord] = useState<Coord | null>(null);
  const [destCoord, setDestCoord] = useState<Coord | null>(null);

  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);

  const [polyline, setPolyline] = useState<Coord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [distanceText, setDistanceText] = useState("-");
  const [durationText, setDurationText] = useState("-");
  const [modeText, setModeText] = useState("-");
  const [warnings, setWarnings] = useState<string[]>([]);

  const mapRef = useRef<MapView>(null);

  const center = useMemo<Coord>(
    () => sourceCoord ?? { lat: 23.8103, lon: 90.4125 },
    [sourceCoord]
  );

  // current location -> set as Source quickly
  const useMyLocation = async () => {
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        Alert.alert(
          "Location is off",
          "Enable Location Services and try again."
        );
        return;
      }
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== "granted") {
        Alert.alert(
          "Permission required",
          "Allow location permission to proceed."
        );
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 5000,
        timeout: 20000,
      });
      const c = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      const label =
        (await nominatimReverse(c.lat, c.lon)) ??
        `${c.lat.toFixed(6)}, ${c.lon.toFixed(6)}`;
      setSourceCoord(c);
      setSourceLabel(label);
      setActiveField("dest");
      mapRef.current?.animateToRegion(coordToRegion(c), 600);
    } catch {
      Alert.alert(
        "Couldn’t get your location",
        "Try again with GPS/Wi-Fi enabled."
      );
    }
  };

  // search bar flow → fills whichever field is active
  const searchPlaces = async () => {
    if (!query.trim()) return;
    try {
      setSearching(true);
      Keyboard.dismiss();
      const arr = await nominatimGeocode(query.trim());
      setResults(arr);
    } catch {
      setResults([]);
      Alert.alert("Search failed", "Try a more specific name.");
    } finally {
      setSearching(false);
    }
  };

  const chooseResult = async (item: PlaceResult) => {
    const c = { lat: item.latitude, lon: item.longitude };
    const label = item.name;
    if (activeField === "source") {
      setSourceCoord(c);
      setSourceLabel(label);
      setActiveField("dest");
    } else {
      setDestCoord(c);
      setDestLabel(label);
    }
    setResults([]);
    setQuery("");
    mapRef.current?.animateToRegion(coordToRegion(c), 600);
  };

  // long press to set active endpoint
  const onMapLongPress = async (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    const label =
      (await nominatimReverse(latitude, longitude)) ??
      `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
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

  // drag marker to refine
  const onDragEndMarker =
    (which: Field) =>
    async (e: { nativeEvent: { coordinate: LatLng } }) => {
      const { latitude, longitude } = e.nativeEvent.coordinate;
      const label =
        (await nominatimReverse(latitude, longitude)) ??
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
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
      Alert.alert(
        "Missing API URL",
        "Set EXPO_PUBLIC_API_BASE_URL in app.json and restart Expo."
      );
      return;
    }
    if (!sourceCoord || !destCoord) {
      Alert.alert(
        "Pick both points",
        "Choose a start and an end (search or long-press on the map)."
      );
      return;
    }

    try {
      setIsLoading(true);
      setPolyline([]);

      // send local time for hour-aware backend
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");

      const res = await fetch(`${API_BASE}/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: sourceCoord,
          dest: destCoord,
          local_time: `${hh}:${mm}`,
          mode: travelMode,
        }),
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);

      const json: RouteResponse = await res.json();

      setPolyline(Array.isArray(json.polyline) ? json.polyline : []);
      setDistanceText(`${(Number(json.distance_m) / 1000).toFixed(1)} km`);
      setDurationText(formatHrsMins(Number(json.duration_min)));
      setModeText((json.mode ?? travelMode).toUpperCase());
      setWarnings(Array.isArray(json.warnings) ? json.warnings.filter(Boolean) : []);

      if (mapRef.current && (json.polyline?.length ?? 0) > 1) {
        const coords = json.polyline.map((p) => ({
          latitude: p.lat,
          longitude: p.lon,
        }));
        mapRef.current.fitToCoordinates(coords, {
          edgePadding: { top: 60, bottom: 60, left: 40, right: 40 },
          animated: true,
        });
      }
    } catch (e: any) {
      Alert.alert("Routing failed", String(e?.message ?? e));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#2563EB", "#1D4ED8"]} style={styles.header}>
        <View style={styles.headerContent}>
          <RouteIcon size={28} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Safer Route</Text>
          <Text style={styles.headerSubtitle}>
            Pick start & destination (Dhaka traffic aware)
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Travel mode */}
        <View style={styles.modeRow}>
          {[
            { id: "walk" as TravelMode, label: "Walk", Icon: Footprints },
            { id: "bike" as TravelMode, label: "Bike", Icon: Bike },
            { id: "car" as TravelMode, label: "Car", Icon: Car },
          ].map(({ id, label, Icon }) => {
            const active = travelMode === id;
            return (
              <TouchableOpacity
                key={id}
                onPress={() => setTravelMode(id)}
                style={[styles.modeBtn, active && styles.modeBtnActive]}
              >
                <Icon size={16} color={active ? "#fff" : "#2563EB"} />
                <Text style={[styles.modeText, active && styles.modeTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Set Start / Dest + Swap */}
        <View style={styles.row}>
          <TouchableOpacity
            onPress={() => setActiveField("source")}
            style={[styles.chip, activeField === "source" && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, activeField === "source" && styles.chipTextActive]}
            >
              Set Start
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setActiveField("dest")}
            style={[styles.chip, activeField === "dest" && styles.chipActive]}
          >
            <Text
              style={[styles.chipText, activeField === "dest" && styles.chipTextActive]}
            >
              Set Destination
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={swapEndpoints}
            style={styles.swapBtn}
            accessibilityLabel="Swap"
          >
            <ArrowLeftRight size={16} color="#2563EB" />
          </TouchableOpacity>
        </View>

        {/* Single search bar + results */}
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
          <TouchableOpacity
            onPress={searchPlaces}
            style={styles.searchBtn}
            disabled={searching}
          >
            <Text style={styles.searchBtnText}>
              {searching ? "..." : "Search"}
            </Text>
          </TouchableOpacity>
          {activeField === "source" && (
            <TouchableOpacity onPress={useMyLocation} style={styles.locBtn}>
              <Crosshair color="#2563EB" size={18} />
            </TouchableOpacity>
          )}
        </View>

        {results.length > 0 ? (
          <View style={styles.resultsBox}>
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
              {results.map((item, i) => (
                <TouchableOpacity
                  key={`${item.latitude},${item.longitude},${i}`}
                  style={styles.resultItem}
                  onPress={() => chooseResult(item)}
                >
                  <MapPin size={16} color="#2563EB" />
                  <Text style={styles.resultText}>{item.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        ) : null}

        {/* Selected labels */}
        <View style={styles.selBox}>
          <View style={styles.selRow}>
            <Text style={styles.selLabel}>Start</Text>
            <Text style={styles.selValue}>
              {sourceLabel ? sourceLabel : "— not set —"}
            </Text>
          </View>
          <View style={styles.selRow}>
            <Text style={styles.selLabel}>Destination</Text>
            <Text style={styles.selValue}>
              {destLabel ? destLabel : "— not set —"}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={calculateSafeRoute}
          disabled={isLoading}
          style={[styles.button, { opacity: isLoading ? 0.7 : 1 }]}
        >
          <Text style={styles.buttonText}>
            {isLoading ? "Calculating…" : "Calculate"}
          </Text>
        </TouchableOpacity>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat label="Distance" value={distanceText} />
          <Stat label="Duration" value={durationText} />
          <Stat label="Mode" value={modeText} />
        </View>

        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            ref={mapRef}
            style={{ flex: 1 }}
            initialRegion={{
              latitude: center.lat,
              longitude: center.lon,
              latitudeDelta: 0.12,
              longitudeDelta: 0.12,
            }}
            onLongPress={onMapLongPress}
            showsUserLocation
            showsMyLocationButton
          >
            {sourceCoord ? (
              <Marker
                coordinate={{ latitude: sourceCoord.lat, longitude: sourceCoord.lon }}
                title="Start"
                pinColor="#2563EB"
                draggable
                onDragEnd={onDragEndMarker("source")}
              />
            ) : null}
            {destCoord ? (
              <Marker
                coordinate={{ latitude: destCoord.lat, longitude: destCoord.lon }}
                title="Destination"
                pinColor="#16A34A"
                draggable
                onDragEnd={onDragEndMarker("dest")}
              />
            ) : null}
            {polyline.length > 1 ? (
              <Polyline
                coordinates={polyline.map((p) => ({
                  latitude: p.lat,
                  longitude: p.lon,
                }))}
                strokeWidth={5}
                strokeColor="#22C55E"
              />
            ) : null}
          </MapView>
        </View>

        {warnings.length > 0 ? (
          <View style={styles.warningBox}>
            {warnings.map((w, i) => (
              <Text key={`${w}-${i}`} style={styles.warningText}>
                • {w}
              </Text>
            ))}
          </View>
        ) : null}
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
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    backgroundColor: "#2563EB",
  },
  headerContent: { alignItems: "center" },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#FFFFFF",
    marginTop: 8,
    marginBottom: 4,
  },
  headerSubtitle: { fontSize: 16, color: "#BFDBFE", textAlign: "center" },

  content: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 },

  modeRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  modeBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2563EB",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  modeBtnActive: { backgroundColor: "#2563EB" },
  modeText: { color: "#2563EB", fontWeight: "700" },
  modeTextActive: { color: "#FFFFFF", fontWeight: "800" },

  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  chip: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF",
  },
  chipActive: { backgroundColor: "#EFF6FF", borderColor: "#2563EB" },
  chipText: { color: "#374151", fontWeight: "600" },
  chipTextActive: { color: "#1D4ED8" },
  swapBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },

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
  searchBtn: {
    backgroundColor: "#2563EB",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchBtnText: { color: "#FFFFFF", fontWeight: "700" },
  locBtn: {
    backgroundColor: "#F3F4F6",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },

  resultsBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 8,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  resultText: { color: "#111827", flex: 1 },

  selBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 6,
    marginTop: 2,
  },
  selRow: { flexDirection: "row", gap: 8 },
  selLabel: { width: 100, color: "#6B7280" },
  selValue: { flex: 1, color: "#111827", fontWeight: "600" },

  button: {
    backgroundColor: "#2563EB",
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  buttonText: { color: "#FFFFFF", fontWeight: "700" },

  statsRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  statItem: {
    flex: 1,
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EEEEEE",
    alignItems: "center",
  },
  statLabel: { color: "#6B7280", marginBottom: 6 },
  statValue: { fontWeight: "800", fontSize: 18, color: "#111827" },

  mapContainer: {
    height: 360,
    borderRadius: 12,
    overflow: "hidden",
    marginTop: 14,
    backgroundColor: "#E5E7EB",
  },

  warningBox: {
    marginTop: 14,
    backgroundColor: "#FEF3C7",
    borderColor: "#F59E0B",
    borderWidth: 1,
    padding: 12,
    borderRadius: 10,
  },
  warningText: { color: "#7C2D12", fontSize: 12 },
});
