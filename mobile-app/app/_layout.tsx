import "@/global.css";
import { Stack } from "expo-router";
import { ThemeProvider } from "@/lib/theme-provider";
import { TipsStoreProvider } from "@/lib/tips-store";
import { PushNotificationManager } from "@/components/push-notification-manager";

export default function RootLayout() {
  return <ThemeProvider><TipsStoreProvider><PushNotificationManager/><Stack screenOptions={{ headerShown: false }}><Stack.Screen name="(tabs)"/><Stack.Screen name="auth" options={{ presentation: "modal" }}/><Stack.Screen name="checkout" options={{ presentation: "modal" }}/></Stack></TipsStoreProvider></ThemeProvider>;
}
