import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { router } from "expo-router";

export function CartFeedback({
  visible,
  message,
  onClose,
}: {
  visible: boolean;
  message: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onClose, 2800);
    return () => clearTimeout(timer);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <View style={styles.icon}>
          <MaterialIcons name="check" size={20} color="#fff" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title}>{message}</Text>
          <Text style={styles.subtitle}>يمكنك تعديل الكمية من السلة في أي وقت.</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="عرض السلة"
          onPress={() => {
            onClose();
            router.push("/cart" as never);
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>عرض السلة</Text>
          <MaterialIcons name="arrow-back" size={16} color="#1e5fa8" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 16, right: 16, bottom: 86, zIndex: 50 },
  toast: {
    minHeight: 72,
    borderRadius: 18,
    backgroundColor: "#112b52",
    padding: 11,
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 9,
    shadowColor: "#07172f",
    shadowOpacity: 0.25,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
  },
  icon: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#1c9a74", alignItems: "center", justifyContent: "center" },
  copy: { flex: 1, alignItems: "flex-end" },
  title: { color: "#fff", fontSize: 13, fontWeight: "900", textAlign: "right" },
  subtitle: { color: "#cbdcf4", fontSize: 9, marginTop: 2, textAlign: "right" },
  action: { backgroundColor: "#fff", borderRadius: 11, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 3 },
  actionText: { color: "#1e5fa8", fontSize: 10, fontWeight: "900" },
  pressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
});
