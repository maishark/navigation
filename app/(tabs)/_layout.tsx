import { Tabs } from "expo-router";
import { TriangleAlert as AlertTriangle, Chrome as Home, MapPin, Shield } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          height: 65 + insets.bottom, // dynamically add safe area padding
        },
        tabBarActiveTintColor: "#DC2626",
        tabBarInactiveTintColor: "#6B7280",
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: "500",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ size, color }) => <Home size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: "Safe Routes",
          tabBarIcon: ({ size, color }) => <Shield size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="crimemap"
        options={{
          title: "Crime Map",
          tabBarIcon: ({ size, color }) => <MapPin size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Report",
          tabBarIcon: ({ size, color }) => <AlertTriangle size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
