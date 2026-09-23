import { useEffect } from "react";
import { Alert, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { registerCustomerPushToken } from "@/lib/tips-api";
import { useTipsStore } from "@/lib/tips-store";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

async function createExpoToken() {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("orders", { name: "حالة الطلبات", importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 180, 250], lightColor: "#1E5FA8", sound: "default" });
  }
  const permissions = await Notifications.getPermissionsAsync();
  let status = permissions.status;
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;
  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

export function PushNotificationManager() {
  const { session } = useTipsStore();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === "web") return;
    const openOrder = (notification: Notifications.Notification) => {
      const url = notification.request.content.data?.url;
      if (url === "/orders") router.push("/orders");
    };
    void Notifications.getLastNotificationResponseAsync().then((response) => { if (response?.notification) openOrder(response.notification); });
    const listener = Notifications.addNotificationResponseReceivedListener((response) => openOrder(response.notification));
    return () => listener.remove();
  }, [router]);

  useEffect(() => {
    if (!session) return;
    void createExpoToken().then(async (token) => {
      if (!token) return;
      await registerCustomerPushToken(session, token, Platform.OS as "ios" | "android", Device.modelName).catch(() => {
        Alert.alert("تعذر تفعيل الإشعارات", "يمكنك متابعة الطلب من صفحة طلباتي، ثم حاولي تفعيل الإشعارات لاحقاً من إعدادات الهاتف.");
      });
    }).catch(() => undefined);
  }, [session?.access_token, session?.user.id]);

  return null;
}
