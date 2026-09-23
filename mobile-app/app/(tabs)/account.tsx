import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { useTipsStore } from "@/lib/tips-store";
import { getCustomerPreferences, type CustomerPreferences } from "@/lib/tips-api";

const LOGO = require("../../assets/images/tips-logo.png");
const AVATAR_DEFAULT = require("../../assets/images/hero-makeup-model.jpg");

const actions = [
  { icon: "person-outline" as const, label: "تخصيص ملف الجمال والاهتمامات", route: "/setup-profile", color: "#be185d" },
  { icon: "favorite-border" as const, label: "منتجاتي المفضلة", route: "/favorites", color: "#dc426d" },
  { icon: "stars" as const, label: "نقاط الجمال", route: "/loyalty", color: "#b7791f" },
  { icon: "notifications-none" as const, label: "مركز الإشعارات", route: "/notifications", color: "#1e5fa8" },
  { icon: "group-add" as const, label: "كود الإحالة", route: "/referrals", color: "#0f9f8f" },
  { icon: "trending-up" as const, label: "برنامج المسوقات", route: "/affiliate", color: "#8b5cf6" },
  { icon: "local-shipping" as const, label: "تتبع الطلب", route: "/track-order", color: "#1e5fa8" },
  { icon: "assignment-return" as const, label: "المرتجعات والاستبدال", route: "/returns", color: "#8b5cf6" },
  { icon: "auto-awesome" as const, label: "مساعدي الذكي", route: "/ai-chat", color: "#dc426d" },
];
export default function AccountScreen() {
  const { session, setSession, configured } = useTipsStore();
  const [points, setPoints] = useState<number | null>(null);
  const [prefs, setPrefs] = useState<CustomerPreferences | null>(null);

  useEffect(() => {
    if (!session) return;
    void fetchProfile(session)
      .then((profile) => setPoints(Number(profile.beauty_points || 0)))
      .catch(() => setPoints(null));
    void getCustomerPreferences(session).then((p) => setPrefs(p));
  }, [session]);

  if (!session) {
    return (
      <ScreenContainer edges={["top", "bottom", "left", "right"]} containerClassName="bg-[#f7f8fc]">
        <View style={styles.guest}>
          <View style={styles.guestLogo}>
            <Image source={LOGO} style={styles.guestLogoImg} resizeMode="contain" />
          </View>
          <Text style={styles.title}>أهلاً بك في تيبس بيوتي</Text>
          <Text style={styles.text}>
            {configured
              ? "سجّلي الدخول لإتمام الطلبات ومتابعتها واستخدام نقاط الجمال."
              : "أكملي إعداد التطبيق لبدء تجربة تيبس بيوتي."}
          </Text>
          <Pressable
            onPress={() => router.push("/auth" as never)}
            style={styles.primary}
          >
            <Text style={styles.primaryText}>دخول أو إنشاء حساب</Text>
          </Pressable>
        </View>
      </ScreenContainer>
    );
  }

  const displayName = preferences?.fullName || prefs?.fullName || session.user.user_metadata?.full_name || session.user.email || "عميلة تيبس";

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#f7f8fc]">
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.profileHeader}>
          <Image source={AVATAR_DEFAULT} style={styles.avatarImg} />
          <View style={styles.profileText}>
            <Text style={styles.hello}>مرحباً بكِ ✨</Text>
            <Text style={styles.email}>{displayName}</Text>
            {preferences?.skinType ? (
              <View style={styles.beautyTagsRow}>
                <View style={styles.tagBadge}>
                  <Text style={styles.tagBadgeText}>بشرة {preferences.skinType}</Text>
                </View>
                {preferences.city ? (
                  <View style={styles.tagBadge}>
                    <Text style={styles.tagBadgeText}>{preferences.city}</Text>
                  </View>
                ) : null}
                {preferences.concerns?.[0] ? (
                  <View style={styles.tagBadge}>
                    <Text style={styles.tagBadgeText}>{preferences.concerns[0]}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
          <Pressable onPress={() => void setSession(null)} hitSlop={8}>
            <MaterialIcons name="logout" size={22} color="#dc426d" />
          </Pressable>
        </View>

        <View style={styles.points}>
          <View>
            <Text style={styles.pointsLabel}>رصيد نقاط الجمال</Text>
            <Text style={styles.pointsValue}>
              {points === null ? <ActivityIndicator color="white" /> : `${points.toLocaleString()} نقطة`}
            </Text>
            <Text style={styles.pointsHint}>اكتسبي نقاطاً مع كل طلب مكتمل</Text>
          </View>
          <MaterialIcons name="stars" size={50} color="#dbeafe" />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>اختصارات حسابك</Text>
        </View>

        <View style={styles.grid}>
          {actions.map((action) => (
            <Pressable
              key={action.route}
              onPress={() => router.push(action.route as never)}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}
            >
              <View style={[styles.actionIcon, { backgroundColor: `${action.color}18` }]}>
                <MaterialIcons name={action.icon} size={23} color={action.color} />
              </View>
              <Text style={styles.actionText}>{action.label}</Text>
              <MaterialIcons name="chevron-left" size={18} color="#94a3b8" />
            </Pressable>
          ))}
        </View>

        <View style={styles.notice}>
          <MaterialIcons name="verified-user" size={21} color="#17835e" />
          <Text style={styles.noticeText}>بياناتك محفوظة بأمان، ويمكنك متابعة الدفع والتوصيل من حسابك.</Text>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}
const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 35 },
  guest: { flex: 1, padding: 25, alignItems: "center", justifyContent: "center", gap: 12 },
  guestLogo: { width: 88, height: 88, borderRadius: 24, backgroundColor: "white", justifyContent: "center", alignItems: "center", borderWidth: 1, borderColor: "#ffe4e6", shadowColor: "#e11d48", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 3 },
  guestLogoImg: { width: 68, height: 68 },
  title: { color: "#16213e", fontSize: 23, fontWeight: "900", marginTop: 5, textAlign: "center" },
  text: { color: "#64748b", textAlign: "center", lineHeight: 22 },
  primary: { backgroundColor: "#be185d", marginTop: 8, borderRadius: 13, paddingVertical: 14, paddingHorizontal: 22, flexDirection: "row-reverse", justifyContent: "center", shadowColor: "#be185d", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 3 },
  primaryText: { color: "white", fontWeight: "900" },
  profileHeader: { backgroundColor: "white", borderRadius: 19, padding: 14, flexDirection: "row-reverse", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#ffe4e6", shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  avatarImg: { width: 54, height: 54, borderRadius: 27, borderWidth: 2, borderColor: "#be185d" },
  profileText: { flex: 1 },
  hello: { color: "#94a3b8", fontSize: 11, textAlign: "right" },
  email: { color: "#16213e", fontSize: 15, fontWeight: "800", textAlign: "right", marginTop: 4 },
  beautyTagsRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginTop: 8 },
  tagBadge: { backgroundColor: "#fff1f2", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: "#ffe4e6" },
  tagBadgeText: { color: "#be185d", fontSize: 10, fontWeight: "800" },
  points: { backgroundColor: "#1e1b4b", padding: 20, borderRadius: 22, marginTop: 14, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" },
  pointsLabel: { color: "#fce7f3", fontSize: 13, textAlign: "right" },
  pointsValue: { color: "white", fontSize: 26, fontWeight: "900", marginTop: 5, textAlign: "right" },
  pointsHint: { color: "#fbcfe8", fontSize: 11, marginTop: 6, textAlign: "right" },
  sectionHeader: { marginTop: 22, marginBottom: 10 },
  sectionTitle: { color: "#16213e", fontWeight: "900", fontSize: 18, textAlign: "right" },
  grid: { gap: 9 },
  action: { backgroundColor: "white", borderRadius: 16, padding: 13, flexDirection: "row-reverse", alignItems: "center", gap: 10, borderWidth: 1, borderColor: "#ffe4e6" },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionText: { flex: 1, color: "#334155", fontWeight: "800", textAlign: "right", fontSize: 13 },
  notice: { flexDirection: "row-reverse", alignItems: "center", gap: 9, backgroundColor: "#ecfdf5", padding: 14, borderRadius: 15, marginTop: 17 },
  noticeText: { flex: 1, color: "#047857", fontSize: 11, textAlign: "right", lineHeight: 18 },
  pressed: { opacity: 0.8, transform: [{ scale: 0.99 }] },
});
