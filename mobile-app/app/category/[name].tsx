import { useState } from "react";
import { FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { CartFeedback } from "@/components/cart-feedback";
import { useTipsStore } from "@/lib/tips-store";
import { getCartItemCount } from "@/lib/cart-utils";
import type { Product } from "@/lib/tips-api";

function ProductCard({ item, onAdded }: { item: Product; onAdded: (product: Product, quantity: number) => void }) {
  const { cart, addToCart, setQuantity } = useTipsStore();
  const quantity = cart.find((cartItem) => cartItem.id === item.id)?.quantity || 0;
  const price = Number(item.price) * (1 - Number(item.discount_percentage || 0) / 100);
  const addOne = async () => { await addToCart(item); onAdded(item, quantity + 1); };
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`تفاصيل ${item.name_ar}`} onPress={() => router.push(`/product/${item.id}` as never)} style={({ pressed }) => [styles.cardOpen, pressed && styles.pressed]}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" /> : <View style={[styles.image, styles.imageFallback]}><MaterialIcons name="auto-awesome" size={31} color="#1e5fa8" /></View>}
      {Number(item.discount_percentage || 0) > 0 ? <View style={styles.discount}><Text style={styles.discountText}>{item.discount_percentage}% خصم</Text></View> : null}
      <View style={styles.productInfo}><Text numberOfLines={2} ellipsizeMode="tail" style={styles.name}>{item.name_ar}</Text><Text numberOfLines={1} style={styles.brand}>{item.brand || "TIPS Beauty"}</Text></View>
    </Pressable>
    <View style={styles.footer}><Text numberOfLines={1} style={styles.price}>{price.toLocaleString()} ج.س</Text>{quantity ? <View style={styles.quantity}><Pressable accessibilityRole="button" accessibilityLabel={`تقليل كمية ${item.name_ar}`} onPress={() => void setQuantity(item.id, quantity - 1)} style={styles.quantityButton}><MaterialIcons name="remove" size={16} color="#1e5fa8" /></Pressable><Text style={styles.quantityValue}>{quantity}</Text><Pressable accessibilityRole="button" accessibilityLabel={`زيادة كمية ${item.name_ar}`} onPress={() => void addOne()} style={styles.quantityButton}><MaterialIcons name="add" size={16} color="#1e5fa8" /></Pressable></View> : <Pressable accessibilityRole="button" accessibilityLabel={`إضافة ${item.name_ar} إلى السلة`} onPress={() => void addOne()} style={styles.add}><MaterialIcons name="add-shopping-cart" size={17} color="#fff" /><Text style={styles.addText}>أضيفي</Text></Pressable>}</View>
  </View>;
}

export default function CategoryProducts() {
  const params = useLocalSearchParams<{ name: string }>();
  const { products, cart } = useTipsStore();
  const [feedback, setFeedback] = useState<{ message: string; id: number } | null>(null);
  const name = Array.isArray(params.name) ? params.name[0] : params.name || "";
  const items = products.filter((item) => item.category === name);
  const cartCount = getCartItemCount(cart);
  const added = (product: Product, quantity: number) => setFeedback({ message: quantity > 1 ? `تمت زيادة ${product.name_ar} إلى ${quantity}` : `تمت إضافة ${product.name_ar} إلى السلة`, id: Date.now() });
  return <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#f7f8fc]"><View style={styles.screen}><View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-forward" size={23} color="#1e5fa8" /></Pressable><View style={styles.heading}><Text numberOfLines={1} style={styles.title}>{name}</Text><Text style={styles.sub}>{items.length} منتج متاح</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`السلة، ${cartCount} منتجات`} onPress={() => router.push("/cart" as never)} style={styles.cart}><MaterialIcons name="shopping-cart" size={21} color="#1e5fa8" />{cartCount ? <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View> : null}</Pressable></View><FlatList data={items} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} renderItem={({ item }) => <ProductCard item={item} onAdded={added} />} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="inventory-2" size={40} color="#94a3b8" /><Text style={styles.emptyText}>لا توجد منتجات في هذا القسم حالياً.</Text></View>} /><CartFeedback key={feedback?.id} visible={Boolean(feedback)} message={feedback?.message || ""} onClose={() => setFeedback(null)} /></View></ScreenContainer>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eaf0f7" }, back: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center" }, heading: { flex: 1, alignItems: "flex-end" }, title: { fontSize: 23, fontWeight: "900", color: "#16213e", textAlign: "right" }, sub: { fontSize: 11, color: "#718096", textAlign: "right", marginTop: 2 }, cart: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center", position: "relative" }, badge: { position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: "#dc426d", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }, badgeText: { color: "#fff", fontSize: 8, fontWeight: "900" }, list: { padding: 16, paddingBottom: 36 }, row: { gap: 12 }, card: { flex: 1, maxWidth: "48.4%", backgroundColor: "#fff", borderWidth: 1, borderColor: "#eaf0f7", borderRadius: 18, overflow: "hidden", marginBottom: 13 }, cardOpen: { flex: 1, position: "relative" }, image: { width: "100%", height: 174, backgroundColor: "#edf5fd" }, imageFallback: { alignItems: "center", justifyContent: "center" }, discount: { position: "absolute", left: 8, top: 8, borderRadius: 8, backgroundColor: "#dc426d", paddingHorizontal: 7, paddingVertical: 4 }, discountText: { color: "#fff", fontSize: 9, fontWeight: "900" }, productInfo: { paddingHorizontal: 11, paddingTop: 10, paddingBottom: 6 }, name: { fontSize: 13, lineHeight: 18, minHeight: 36, fontWeight: "800", color: "#16213e", textAlign: "right" }, brand: { color: "#94a3b8", fontSize: 10, textAlign: "right", marginTop: 3 }, footer: { minHeight: 48, paddingHorizontal: 10, paddingBottom: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 5 }, price: { flex: 1, fontSize: 12, fontWeight: "900", color: "#1e5fa8", textAlign: "right" }, add: { minWidth: 75, backgroundColor: "#1e5fa8", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 }, addText: { color: "#fff", fontSize: 10, fontWeight: "900" }, quantity: { minWidth: 89, backgroundColor: "#edf5fd", borderRadius: 10, padding: 3, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, quantityButton: { width: 25, height: 25, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }, quantityValue: { minWidth: 22, textAlign: "center", color: "#1e5fa8", fontWeight: "900", fontSize: 12 }, empty: { padding: 40, alignItems: "center", gap: 10 }, emptyText: { color: "#718096", textAlign: "center" }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
