// app/(tabs)/crimemap.tsx
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { CircleAlert as AlertCircle, Eye, MapPin } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, Region } from 'react-native-maps';
import { supabase } from '../../lib/supabase';

const { width } = Dimensions.get('window');

type ReportRow = {
  id: number;
  crime_type: string;
  lat: number;
  lon: number;
  severity: number | null;
  created_at: string;
};

const CRIME_TYPES = [
  { id: 'all', name: 'All Crimes', color: '#6B7280', icon: '📍' },
  { id: 'murder', name: 'Murder', color: '#7F1D1D', icon: '⚰️' },
  { id: 'robbery', name: 'Robbery', color: '#DC2626', icon: '💰' },
  { id: 'mugging', name: 'Mugging', color: '#F59E0B', icon: '👤' },
  { id: 'assault', name: 'Assault', color: '#EA580C', icon: '👊' },
  { id: 'theft', name: 'Theft', color: '#D97706', icon: '🎒' },
  { id: 'rape', name: 'Rape', color: '#991B1B', icon: '⚠️' },
  { id: 'abduction', name: 'Abduction', color: '#7C2D12', icon: '🚨' },
];

const INITIAL_REGION: Region = {
  latitude: 23.8103,   // Dhaka center
  longitude: 90.4125,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export default function CrimeMapScreen() {
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [locationPermission, setLocationPermission] = useState(false);

  // ask for location permission (optional; just to show "you are here")
  useEffect(() => {
    (async () => {
      try {
        const services = await Location.hasServicesEnabledAsync();
        if (!services) {
          setLocationPermission(false);
          return;
        }
        let perm = await Location.getForegroundPermissionsAsync();
        if (perm.status !== 'granted') {
          perm = await Location.requestForegroundPermissionsAsync();
        }
        setLocationPermission(perm.status === 'granted');
      } catch {
        setLocationPermission(false);
      }
    })();
  }, []);

  // fetch recent reports from the view
  const fetchReports = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('v_recent_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (error) {
      Alert.alert('Error', error.message);
      setLoading(false);
      return;
    }
    // sanitize + cast
    const rows: ReportRow[] = (data ?? [])
      .filter((r: any) => typeof r.lat === 'number' && typeof r.lon === 'number')
      .map((r: any) => ({
        id: r.id,
        crime_type: String(r.crime_type ?? 'other').toLowerCase(),
        lat: Number(r.lat),
        lon: Number(r.lon),
        severity: typeof r.severity === 'number' ? r.severity : null,
        created_at: r.created_at,
      }));
    setReports(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const filtered = useMemo(() => {
    if (selectedFilter === 'all') return reports;
    return reports.filter(r => r.crime_type === selectedFilter);
  }, [reports, selectedFilter]);

  // tiny dot marker with color by severity (or by crime type fallback)
  const pinColorFor = (r: ReportRow) => {
    const sev = r.severity ?? 0;
    if (sev >= 4.5) return '#7F1D1D'; // critical
    if (sev >= 3.5) return '#DC2626'; // high
    if (sev >= 2.5) return '#F59E0B'; // medium
    if (sev > 0)   return '#16A34A'; // low
    // fallback to crime type color
    const ct = CRIME_TYPES.find(c => c.id === r.crime_type);
    return ct?.color ?? '#6B7280';
  };

  const emojiFor = (type: string) => {
    const ct = CRIME_TYPES.find(c => c.id === type);
    return ct?.icon ?? '📍';
  };

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

      {/* Header (like your older page) */}
      <LinearGradient colors={['#2563EB', '#1D4ED8']} style={styles.header}>
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
            showsMyLocationButton={true}
          >
            {filtered.map((r) => (
              <Marker
                key={r.id}
                coordinate={{ latitude: r.lat, longitude: r.lon }}
                title={r.crime_type.charAt(0).toUpperCase() + r.crime_type.slice(1)}
                description={new Date(r.created_at).toLocaleString()}
              >
                {/* Tiny colored dot */}
                <View style={[styles.dot, { backgroundColor: pinColorFor(r) }]} />
              </Marker>
            ))}
          </MapView>
        </View>

        {/* Filters — same chips feel, sizes, and emojis */}
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
                  <Text style={[styles.filterText, active && styles.filterTextActive]}>
                    {type.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Quick stats (basic, derived from loaded data) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crime Statistics</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{reports.length}</Text>
              <Text style={styles.statLabel}>Total Reports</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {
                  new Set(
                    reports.map((r) => `${r.lat.toFixed(3)},${r.lon.toFixed(3)}`)
                  ).size
                }
              </Text>
              <Text style={styles.statLabel}>Unique Spots</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>
                {reports.filter((r) => {
                  const hours = (Date.now() - new Date(r.created_at).getTime()) / 36e5;
                  return hours <= 168; // last 7 days
                }).length}
              </Text>
              <Text style={styles.statLabel}>This Week</Text>
            </View>
          </View>
        </View>

        {/* Recent list (simple, uses the same chip sizes/feel) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Crime Reports</Text>
          {filtered.slice(0, 12).map((r) => {
            const sevColor = pinColorFor(r);
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
                        {r.lat.toFixed(5)}, {r.lon.toFixed(5)}
                      </Text>
                    </View>
                  </View>
                  <View style={[styles.severityBadge, { backgroundColor: sevColor }]}>
                    <Text style={styles.severityText}>
                      {r.severity != null ? `SEV ${r.severity.toFixed(1)}` : 'NEW'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.crimeTime}>{new Date(r.created_at).toLocaleString()}</Text>
                <TouchableOpacity style={styles.viewDetailsBtn} onPress={() => {}}>
                  <Eye size={16} color="#2563EB" />
                  <Text style={styles.viewDetailsText}>View Details</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>

        {/* Alert card (optional demo) */}
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

const DOT_SIZE = 8; // smaller pins

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
    zIndex: 10,
    position: 'relative',
    backgroundColor: '#2563EB',
  },
  headerContent: { alignItems: 'center' },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
    marginBottom: 4,
  },
  headerSubtitle: { fontSize: 16, color: '#BFDBFE', textAlign: 'center' },

  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },

  mapContainer: {
    height: 300,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 24,
    marginTop: 10,
    backgroundColor: '#E5E7EB',
  },
  map: { flex: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 12 },

  filtersScroll: { flexDirection: 'row' },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  filterButtonActive: { backgroundColor: '#F3F4F6' },
  filterEmoji: { fontSize: 16, marginRight: 6 },
  filterText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  filterTextActive: { color: '#1F2937', fontWeight: '600' },

  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 24, fontWeight: 'bold', color: '#1F2937' },
  statLabel: { fontSize: 12, color: '#6B7280', marginTop: 4 },

  crimeReportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  crimeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  crimeTypeIndicator: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  crimeEmoji: { fontSize: 20, marginRight: 12 },
  crimeType: { fontSize: 16, fontWeight: '600', color: '#1F2937' },
  crimeLocation: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  severityBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  severityText: { fontSize: 10, color: '#FFFFFF', fontWeight: '600' },
  crimeTime: { fontSize: 12, color: '#9CA3AF', marginBottom: 8 },
  viewDetailsBtn: { flexDirection: 'row', alignItems: 'center' },
  viewDetailsText: { fontSize: 12, color: '#2563EB', fontWeight: '500', marginLeft: 4 },

  alertCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  alertContent: { flex: 1, marginLeft: 12 },
  alertTitle: { fontSize: 14, fontWeight: '600', color: '#DC2626', marginBottom: 4 },
  alertText: { fontSize: 12, color: '#374151', lineHeight: 16 },

  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 1,
    borderColor: 'white',
  },
});
