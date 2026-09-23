import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import type { CatalogFilters } from "@/lib/catalog-filters";

export function CatalogFilterSheet({
  value,
  brands,
  expanded,
  onExpandedChange,
  onChange,
  onClear,
}: {
  value: CatalogFilters;
  brands: string[];
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onChange: (next: CatalogFilters) => void;
  onClear: () => void;
}) {
  const activeCount = Number(Boolean(value.minPrice)) + Number(Boolean(value.maxPrice)) + Number(Boolean(value.brand)) + Number(value.inStockOnly);
  return (
    <View style={styles.wrap}>
      <Pressable accessibilityRole="button" accessibilityLabel="فتح خيارات فلترة المنتجات" onPress={() => onExpandedChange(!expanded)} style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <View style={styles.toggleRight}><MaterialIcons name="tune" size={20} color="#1e5fa8" /><Text style={styles.toggleText}>فلترة المنتجات</Text>{activeCount ? <View style={styles.count}><Text style={styles.countText}>{activeCount}</Text></View> : null}</View>
        <MaterialIcons name={expanded ? "keyboard-arrow-up" : "keyboard-arrow-down"} size={23} color="#1e5fa8" />
      </Pressable>
      {expanded ? <View style={styles.panel}>
        <View style={styles.sectionRow}><Text style={styles.label}>نطاق السعر بعد الخصم</Text><Pressable accessibilityRole="button" onPress={onClear}><Text style={styles.clear}>مسح الفلاتر</Text></Pressable></View>
        <View style={styles.priceRow}>
          <TextInput accessibilityLabel="أعلى سعر" value={value.maxPrice} onChangeText={(maxPrice) => onChange({ ...value, maxPrice: maxPrice.replace(/[^0-9]/g, "") })} keyboardType="numeric" placeholder="إلى" placeholderTextColor="#94a3b8" style={styles.priceInput} textAlign="right" />
          <Text style={styles.to}>—</Text>
          <TextInput accessibilityLabel="أقل سعر" value={value.minPrice} onChangeText={(minPrice) => onChange({ ...value, minPrice: minPrice.replace(/[^0-9]/g, "") })} keyboardType="numeric" placeholder="من" placeholderTextColor="#94a3b8" style={styles.priceInput} textAlign="right" />
        </View>
        <Text style={styles.label}>العلامة التجارية</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.brandList} style={styles.brandScroll}>
          {["", ...brands].map((brand) => {
            const active = value.brand === brand;
            return <Pressable accessibilityRole="button" key={brand || "all"} onPress={() => onChange({ ...value, brand })} style={[styles.brandChip, active && styles.brandChipActive]}><Text numberOfLines={1} style={[styles.brandText, active && styles.brandTextActive]}>{brand || "كل العلامات"}</Text></Pressable>;
          })}
        </ScrollView>
        <View style={styles.stockRow}><View><Text style={styles.stockTitle}>المتوفر فقط</Text><Text style={styles.stockSub}>إخفاء المنتجات غير المتوفرة</Text></View><Switch value={value.inStockOnly} onValueChange={(inStockOnly) => onChange({ ...value, inStockOnly })} trackColor={{ false: "#d9e2ef", true: "#9cc4ec" }} thumbColor={value.inStockOnly ? "#1e5fa8" : "#fff"} /></View>
      </View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 14 }, toggle: { minHeight: 47, borderRadius: 14, paddingHorizontal: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, toggleRight: { flexDirection: "row-reverse", alignItems: "center", gap: 7 }, toggleText: { color: "#1e5fa8", fontWeight: "900", fontSize: 12 }, count: { minWidth: 19, height: 19, borderRadius: 10, backgroundColor: "#dc426d", alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }, countText: { color: "#fff", fontSize: 9, fontWeight: "900" }, panel: { marginTop: 8, borderRadius: 16, padding: 13, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e5edf6" }, sectionRow: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }, label: { textAlign: "right", color: "#334155", fontSize: 12, fontWeight: "900" }, clear: { color: "#dc426d", fontSize: 11, fontWeight: "800" }, priceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 14 }, priceInput: { flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: "#dbe6f2", backgroundColor: "#f9fbfe", color: "#16213e", paddingHorizontal: 11, fontSize: 12 }, to: { color: "#94a3b8" }, brandScroll: { marginTop: 8, marginBottom: 12 }, brandList: { flexDirection: "row-reverse", gap: 7 }, brandChip: { maxWidth: 155, borderWidth: 1, borderColor: "#dce9f6", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff" }, brandChipActive: { backgroundColor: "#1e5fa8", borderColor: "#1e5fa8" }, brandText: { color: "#64748b", fontSize: 11, fontWeight: "800" }, brandTextActive: { color: "#fff" }, stockRow: { paddingTop: 11, borderTopWidth: 1, borderTopColor: "#edf1f7", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between" }, stockTitle: { color: "#334155", fontSize: 12, fontWeight: "900", textAlign: "right" }, stockSub: { color: "#94a3b8", fontSize: 10, textAlign: "right", marginTop: 2 }, pressed: { opacity: 0.8 },
});
