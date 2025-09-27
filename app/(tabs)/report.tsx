// app/(tabs)/report.tsx
import DateTimePicker from '@react-native-community/datetimepicker';
import { LinearGradient } from 'expo-linear-gradient';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import {
  TriangleAlert as AlertTriangle,
  Camera,
  ChevronDown,
  MapPin,
  Search as SearchIcon,
  Send,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { supabase } from '../../lib/supabase';

type LatLng = { latitude: number; longitude: number };

const BASE_TYPES = [
  'mugging',
  'theft',
  'assault',
  'robbery',
  'harassment',
  'vandalism',
  'other',
] as const;

export default function ReportCrimeScreen() {
  // form state
  const [crimeType, setCrimeType] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [gender, setGender] = useState<'male' | 'female' | 'unknown'>('unknown');

  // “Other” secondary type list
  const [otherTypes, setOtherTypes] = useState<string[]>([]);
  const [selectedOther, setSelectedOther] = useState<string>('');
  const [showOtherPicker, setShowOtherPicker] = useState(false);

  const [locationText, setLocationText] = useState<string>('');
  const [currentLocation, setCurrentLocation] = useState<LatLng | null>(null);
  const [markerLocation, setMarkerLocation] = useState<LatLng | null>(null);
  const [areaName, setAreaName] = useState<string | null>(null);

  // search by place name
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<
    { name: string; latitude: number; longitude: number }[]
  >([]);

  // exact date/time (NOW REQUIRED)
  const [pickedAt, setPickedAt] = useState<Date | null>(null);
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const crimeTypes = [
    { id: 'mugging', name: 'Mugging', icon: '👤', color: '#F59E0B' },
    { id: 'theft', name: 'Theft', icon: '🎒', color: '#D97706' },
    { id: 'assault', name: 'Assault', icon: '👊', color: '#EA580C' },
    { id: 'robbery', name: 'Robbery', icon: '💰', color: '#DC2626' },
    { id: 'harassment', name: 'Harassment', icon: '😰', color: '#7C2D12' },
    { id: 'vandalism', name: 'Vandalism', icon: '🔨', color: '#92400E' },
    { id: 'other', name: 'Other', icon: '❓', color: '#6B7280' },
  ];

  useEffect(() => {
    getCurrentLocation();
    // Fetch “other” list from existing dataset
    (async () => {
      const { data, error } = await supabase
        .from('reports')
        .select('crime_type')
        .not('crime_type', 'is', null);
      if (!error && data) {
        const baseSet = new Set(BASE_TYPES);
        const uniq = Array.from(
          new Set(
            (data as any[])
              .map((r) => (r.crime_type || '').toString().trim().toLowerCase())
              .filter((s) => s && !baseSet.has(s as any))
          )
        ).sort();
        setOtherTypes(uniq);
      }
    })();
  }, []);

  const formatAddress = (addr: Partial<Location.LocationGeocodedAddress>) => {
    // Try to produce: "Road 6, Dhanmondi, Dhaka"
    const parts = [
      addr.street || addr.name,         // street or POI name
      addr.district || addr.subregion,  // area (e.g., Dhanmondi)
      addr.city || addr.region,         // city/region
    ].filter(Boolean);
    return parts.join(', ');
  };

  const getCurrentLocation = async () => {
    try {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) {
        Alert.alert('Location is off', 'Turn on Location Services in Settings and try again.');
        return;
      }
      let perm = await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        perm = await Location.requestForegroundPermissionsAsync();
      }
      if (perm.status !== 'granted') {
        Alert.alert('Permission denied', 'Please allow location access to use this feature.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
        maximumAge: 5000,
        timeout: 20000,
      });

      const { latitude, longitude } = loc.coords;
      setCurrentLocation({ latitude, longitude });
      setMarkerLocation({ latitude, longitude });

      try {
        const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const nice = addr ? formatAddress(addr) : null;
        setAreaName(nice || addr?.name || null);
        setLocationText(
          `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${nice ? ` (${nice})` : ''}`
        );
      } catch {
        setLocationText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
      }
    } catch (e) {
      console.warn('getCurrentLocation error', e);
      Alert.alert(
        'Current location unavailable',
        'Turn on GPS / Wi-Fi based location and try again, or search by place name below.'
      );
    }
  };

  const useCurrentLocation = () => {
    if (!currentLocation) {
      Alert.alert('Location not available', 'Please enable location services and try again.');
      return;
    }
    setMarkerLocation(currentLocation);
    setLocationText(
      `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}${
        areaName ? ` (${areaName})` : ''
      }`
    );
  };

  // Forward geocode a human-friendly place name to coordinates
  const searchPlaces = async () => {
    if (!searchQuery.trim()) return;
    try {
      setSearching(true);
      const results = await Location.geocodeAsync(searchQuery.trim());
      const mapped = results.slice(0, 8).map((r) => ({
        name:
          [
            r.name,
            r.street,
            r.district,
            r.city,
            r.region,
          ]
            .filter(Boolean)
            .join(', ') || searchQuery.trim(),
        latitude: r.latitude!,
        longitude: r.longitude!,
      }));
      setSearchResults(mapped);
    } catch (e) {
      Alert.alert('Search failed', 'Could not find that place. Try a more specific name.');
    } finally {
      setSearching(false);
    }
  };

  const selectSearchResult = async (item: { name: string; latitude: number; longitude: number }) => {
    setMarkerLocation({ latitude: item.latitude, longitude: item.longitude });
    setLocationText(`${item.latitude.toFixed(6)}, ${item.longitude.toFixed(6)} (${item.name})`);
    setSearchResults([]);
    // reverse geocode for better label
    try {
      const [addr] = await Location.reverseGeocodeAsync({
        latitude: item.latitude,
        longitude: item.longitude,
      });
      const nice = addr ? formatAddress(addr) : null;
      setAreaName(nice || addr?.name || null);
    } catch {}
  };

  // Draggable marker -> nicer reverse geocoded label
  const onDragEndMarker = async (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setMarkerLocation({ latitude, longitude });
    try {
      const [addr] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const nice = addr ? formatAddress(addr) : null;
      setAreaName(nice || addr?.name || null);
      setLocationText(
        `${latitude.toFixed(6)}, ${longitude.toFixed(6)}${nice ? ` (${nice})` : ''}`
      );
    } catch {
      setLocationText(`${latitude.toFixed(6)}, ${longitude.toFixed(6)}`);
    }
  };

  // parse "lat, lon" (fallback to marker, then GPS)
  const parseLatLon = (): { lat: number; lon: number } | null => {
    if (markerLocation?.latitude && markerLocation?.longitude) {
      return { lat: markerLocation.latitude, lon: markerLocation.longitude };
    }
    const parts = locationText.split(',').map((s) => s.trim());
    if (parts.length >= 2) {
      const pLat = parseFloat(parts[0]);
      const pLon = parseFloat(parts[1]);
      if (!Number.isNaN(pLat) && !Number.isNaN(pLon)) {
        return { lat: pLat, lon: pLon };
      }
    }
    if (currentLocation) return { lat: currentLocation.latitude, lon: currentLocation.longitude };
    return null;
  };

  // handlers for exact date/time (REQUIRED)
  const openDatePicker = () => setShowDate(true);
  const openTimePicker = () => {
    if (!pickedAt) setPickedAt(new Date());
    setShowTime(true);
  };
  const onChangeDate = (_: any, selected?: Date) => {
    setShowDate(Platform.OS === 'ios');
    if (selected) {
      const base = pickedAt ?? new Date();
      const merged = new Date(base);
      merged.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      setPickedAt(merged);
      if (Platform.OS === 'android') setTimeout(openTimePicker, 50);
    }
  };
  const onChangeTime = (_: any, selected?: Date) => {
    setShowTime(Platform.OS === 'ios');
    if (selected) {
      const base = pickedAt ?? new Date();
      const merged = new Date(base);
      merged.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      setPickedAt(merged);
    }
  };

  const effectiveCrimeType = useMemo(() => {
    if (crimeType !== 'other') return crimeType;
    return selectedOther || 'other';
  }, [crimeType, selectedOther]);

  const submitReport = async () => {
    if (!crimeType) {
      Alert.alert('Missing information', 'Please select a crime type.');
      return;
    }
    if (crimeType === 'other' && !selectedOther) {
      Alert.alert('Specify type', 'Please choose a specific type for “Other”.');
      setShowOtherPicker(true);
      return;
    }
    const coords = parseLatLon();
    if (!coords) {
      Alert.alert('Invalid location', 'Pick on the map, search a place, or enter "lat, lon".');
      return;
    }
    if (!pickedAt) {
      Alert.alert('Time required', 'Please pick the exact date and time of the incident.');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: any = {
        crime_type: effectiveCrimeType.trim().toLowerCase(),
        description: description ? description.slice(0, 500) : null,
        lat: coords.lat,
        lon: coords.lon,
        area_name: areaName ?? null,
        gender,
        created_at: pickedAt.toISOString(), // REQUIRED now
      };

      const { error } = await supabase.from('reports').insert(payload);
      if (error) throw error;

      Alert.alert('Report submitted', 'Thank you. Your report will appear shortly.');
      // reset (keep marker/location so multiple reports are faster)
      setCrimeType('');
      setSelectedOther('');
      setDescription('');
      setGender('unknown');
      setPickedAt(null);
    } catch (e: any) {
      Alert.alert('Failed', e.message || 'Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <LinearGradient colors={['#DC2626', '#B91C1C']} style={styles.header}>
        <View style={styles.headerContent}>
          <AlertTriangle size={28} color="#FFFFFF" />
          <Text style={styles.headerTitle}>Report Crime</Text>
          <Text style={styles.headerSubtitle}>Help keep your community safe</Text>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Emergency */}
        <View style={styles.emergencyNotice}>
          <AlertTriangle size={20} color="#DC2626" />
          <View style={styles.emergencyContent}>
            <Text style={styles.emergencyTitle}>Emergency?</Text>
            <Text style={styles.emergencyText}>If this is an emergency, please call 999 immediately</Text>
          </View>
        </View>

        {/* Crime Type */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Crime Type *</Text>
          <View style={styles.crimeTypesGrid}>
            {crimeTypes.map((t) => {
              const active = crimeType === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => {
                    setCrimeType(t.id);
                    if (t.id === 'other') setShowOtherPicker(true);
                  }}
                  style={[
                    styles.crimeTypeButton,
                    { borderColor: active ? t.color : '#E5E7EB', backgroundColor: active ? '#FFF7ED' : '#FFFFFF' },
                  ]}
                >
                  <Text style={styles.crimeTypeEmoji}>{t.icon}</Text>
                  <Text
                    style={[
                      styles.crimeTypeText,
                      { color: active ? '#1F2937' : '#6B7280', fontWeight: active ? '700' as const : '500' as const },
                    ]}
                  >
                    {t.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* “Other” secondary picker preview */}
          {crimeType === 'other' && (
            <TouchableOpacity style={styles.otherPickerBtn} onPress={() => setShowOtherPicker(true)}>
              <Text style={styles.otherPickerText}>
                {selectedOther ? `Selected: ${selectedOther}` : 'Choose specific type'}
              </Text>
              <ChevronDown size={16} color="#374151" />
            </TouchableOpacity>
          )}
        </View>

        {/* Gender */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Gender (optional)</Text>
          <View style={styles.genderRow}>
            {(['male', 'female', 'unknown'] as const).map((g) => {
              const active = gender === g;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  style={[styles.genderBtn, active && styles.genderBtnActive]}
                >
                  <Text style={[styles.genderText, active && styles.genderTextActive]}>
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Location (search + current + draggable map) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Location *</Text>

          {/* Search bar */}
          <View style={styles.searchRow}>
            <SearchIcon size={18} color="#6B7280" />
            <TextInput
              style={styles.searchInput}
              placeholder='Search place (e.g., "Dhanmondi Road 6", "Gulshan 2")'
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholderTextColor="#9CA3AF"
              returnKeyType="search"
              onSubmitEditing={searchPlaces}
            />
            <TouchableOpacity onPress={searchPlaces} style={styles.searchBtn} disabled={searching}>
              <Text style={styles.searchBtnText}>{searching ? '...' : 'Search'}</Text>
            </TouchableOpacity>
          </View>

          {/* Search results list — NO FlatList here (avoids nested VirtualizedList) */}
          {searchResults.length > 0 && (
            <View style={styles.resultsBox}>
              <ScrollView style={{ maxHeight: 200 }}>
                {searchResults.map((item, i) => (
                  <TouchableOpacity key={i} style={styles.resultItem} onPress={() => selectSearchResult(item)}>
                    <MapPin size={16} color="#DC2626" />
                    <Text style={styles.resultText}>{item.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Manual entry / current button */}
          <View style={styles.inputContainer}>
            <MapPin size={20} color="#DC2626" style={styles.inputIcon} />
            <TextInput
              style={styles.textInput}
              placeholder='e.g. 23.8122, 90.4281'
              value={locationText}
              onChangeText={setLocationText}
              placeholderTextColor="#9CA3AF"
              multiline
            />
            <TouchableOpacity onPress={useCurrentLocation} style={styles.locationBtn}>
              <Text style={styles.locationBtnText}>Current</Text>
            </TouchableOpacity>
          </View>
          {!!areaName && <Text style={{ marginTop: 6, color: '#6B7280' }}>Area: {areaName}</Text>}

          {/* Mini map with draggable marker */}
          <View style={styles.mapBox}>
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: markerLocation?.latitude ?? 23.78,
                longitude: markerLocation?.longitude ?? 90.41,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
            >
              {markerLocation && (
                <Marker
                  draggable
                  coordinate={markerLocation}
                  onDragEnd={onDragEndMarker}
                />
              )}
            </MapView>
          </View>
          <Text style={styles.mapHint}>Drag the pin to adjust the exact spot.</Text>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Description (optional)</Text>
          <View style={styles.descriptionContainer}>
            <TextInput
              style={styles.descriptionInput}
              placeholder="What happened? Include time, people involved, identifiers…"
              value={description}
              onChangeText={setDescription}
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
            />
          </View>
        </View>

        {/* Exact Date & Time (REQUIRED) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When did this happen? *</Text>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <TouchableOpacity style={styles.pickExactBtn} onPress={openDatePicker}>
              <Text style={styles.pickExactText}>{pickedAt ? 'Change date' : 'Pick date'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pickExactBtn} onPress={openTimePicker}>
              <Text style={styles.pickExactText}>{pickedAt ? 'Change time' : 'Pick time'}</Text>
            </TouchableOpacity>
          </View>

          {pickedAt && <Text style={{ color: '#374151', marginTop: 6 }}>Selected: {pickedAt.toLocaleString()}</Text>}
          {!pickedAt && <Text style={{ color: '#B91C1C', marginTop: 6, fontSize: 12 }}>Required</Text>}

          {showDate && (
            <DateTimePicker
              value={pickedAt ?? new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeDate}
              maximumDate={new Date()}
            />
          )}
          {showTime && (
            <DateTimePicker
              value={pickedAt ?? new Date()}
              mode="time"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={onChangeTime}
            />
          )}
        </View>

        {/* Photo (placeholder) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Add Photos (not enabled)</Text>
          <TouchableOpacity
            style={styles.photoUploadBtn}
            onPress={() => Alert.alert('Not available', 'Photo uploads are not enabled in this version.')}
          >
            <Camera size={24} color="#6B7280" />
            <Text style={styles.photoUploadText}>Add photos or evidence</Text>
          </TouchableOpacity>
        </View>

        {/* Anonymous note */}
        <View style={styles.section}>
          <View style={styles.anonymousCard}>
            <Text style={styles.anonymousTitle}>Anonymous Reporting</Text>
            <Text style={styles.anonymousText}>
              Your report is anonymous. We do not collect personal identifiers.
            </Text>
          </View>
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
          onPress={submitReport}
          disabled={isSubmitting}
        >
          <Send size={20} color="#FFFFFF" />
          <Text style={styles.submitButtonText}>{isSubmitting ? 'Submitting…' : 'Submit Report'}</Text>
        </TouchableOpacity>

        {/* Tips */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Safety Tips</Text>
          <View style={styles.tipsCard}>
            <Text style={styles.tipsText}>
              • Only report crimes you directly witnessed{'\n'}
              • Don’t put yourself in danger to gather info{'\n'}
              • Provide as much detail as possible{'\n'}
              • Call emergency services first in urgent situations
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Modal: “Other” types — NO FlatList (avoid nested VirtualizedList) */}
      <Modal visible={showOtherPicker} transparent animationType="slide" onRequestClose={() => setShowOtherPicker(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose specific type</Text>
            <ScrollView style={{ maxHeight: '60%', marginTop: 8 }}>
              {otherTypes.length === 0 ? (
                <Text style={{ color: '#6B7280', marginTop: 8 }}>No additional types found.</Text>
              ) : (
                otherTypes.map((item) => (
                  <TouchableOpacity
                    key={item}
                    style={[styles.modalItem, selectedOther === item && styles.modalItemActive]}
                    onPress={() => setSelectedOther(item)}
                  >
                    <Text style={[styles.modalItemText, selectedOther === item && styles.modalItemTextActive]}>
                      {item.charAt(0).toUpperCase() + item.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: '#F3F4F6' }]} onPress={() => setShowOtherPicker(false)}>
                <Text style={{ color: '#111827', fontWeight: '600' }}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => setShowOtherPicker(false)}
                disabled={!selectedOther}
              >
                <Text style={{ color: 'white', fontWeight: '700' }}>{selectedOther ? 'Use type' : 'Pick one'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  header: { paddingTop: 60, paddingBottom: 30, paddingHorizontal: 20 },
  headerContent: { alignItems: 'center' },
  headerTitle: { fontSize: 28, fontWeight: 'bold', color: '#FFFFFF', marginTop: 8, marginBottom: 4 },
  headerSubtitle: { fontSize: 16, color: '#FCA5A5', textAlign: 'center' },
  content: { flex: 1, paddingHorizontal: 20, marginTop: 0 },

  emergencyNotice: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginTop: 8,
  },
  emergencyContent: { flex: 1, marginLeft: 12 },
  emergencyTitle: { fontSize: 14, fontWeight: '600', color: '#DC2626', marginBottom: 2 },
  emergencyText: { fontSize: 12, color: '#7F1D1D' },

  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 12 },

  crimeTypesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  crimeTypeButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    width: '30%',
    marginBottom: 12,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  crimeTypeEmoji: { fontSize: 24, marginBottom: 6 },
  crimeTypeText: { fontSize: 11, textAlign: 'center' },

  otherPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  otherPickerText: { color: '#374151', fontWeight: '600', flex: 1 },

  genderRow: { flexDirection: 'row', gap: 8 },
  genderBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  genderBtnActive: { borderColor: '#2563EB', backgroundColor: '#EFF6FF' },
  genderText: { color: '#374151', fontWeight: '600' },
  genderTextActive: { color: '#1D4ED8', fontWeight: '700' },

  // Location searching
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2937' },
  searchBtn: { backgroundColor: '#2563EB', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  searchBtnText: { color: '#FFFFFF', fontWeight: '700' },
  resultsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginBottom: 8,
  },
  resultItem: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  resultText: { color: '#111827', flex: 1 },

  // manual/current
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  inputIcon: { marginRight: 12 },
  textInput: { flex: 1, fontSize: 16, color: '#1F2937' },
  locationBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F3F4F6', borderRadius: 6 },
  locationBtnText: { fontSize: 12, color: '#DC2626', fontWeight: '500' },

  mapBox: { height: 180, marginTop: 12, borderRadius: 12, overflow: 'hidden', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  mapHint: { color: '#6B7280', fontSize: 12, marginTop: 6 },

  descriptionContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  descriptionInput: { fontSize: 16, color: '#1F2937', minHeight: 120 },

  pickExactBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2563EB',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  pickExactText: { color: '#2563EB', fontWeight: '700' },

  photoUploadBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderStyle: 'dashed',
  },
  photoUploadText: { fontSize: 14, color: '#6B7280', marginTop: 8 },

  anonymousCard: { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#BAE6FD' },
  anonymousTitle: { fontSize: 14, fontWeight: '600', color: '#0369A1', marginBottom: 4 },
  anonymousText: { fontSize: 12, color: '#075985', lineHeight: 16 },

  submitButton: {
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonDisabled: { backgroundColor: '#9CA3AF' },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600', marginLeft: 8 },

  tipsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tipsText: { fontSize: 14, color: '#374151', lineHeight: 20 },

  // modal
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '70%' },
  modalTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  modalItem: { paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8 },
  modalItemActive: { backgroundColor: '#EEF2FF' },
  modalItemText: { color: '#111827' },
  modalItemTextActive: { color: '#1D4ED8', fontWeight: '700' },
  modalBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 10 },
});
