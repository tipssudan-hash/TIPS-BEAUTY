import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { useTipsStore } from "@/lib/tips-store";
import { getCartItemCount } from "@/lib/cart-utils";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { cart } = useTipsStore();
  const cartCount = getCartItemCount(cart);
  const bottomPadding = Platform.OS === "web" ? 9 : Math.max(insets.bottom, 8);
  return <Tabs screenOptions={{ headerShown: false, tabBarButton: HapticTab, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: "#94a3b8", tabBarLabelStyle: { fontSize: 11, fontWeight: "700" }, tabBarStyle: { paddingTop: 7, paddingBottom: bottomPadding, height: 58 + bottomPadding, backgroundColor: "#ffffff", borderTopColor: "#e5eaf1", borderTopWidth: 1 } }}>
    <Tabs.Screen name="index" options={{ title: "الرئيسية", tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} /> }} />
    <Tabs.Screen name="cart" options={{ title: "السلة", tabBarBadge: cartCount || undefined, tabBarBadgeStyle: { backgroundColor: "#dc426d", color: "#fff", fontSize: 10, fontWeight: "800" }, tabBarIcon: ({ color }) => <IconSymbol size={24} name="cart.fill" color={color} /> }} />
    <Tabs.Screen name="orders" options={{ title: "طلباتي", tabBarIcon: ({ color }) => <IconSymbol size={24} name="bag.fill" color={color} /> }} />
    <Tabs.Screen name="account" options={{ title: "حسابي", tabBarIcon: ({ color }) => <IconSymbol size={24} name="person.fill" color={color} /> }} />
  </Tabs>;
}
