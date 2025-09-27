import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TriangleAlert as AlertTriangle, Car, MapPin, Shield, TrendingDown } from 'lucide-react-native';
import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
// If you don't use supabase on this screen, feel free to remove the next line
// import { supabase } from '../../lib/supabase';

export default function HomeScreen() {
  const stats = [
    { title: 'Total Reports', value: '122', icon: AlertTriangle, color: '#DC2626' },
    { title: 'Safe Routes', value: '847', icon: Shield, color: '#16A34A' },
    { title: 'Areas Mapped', value: '25', icon: MapPin, color: '#2563EB' },
    { title: 'Crime Reduction', value: '15%', icon: TrendingDown, color: '#059669' },
  ];

  const recentActivity = [
    { type: 'Mugging', area: 'Dhanmondi', time: '2 hours ago', severity: 'medium' },
    { type: 'Theft', area: 'Uttara', time: '5 hours ago', severity: 'low' },
    { type: 'Assault', area: 'Mohammadpur', time: '1 day ago', severity: 'high' },
  ];

  // IMPORTANT: push to the route group explicitly so Expo Router resolves correctly
const navigateToRoutes   = () => router.push('(tabs)/routes');    // no leading slash
const navigateToCrimeMap = () => router.push('(tabs)/crimemap');
const navigateToReport   = () => router.push('(tabs)/report');


  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Header */}
      <LinearGradient
        colors={['#DC2626', '#B91C1C']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <Car size={28} color="#FFFFFF" style={{ marginBottom: 8 }} />
          <Text style={styles.headerTitle}>Dhaka Safety</Text>
          <Text style={styles.headerSubtitle}>Travel Safe, Stay Informed</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
          <View style={styles.statsGrid}>
            {stats.map((stat, index) => (
              <View key={index} style={styles.statCard}>
                <stat.icon size={20} color={stat.color} />
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statTitle}>{stat.title}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          {recentActivity.map((item, index) => (
            <View key={index} style={styles.activityItem}>
              <View
                style={[
                  styles.severityDot,
                  {
                    backgroundColor:
                      item.severity === 'high'
                        ? '#DC2626'
                        : item.severity === 'medium'
                        ? '#F59E0B'
                        : '#16A34A',
                  },
                ]}
              />
              <View style={styles.activityContent}>
                <Text style={styles.activityType}>{item.type}</Text>
                <Text style={styles.activityArea}>{item.area}</Text>
              </View>
              <Text style={styles.activityTime}>{item.time}</Text>
            </View>
          ))}
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
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 60,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  headerContent: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#FCA5A5',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 0,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
    marginTop: 8,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
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
  actionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    textAlign: 'center',
    marginTop: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    width: '48%',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
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
  severityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  activityContent: {
    flex: 1,
  },
  activityType: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  activityArea: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  activityTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
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
  tipText: {
    fontSize: 14,
    color: '#374151',
    lineHeight: 20,
  },
});
