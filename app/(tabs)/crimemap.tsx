// app/(tabs)/crimemap.tsx
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { CircleAlert as AlertCircle, MapPin, ThumbsDown, ThumbsUp } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import { supabase } from "../../lib/supabase";

type ReportRow = {
  id: number;
  crime_type: string;
  lat: number;
  lon: number;
  severity: number | null;
  created_at: string;
  area_name?: string | null;
  upvote_no?: number | null;
  downvote_no?: number | null;
};

const CRIME_TYPES = [
  { id: "all", name: "All Crimes", color: "#6B7280", icon: "📍" },
  { id: "murder", name: "Murder", color: "#7F1D1D", icon: "⚰️" },
  { id: "robbery", name: "Robbery", color: "#DC2626", icon: "💰" },
  { id: "mugging", name: "Mugging", color: "#F59E0B", icon: "👤" },
  { id: "assault", name: "Assault", color: "#EA580C", icon: "👊" },
  { id: "theft", name: "Theft", color: "#D97706", icon: "🎒" },
  { id: "rape", name: "Rape", color: "#991B1B", icon: "⚠️" },
  { id: "abduction", name: "Abduction", color: "#7C2D12", icon: "🚨" },
];

const INITIAL_REGION: Region = {
  latitude: 23.8103,
  longitude: 90.4125,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

// Haversine distance (km)
function getDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default function CrimeMapScreen() {
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Voting state
  const [userId, setUserId] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Record<number, 1 | -1 | 0>>({});
  const [optimisticVotes, setOptimisticVotes] = useState<Record<number, 1 | -1 | 0>>({});
  const [voteBusy, setVoteBusy] = useState<Record<number, boolean>>({});

  // ask location + get user id
  useEffect(() => {
    (async () => {
      try {
        const { data: u } = await supabase.auth.getUser();
        setUserId(u.user?.id ?? null);
      } catch {}

      try {
        const services = await Location.hasServicesEnabledAsync();
        if (!services) return;
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== "granted") perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === "granted") {
          setLocationPermission(true);
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          setUserLocation({ lat: loc.coords.latitude, lon: loc.coords.longitude });
        }
      } catch {
        setLocationPermission(false);
      }
    })();
  }, []);

  // fetch reports (directly from reports so we have up/down counts)
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase
      .from("reports")
      .select("id, crime_type, lat, lon, severity, created_at, area_name, upvote_no, downvote_no")
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) {
      setErr(error.message);
      setLoading(false);
      return;
    }

    const rows: ReportRow[] = (data ?? [])
      .filter((r: any) => typeof r.lat === "number" && typeof r.lon === "number")
      .map((r: any) => ({
        id: Number(r.id),
        crime_type: String(r.crime_type ?? "other").toLowerCase(),
        lat: Number(r.lat),
        lon: Number(r.lon),
        severity: typeof r.severity === "number" ? r.severity : null,
        created_at: String(r.created_at),
        area_name: r.area_name ?? null,
        upvote_no: r.upvote_no ?? 0,
        downvote_no: r.downvote_no ?? 0,
      }));

    setReports(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
    // realtime new inserts
    const ch = supabase
      .channel("reports-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reports" }, (payload) => {
        const n = payload.new as any;
        if (typeof n.lat === "number" && typeof n.lon === "number") {
          setReports((prev) => [
            {
              id: Number(n.id),
              crime_type: String(n.crime_type ?? "other").toLowerCase(),
              lat: Number(n.lat),
              lon: Number(n.lon),
              severity: typeof n.severity === "number" ? n.severity : null,
              created_at: String(n.created_at),
              area_name: n.area_name ?? null,
              upvote_no: n.upvote_no ?? 0,
              downvote_no: n.downvote_no ?? 0,
            },
            ...prev,
          ]);
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [fetchReports]);

  // pins respect filter
  const filtered = useMemo(() => {
    if (selectedFilter === "all") return reports;
    return reports.filter((r) => r.crime_type === selectedFilter);
  }, [reports, selectedFilter]);

  // stats ignore filter (=> ALL reports)
  const totalReports = reports.length;
  const weekCount = reports.filter(
    (r) => Date.now() - new Date(r.created_at).getTime() < 7 * 86400 * 1000
  ).length;
  const highCritical = reports.filter((r) => (r.severity ?? 0) >= 3.5).length;

  // nearby recent (≤5km & ≤5 days)
  const recentNearbyCrimes = useMemo(() => {
    if (!userLocation) return [];
    const now = Date.now();
    const fiveDaysMs = 5 * 24 * 60 * 60 * 1000;
    return reports.filter((r) => {
      const timeDiff = now - new Date(r.created_at).getTime();
      const distance = getDistanceKm(userLocation.lat, userLocation.lon, r.lat, r.lon);
      return timeDiff <= fiveDaysMs && distance <= 5;
    });
  }, [reports, userLocation]);

  const pinColorFor = (r: ReportRow) => {
    const sev = r.severity ?? 0;
    if (sev >= 4.5) return "#7F1D1D";
    if (sev >= 3.5) return "#DC2626";
    if (sev >= 2.5) return "#F59E0B";
    if (sev > 0) return "#16A34A";
    const ct = CRIME_TYPES.find((c) => c.id === r.crime_type);
    return ct?.color ?? "#6B7280";
  };

  const emojiFor = (type: string) => {
    const ct = CRIME_TYPES.find((c) => c.id === type);
    return ct?.icon ?? "📍";
  };

  // ---- Voting helpers ----
  const setReportCounts = (reportId: number, deltaUp: number, deltaDown: number) => {
    setReports((prev) =>
      prev.map((r) =>
        r.id === reportId
          ? {
              ...r,
              upvote_no: Math.max(0, (r.upvote_no ?? 0) + deltaUp),
              downvote_no: Math.max(0, (r.downvote_no ?? 0) + deltaDown),
            }
          : r
      )
    );
  };

  const handleVote = async (reportId: number, next: 1 | -1) => {
    if (!userId || voteBusy[reportId]) return;

    const current = optimisticVotes[reportId] ?? myVotes[reportId] ?? 0;
    setVoteBusy((b) => ({ ...b, [reportId]: true }));

    const newVote: 1 | -1 | 0 = current === next ? 0 : next;

    // optimistic overlay + counter tweaks
    setOptimisticVotes((ov) => ({ ...ov, [reportId]: newVote }));
    if (current === 0 && newVote === 1) setReportCounts(reportId, +1, 0);
    if (current === 0 && newVote === -1) setReportCounts(reportId, 0, +1);
    if (current === 1 && newVote === 0) setReportCounts(reportId, -1, 0);
    if (current === -1 && newVote === 0) setReportCounts(reportId, 0, -1);
    if (current === 1 && newVote === -1) setReportCounts(reportId, -1, +1);
    if (current === -1 && newVote === 1) setReportCounts(reportId, +1, -1);

    try {
      if (newVote === 0) {
        // unvote
        const { error } = await supabase
          .from("report_votes")
          .delete()
          .match({ report_id: reportId, user_id: userId });
        if (error) throw error;
        setMyVotes((mv) => ({ ...mv, [reportId]: 0 }));
      } else {
        // cast/switch
        const { error } = await supabase
          .from("report_votes")
          .upsert(
            { report_id: reportId, user_id: userId, value: newVote },
            { onConflict: "report_id,user_id" }
          );
        if (error) throw error;
        setMyVotes((mv) => ({ ...mv, [reportId]: newVote }));
      }
    } catch (e) {
      // rollback counts
      if (current === 0 && newVote === 1) setReportCounts(reportId, -1, 0);
      if (current === 0 && newVote === -1) setReportCounts(reportId, 0, -1);
      if (current === 1 && newVote === 0) setReportCounts(reportId, +1, 0);
      if (current === -1 && newVote === 0) setReportCounts(reportId, 0, +1);
      if (current === 1 && newVote === -1) setReportCounts(reportId, +1, -1);
      if (current === -1 && newVote === 1) setReportCounts(reportId, -1, +1);
    } finally {
      setOptimisticVotes((ov) => {
        const copy = { ...ov };
        delete copy[reportId];
        return copy;
      });
      setVoteBusy((b) => ({ ...b, [reportId]: false }));
    }
  };

  // Load my votes for visible nearby crimes (don’t clobber optimistic overlay)
  useEffect(() => {
    (async () => {
      if (!userId || recentNearbyCrimes.length === 0) return;
      const ids = recentNearbyCrimes.map((r) => r.id);
      const { data, error } = await supabase
        .from("report_votes")
        .select("report_id, value")
        .eq("user_id", userId)
        .in("report_id", ids as any);
      if (!error && data) {
        setMyVotes((prev) => {
          const next = { ...prev };
          for (const row of data) {
            const rid = Number(row.report_id);
            if (optimisticVotes[rid] == null) next[rid] = row.value === 1 ? 1 : -1;
          }
          return next;
        });
      }
    })();
  }, [userId, recentNearbyCrimes, optimisticVotes]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text>Loading map…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={["#2563EB", "#1D4ED8"]} style={styles.header}>
        <View style={styles.headerContent}>
          <MapPin size={28} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Crime Map</Text>
          <Text style={styles.headerSubtitle}>Real-time crime data visualization</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Map */}
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={INITIAL_REGION}
            showsUserLocation={locationPermission}
            showsMyLocationButton
          >
            {filtered.map((r) => (
              <Marker
                key={r.id}
                coordinate={{ latitude: r.lat, longitude: r.lon }}
                title={r.crime_type.charAt(0).toUpperCase() + r.crime_type.slice(1)}
                description={new Date(r.created_at).toLocaleString()}
              >
                <View style={[styles.dot, { backgroundColor: pinColorFor(r) }]} />
              </Marker>
            ))}
          </MapView>

          {!!err && (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{String(err)}</Text>
            </View>
          )}
        </View>

        {/* Filter by type (affects pins only) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Filter by Crime Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtersScroll}>
            {CRIME_TYPES.map((type) => {
              const active = selectedFilter === type.id;
              return (
                <TouchableOpacity
                  key={type.id}
                  style={[
                    styles.filterButton,
                    active && styles.filterButtonActive,
                    { borderColor: type.color },
                  ]}
                  onPress={() => setSelectedFilter(type.id)}
                >
                  <Text style={styles.filterEmoji}>{type.icon}</Text>
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>{type.name}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Crime Statistics (unfiltered) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crime Statistics</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{totalReports}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{weekCount}</Text>
              <Text style={styles.statLabel}>This Week</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{highCritical}</Text>
              <Text style={styles.statLabel}>High/Critical</Text>
            </View>
          </View>
        </View>

        {/* Nearby (compact cards with votes) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Crimes Near You (≤5km, ≤5 days)</Text>
          {userLocation ? (
            recentNearbyCrimes.length > 0 ? (
              recentNearbyCrimes.slice(0, 6).map((r) => {
                const sevColor = pinColorFor(r);
                const effectiveVote = optimisticVotes[r.id] ?? myVotes[r.id] ?? 0;
                const busy = !!voteBusy[r.id];

                return (
                  <View key={r.id} style={styles.crimeReportCard}>
                    <View style={styles.crimeHeader}>
                      <View style={styles.crimeTypeIndicator}>
                        <Text style={styles.crimeEmoji}>{emojiFor(r.crime_type)}</Text>
                        <View>
                          <Text style={styles.crimeType}>
                            {r.crime_type.charAt(0).toUpperCase() + r.crime_type.slice(1)}
                          </Text>
                          <Text style={styles.crimeLocation}>
                            {r.area_name ? String(r.area_name) : `${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`}
                          </Text>
                        </View>
                      </View>
                      <View style={[styles.severityBadge, { backgroundColor: sevColor }]}>
                        <Text style={styles.severityText}>
                          {r.severity != null ? `SEV ${r.severity.toFixed(1)}` : "NEW"}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.crimeTime}>{new Date(r.created_at).toLocaleString()}</Text>

                    {/* Vote row */}
                    <View style={styles.voteRow}>
                      <TouchableOpacity
                        style={[
                          styles.voteBtn,
                          effectiveVote === 1 && styles.voteBtnActiveUp,
                          busy && styles.voteBtnDisabled,
                        ]}
                        disabled={busy || !userId}
                        onPress={() => handleVote(r.id, 1)}
                      >
                        <ThumbsUp size={14} color={effectiveVote === 1 ? "#fff" : "#16A34A"} />
                        <Text style={[styles.voteText, effectiveVote === 1 && styles.voteTextActive]}>
                          {Number(r.upvote_no ?? 0)}
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={[
                          styles.voteBtn,
                          effectiveVote === -1 && styles.voteBtnActiveDown,
                          busy && styles.voteBtnDisabled,
                        ]}
                        disabled={busy || !userId}
                        onPress={() => handleVote(r.id, -1)}
                      >
                        <ThumbsDown size={14} color={effectiveVote === -1 ? "#fff" : "#DC2626"} />
                        <Text style={[styles.voteText, effectiveVote === -1 && styles.voteTextActive]}>
                          {Number(r.downvote_no ?? 0)}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            ) : (
              <Text style={{ color: "#6B7280" }}>✅ No recent crimes reported near you.</Text>
            )
          ) : (
            <Text style={{ color: "#9CA3AF" }}>
              ⚠️ Location not available. Enable location to see nearby reports.
            </Text>
          )}
        </View>

        {/* Alert */}
        <View style={styles.section}>
          <View style={styles.alertCard}>
            <AlertCircle size={24} color="#DC2626" />
            <View style={styles.alertContent}>
              <Text style={styles.alertTitle}>Heads up</Text>
              <Text style={styles.alertText}>
                Reports are limited to the last 180 days and auto-refresh when users submit new incidents.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const DOT_SIZE = 8;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20, backgroundColor: "#2563EB" },
  headerContent: { alignItems: "center" },
  headerTitle: { fontSize: 28, fontWeight: "bold", color: "#FFFFFF", marginTop: 8, marginBottom: 4 },
  headerSubtitle: { fontSize: 16, color: "#BFDBFE", textAlign: "center" },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 24,
    marginTop: 10,
    backgroundColor: "#E5E7EB",
  },
  map: { flex: 1 },

  center: { flex: 1, alignItems: "center", justifyContent: "center" },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "600", color: "#1F2937", marginBottom: 12 },

  // stats (unfiltered)
  statsContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: { alignItems: "center" },
  statNumber: { fontSize: 24, fontWeight: "bold", color: "#1F2937" },
  statLabel: { fontSize: 12, color: "#6B7280", marginTop: 4 },

  // filters
  filtersScroll: { flexDirection: "row" },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  filterButtonActive: { backgroundColor: "#F3F4F6" },
  filterEmoji: { fontSize: 16, marginRight: 6 },
  filterText: { fontSize: 12, color: "#6B7280", fontWeight: "500" },
  filterTextActive: { color: "#1F2937", fontWeight: "600" },

  // nearby cards
  crimeReportCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  crimeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  crimeTypeIndicator: { flexDirection: "row", alignItems: "center", flex: 1 },
  crimeEmoji: { fontSize: 20, marginRight: 12 },
  crimeType: { fontSize: 16, fontWeight: "600", color: "#1F2937" },
  crimeLocation: { fontSize: 12, color: "#6B7280", marginTop: 2 },
  severityBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  severityText: { fontSize: 10, color: "#FFFFFF", fontWeight: "600" },
  crimeTime: { fontSize: 12, color: "#9CA3AF", marginBottom: 10 },

  // voting
  voteRow: { flexDirection: "row", gap: 10 },
  voteBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  voteBtnActiveUp: { backgroundColor: "#16A34A", borderColor: "#16A34A" },
  voteBtnActiveDown: { backgroundColor: "#DC2626", borderColor: "#DC2626" },
  voteBtnDisabled: { opacity: 0.6 },
  voteText: { color: "#374151", fontWeight: "700", fontSize: 12 },
  voteTextActive: { color: "#FFFFFF" },

  // alert
  alertCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    flexDirection: "row",
    borderLeftWidth: 4,
    borderLeftColor: "#DC2626",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  alertContent: { flex: 1, marginLeft: 12 },
  alertTitle: { fontSize: 14, fontWeight: "600", color: "#DC2626", marginBottom: 4 },
  alertText: { fontSize: 12, color: "#374151", lineHeight: 16 },

  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    borderColor: "white",
  },

  errorBanner: {
    position: "absolute",
    left: 10,
    right: 10,
    top: 10,
    backgroundColor: "#FEF2F2",
    borderColor: "#FECACA",
    borderWidth: 1,
    padding: 10,
    borderRadius: 8,
  },
  errorText: { color: "#991B1B", fontSize: 12 },
});
