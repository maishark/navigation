import { Tabs } from "expo-router";
import { TriangleAlert as AlertTriangle, Chrome as Home, MapPin, Shield } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../providers/AuthProvider";


export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth(); // gives you user?.email


  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        // ⬇️ change from string to a component so we can show the email
        headerTitle: () => (
          <View>
            <Text style={{ fontWeight: "700", fontSize: 16 }}>Safeways</Text>
            {!!user?.email && (
              <Text style={{ fontSize: 12, color: "#6B7280" }}>
                Signed in: {user.email}
              </Text>
            )}
          </View>
        ),
        headerRight: () => (
          <Pressable
            onPress={async () => { await supabase.auth.signOut(); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <Text style={{ fontWeight: "700" }}>Sign out</Text>
          </Pressable>
        ),
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          height: 65 + insets.bottom,
        },
        tabBarActiveTintColor: "#DC2626",
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: { fontSize: 12, fontWeight: "500", marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ size, color }) => <Home size={size} color={color} /> }} />
      <Tabs.Screen name="routes" options={{ title: "Safe Routes", tabBarIcon: ({ size, color }) => <Shield size={size} color={color} /> }} />
      <Tabs.Screen name="crimemap" options={{ title: "Crime Map", tabBarIcon: ({ size, color }) => <MapPin size={size} color={color} /> }} />
      <Tabs.Screen name="report" options={{ title: "Report", tabBarIcon: ({ size, color }) => <AlertTriangle size={size} color={color} /> }} />
    </Tabs>
  );
}
