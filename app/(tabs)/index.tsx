// app/(tabs)/index.tsx
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TriangleAlert as AlertTriangle, Car, MapPin, Shield } from 'lucide-react-native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

type ReportRow = {
  id: number;
  crime_type: string | null;
  area_name: string | null;
  created_at: string;
  severity: number | null;
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function HomeScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [totalReports, setTotalReports] = useState<number>(0);
  const [areasMapped, setAreasMapped] = useState<number>(0);
  const [recent, setRecent] = useState<ReportRow[]>([]);

  const navigateToRoutes = () => router.push('(tabs)/routes');
  const navigateToCrimeMap = () => router.push('(tabs)/crimemap');
  const navigateToReport = () => router.push('(tabs)/report');

  const fetchData = useCallback(async () => {
    setErr(null);
    setLoading(true);
    try {
      // Total reports
      const totalRes = await supabase
        .from('reports')
        .select('*', { count: 'exact', head: true });
      setTotalReports(totalRes.count ?? 0);

      // Areas mapped (unique area_name)
      const { data: areasData, error: areasErr } = await supabase
        .from('reports')
        .select('area_name')
        .not('area_name', 'is', null)
        .limit(10000);
      if (areasErr) throw areasErr;
      const unique = new Set(
        (areasData || [])
          .map((r) => (r as any).area_name as string)
          .filter(Boolean)
          .map((s) => s.trim().toLowerCase())
      );
      setAreasMapped(unique.size);

      // Recent activity (latest 3)
      const { data: recentData, error: recentErr } = await supabase
        .from('reports')
        .select('id, crime_type, area_name, created_at, severity')
        .order('created_at', { ascending: false })
        .limit(3);
      if (recentErr) throw recentErr;
      setRecent((recentData || []) as ReportRow[]);
    } catch (e: any) {
      setErr(e.message || 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <LinearGradient colors={['#DC2626', '#B91C1C']} style={styles.header}>
        <View style={styles.headerContent}>
          <Car size={28} color="#FFFFFF" style={{ marginBottom: 8 }} />
          <Text style={styles.headerTitle}>Dhaka Safety</Text>
          <Text style={styles.headerSubtitle}>Travel Safe, Stay Informed</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity style={styles.actionCard} onPress={navigateToRoutes}>
              <Shield size={24} color="#16A34A" />
              <Text style={styles.actionText}>Find Safe Route</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={navigateToCrimeMap}>
              <MapPin size={24} color="#2563EB" />
              <Text style={styles.actionText}>View Crime Map</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionCard} onPress={navigateToReport}>
              <AlertTriangle size={24} color="#DC2626" />
              <Text style={styles.actionText}>Report Crime</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Statistics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Statistics</Text>

          {loading ? (
            <View style={{ paddingVertical: 16 }}>
              <ActivityIndicator />
            </View>
          ) : err ? (
            <Text style={{ color: '#991B1B' }}>Failed to load: {String(err)}</Text>
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <AlertTriangle size={20} color="#DC2626" />
                <Text style={styles.statValue}>{totalReports}</Text>
                <Text style={styles.statTitle}>Total Reports</Text>
              </View>
              <View style={styles.statCard}>
                <MapPin size={20} color="#2563EB" />
                <Text style={styles.statValue}>{areasMapped}</Text>
                <Text style={styles.statTitle}>Areas Mapped</Text>
              </View>
            </View>
          )}
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>

          {loading ? (
            <View style={{ paddingVertical: 10 }}>
              <ActivityIndicator />
            </View>
          ) : recent.length === 0 ? (
            <Text style={{ color: '#6B7280' }}>No recent reports.</Text>
          ) : (
            recent.map((item) => {
              const sev = item.severity ?? 0;
              const sevColor = sev >= 4 ? '#DC2626' : sev >= 3 ? '#F59E0B' : '#16A34A';
              return (
                <View key={item.id} style={styles.activityItem}>
                  <View style={[styles.severityDot, { backgroundColor: sevColor }]} />
                  <View style={styles.activityContent}>
                    <Text style={styles.activityType}>
                      {String(item.crime_type ? item.crime_type.charAt(0).toUpperCase() + item.crime_type.slice(1) : 'Unknown')}
                    </Text>
                    <Text style={styles.activityArea}>{String(item.area_name || '—')}</Text>
                  </View>
                  <Text style={styles.activityTime}>{String(timeAgo(item.created_at))}</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Safety Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Tips</Text>
          <View style={styles.tipCard}>
            <Text style={styles.tipText}>
              • Avoid isolated areas, especially after dark{'\n'}
              • Stay alert and aware of your surroundings{'\n'}
              • Use well-lit, busy routes when possible{'\n'}
              • Trust your instincts and report suspicious activity
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20 },
  headerContent: { alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginBottom: 4 },
  headerSubtitle: { fontSize: 16, color: '#FCA5A5' },
  content: { flex: 1, paddingHorizontal: 20, marginTop: 0 },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: '#1F2937', marginBottom: 12, marginTop: 8 },

  quickActions: { flexDirection: 'row', justifyContent: 'space-between' },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionText: { fontSize: 12, fontWeight: '500', color: '#374151', textAlign: 'center', marginTop: 8 },

  statsGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '48%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#1F2937', marginTop: 8 },
  statTitle: { fontSize: 12, color: '#6B7280', textAlign: 'center', marginTop: 4 },

  activityItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  severityDot: { width: 8, height: 8, borderRadius: 4, marginRight: 12 },
  activityContent: { flex: 1 },
  activityType: { fontSize: 14, fontWeight: '600', color: '#1F2937' },
  activityArea: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  activityTime: { fontSize: 12, color: '#9CA3AF' },

  tipCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#16A34A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tipText: { fontSize: 14, color: '#374151', lineHeight: 20 },
});
