import { useEffect, useMemo, useState } from "react";
import { FlatList, Image, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ActivityIndicator } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router, useLocalSearchParams } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { CartFeedback } from "@/components/cart-feedback";
import { useTipsStore } from "@/lib/tips-store";
import { getCartItemCount } from "@/lib/cart-utils";
import { sortCatalogProducts, CATALOG_SORT_OPTIONS, type CatalogSort } from "@/lib/product-sorting";
import { getProductPrice } from "@/lib/catalog-filters";
import { getWhatsAppShareUrl } from "@/lib/wishlist-share";
import type { Product } from "@/lib/tips-api";

const LOGO = require("../../assets/images/tips-logo.png");
type AvailabilityFilter = "all" | "available" | "discounted";
const PAGE_SIZE = 6;

function PlaceholderImage() {
  return <View style={styles.imageFallback}><View style={styles.fallbackOrbOne} /><View style={styles.fallbackOrbTwo} /><View style={styles.fallbackBadge}><MaterialIcons name="auto-awesome" size={27} color="#1e5fa8" /></View><Image source={LOGO} style={styles.fallbackLogo} resizeMode="contain" /><Text style={styles.fallbackText}>TIPS BEAUTY</Text></View>;
}

function ProductCard({ item, onAdded }: { item: Product; onAdded: (product: Product, quantity: number) => void }) {
  const { cart, addToCart, setQuantity } = useTipsStore();
  const quantity = cart.find((entry) => entry.id === item.id)?.quantity || 0;
  const price = getProductPrice(item);
  const addOne = async () => { await addToCart(item); onAdded(item, quantity + 1); };
  return <View style={styles.card}>
    <Pressable accessibilityRole="button" accessibilityLabel={`تفاصيل ${item.name_ar}`} onPress={() => router.push(`/product/${item.id}` as never)} style={({ pressed }) => [styles.cardOpen, pressed && styles.pressed]}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.image} resizeMode="cover" /> : <PlaceholderImage />}
      {Number(item.discount_percentage || 0) > 0 ? <View style={styles.discount}><Text style={styles.discountText}>{item.discount_percentage}% خصم</Text></View> : null}
      <View style={styles.info}><Text numberOfLines={3} style={styles.name}>{item.name_ar}</Text><Text numberOfLines={2} style={styles.brand}>{item.brand || "TIPS Beauty"}</Text>{Number(item.reviews_count || 0) > 0 ? <Text style={styles.rating}>★ {Number(item.average_rating || 0).toFixed(1)} ({item.reviews_count})</Text> : null}</View>
    </Pressable>
    <View style={styles.footer}><Text numberOfLines={1} style={styles.price}>{price.toLocaleString()} ج.س</Text>{quantity ? <View style={styles.quantity}><Pressable accessibilityLabel="تقليل الكمية" onPress={() => void setQuantity(item.id, quantity - 1)} style={styles.quantityButton}><MaterialIcons name="remove" size={16} color="#1e5fa8" /></Pressable><Text style={styles.quantityValue}>{quantity}</Text><Pressable accessibilityLabel="زيادة الكمية" onPress={() => void addOne()} style={styles.quantityButton}><MaterialIcons name="add" size={16} color="#1e5fa8" /></Pressable></View> : <Pressable accessibilityRole="button" accessibilityLabel={`إضافة ${item.name_ar} إلى السلة`} onPress={() => void addOne()} style={styles.add}><MaterialIcons name="add-shopping-cart" size={17} color="#fff" /><Text style={styles.addText}>أضيفي</Text></Pressable>}</View>
  </View>;
}

export default function CollectionProducts() {
  const params = useLocalSearchParams<{ slug: string }>();
  const { products, collections, cart } = useTipsStore();
  const [feedback, setFeedback] = useState<{ message: string; id: number } | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [brands, setBrands] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug || "";
  const collection = collections.find((entry) => entry.slug === slug);
  const collectionItems = useMemo(() => collection ? collection.product_ids.map((id) => products.find((product) => product.id === id)).filter((item): item is Product => Boolean(item)) : [], [collection, products]);
  const brandOptions = useMemo(() => Array.from(new Set(collectionItems.map((item) => item.brand?.trim()).filter((item): item is string => Boolean(item))).values()).sort((a, b) => a.localeCompare(b, "ar")), [collectionItems]);
  const filterStorageKey = `tips_collection_filters:${slug}`;
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(filterStorageKey).then((raw) => {
      if (!active || !raw) return;
      try {
        const saved = JSON.parse(raw) as { query?: string; sort?: CatalogSort; availability?: AvailabilityFilter; brands?: string[]; minPrice?: string; maxPrice?: string };
        setQuery(saved.query || "");
        setSort(saved.sort || "newest");
        setAvailability(saved.availability || "all");
        setBrands(Array.isArray(saved.brands) ? saved.brands : []);
        setMinPrice(saved.minPrice || "");
        setMaxPrice(saved.maxPrice || "");
      } catch { /* Ignore malformed local filter state. */ }
    });
    return () => { active = false; };
  }, [filterStorageKey]);
  useEffect(() => {
    void AsyncStorage.setItem(filterStorageKey, JSON.stringify({ query, sort, availability, brands, minPrice, maxPrice }));
  }, [filterStorageKey, query, sort, availability, brands, minPrice, maxPrice]);
  const items = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const minimum = Number(minPrice.replace(/[^0-9.]/g, ""));
    const maximum = Number(maxPrice.replace(/[^0-9.]/g, ""));
    const hasMinimum = minPrice.trim() !== "" && Number.isFinite(minimum);
    const hasMaximum = maxPrice.trim() !== "" && Number.isFinite(maximum);
    const filtered = collectionItems.filter((item) => {
      const searchable = `${item.name_ar} ${item.name_en || ""} ${item.brand || ""}`.toLowerCase();
      const currentPrice = getProductPrice(item);
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const matchesAvailability = availability === "all" || (availability === "available" ? Number(item.stock ?? 0) > 0 : Number(item.discount_percentage || 0) > 0);
      const matchesBrand = brands.length === 0 || brands.includes(item.brand || "");
      const matchesMinimum = !hasMinimum || currentPrice >= minimum;
      const matchesMaximum = !hasMaximum || currentPrice <= maximum;
      return matchesQuery && matchesAvailability && matchesBrand && matchesMinimum && matchesMaximum;
    });
    return sortCatalogProducts(filtered, sort);
  }, [collectionItems, query, sort, availability, brands, minPrice, maxPrice]);
  const visibleItems = items.slice(0, visibleCount);
  const cartCount = getCartItemCount(cart);
  const added = (product: Product, quantity: number) => setFeedback({ message: quantity > 1 ? `تمت زيادة ${product.name_ar} إلى ${quantity}` : `تمت إضافة ${product.name_ar} إلى السلة`, id: Date.now() });
  const resetFilters = () => { setQuery(""); setSort("newest"); setAvailability("all"); setBrands([]); setMinPrice(""); setMaxPrice(""); setVisibleCount(PAGE_SIZE); };
  const loadMore = () => {
    if (isLoadingMore || visibleCount >= items.length) return;
    setIsLoadingMore(true);
    setTimeout(() => { setVisibleCount((count) => Math.min(count + PAGE_SIZE, items.length)); setIsLoadingMore(false); }, 350);
  };
  const shareCollection = async () => {
    const message = `اكتشفي مجموعة «${collection?.name_ar || "منتجات TIPS Beauty"}» من تيبس بيوتي:\n${collection?.description_ar || "منتجات مختارة بعناية لجمالك."}\n\n${collectionItems.slice(0, 8).map((item) => `• ${item.name_ar}`).join("\n")}\n\n${typeof window !== "undefined" ? window.location.href : "https://tipsbeauty.store"}`;
    try { await Linking.openURL(getWhatsAppShareUrl(message)); } catch { setFeedback({ message: "تعذر فتح واتساب. يمكنك نسخ رابط المجموعة ومشاركته.", id: Date.now() }); }
  };
  const availabilityOptions: Array<{ value: AvailabilityFilter; label: string }> = [{ value: "all", label: "الكل" }, { value: "available", label: "متوفر" }, { value: "discounted", label: "عليه خصم" }];
  return <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#f7f8fc]"><View style={styles.screen}>
    <View style={styles.header}><Pressable accessibilityLabel="رجوع" onPress={() => router.back()} style={styles.back}><MaterialIcons name="arrow-forward" size={23} color="#1e5fa8" /></Pressable><View style={styles.heading}><Text numberOfLines={1} style={styles.title}>{collection?.name_ar || "المنتجات"}</Text><Text style={styles.sub}>{items.length} منتج متاح</Text></View><View style={styles.headerActions}><Pressable accessibilityRole="button" accessibilityLabel="مشاركة المجموعة عبر واتساب" onPress={() => void shareCollection()} style={styles.shareButton}><MaterialIcons name="share" size={20} color="#198754" /></Pressable><Pressable accessibilityLabel={`السلة، ${cartCount} منتجات`} onPress={() => router.push("/cart" as never)} style={styles.cart}><MaterialIcons name="shopping-cart" size={21} color="#1e5fa8" />{cartCount ? <View style={styles.badge}><Text style={styles.badgeText}>{cartCount}</Text></View> : null}</Pressable></View></View>
    <FlatList data={visibleItems} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={styles.row} contentContainerStyle={styles.list} onEndReached={loadMore} onEndReachedThreshold={0.65} ListHeaderComponent={<View><View style={styles.search}><MaterialIcons name="search" size={20} color="#718096" /><TextInput value={query} onChangeText={(value) => { setQuery(value); setVisibleCount(PAGE_SIZE); }} placeholder="ابحثي داخل المجموعة..." placeholderTextColor="#94a3b8" style={styles.searchInput} textAlign="right" /></View><View style={styles.filterHeader}><Text style={styles.filterTitle}>تصفية النتائج</Text><Pressable accessibilityRole="button" onPress={resetFilters} style={({ pressed }) => [styles.resetButton, pressed && styles.pressed]}><MaterialIcons name="filter-alt-off" size={15} color="#1e5fa8" /><Text style={styles.reset}>مسح جميع الفلاتر</Text></Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{availabilityOptions.map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { setAvailability(option.value); setVisibleCount(PAGE_SIZE); }} style={[styles.chip, availability === option.value && styles.chipActive]}><Text style={[styles.chipText, availability === option.value && styles.chipTextActive]}>{option.label}</Text></Pressable>)}</ScrollView><Text style={styles.filterTitle}>السعر (ج.س)</Text><View style={styles.priceRow}><TextInput value={minPrice} onChangeText={(value) => { setMinPrice(value.replace(/[^0-9]/g, "")); setVisibleCount(PAGE_SIZE); }} keyboardType="numeric" placeholder="من" placeholderTextColor="#94a3b8" style={styles.priceInput} textAlign="right" /><Text style={styles.priceDash}>—</Text><TextInput value={maxPrice} onChangeText={(value) => { setMaxPrice(value.replace(/[^0-9]/g, "")); setVisibleCount(PAGE_SIZE); }} keyboardType="numeric" placeholder="إلى" placeholderTextColor="#94a3b8" style={styles.priceInput} textAlign="right" /></View>{brandOptions.length ? <><Text style={styles.filterTitle}>العلامة التجارية</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{[{ value: "all", label: "كل العلامات" }, ...brandOptions.map((item) => ({ value: item, label: item }))].map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { setBrands((selected) => option.value === "all" ? [] : selected.includes(option.value) ? selected.filter((item) => item !== option.value) : [...selected, option.value]); setVisibleCount(PAGE_SIZE); }} style={[styles.chip, (option.value === "all" ? brands.length === 0 : brands.includes(option.value)) && styles.chipActive]}><Text numberOfLines={1} style={[styles.chipText, (option.value === "all" ? brands.length === 0 : brands.includes(option.value)) && styles.chipTextActive]}>{option.label}</Text></Pressable>)}</ScrollView></> : null}<Text style={styles.filterTitle}>ترتيب المنتجات</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{CATALOG_SORT_OPTIONS.map((option) => <Pressable key={option.value} accessibilityRole="button" onPress={() => { setSort(option.value); setVisibleCount(PAGE_SIZE); }} style={[styles.chip, sort === option.value && styles.chipActive]}><Text style={[styles.chipText, sort === option.value && styles.chipTextActive]}>{option.label}</Text></Pressable>)}</ScrollView></View>} renderItem={({ item }) => <ProductCard item={item} onAdded={added} />} ListFooterComponent={visibleItems.length < items.length ? <View style={styles.loadingMore}>{isLoadingMore ? <><ActivityIndicator size="small" color="#1e5fa8" /><Text style={styles.loadingMoreText}>جارٍ تحميل المزيد...</Text></> : <Text style={styles.loadingMoreText}>مرري لعرض المزيد من المنتجات</Text>}</View> : null} ListEmptyComponent={<View style={styles.empty}><MaterialIcons name="inventory-2" size={40} color="#94a3b8" /><Text style={styles.emptyText}>لا توجد منتجات مطابقة للفلاتر الحالية.</Text><Pressable onPress={resetFilters}><Text style={styles.clearText}>مسح التصفية</Text></Pressable></View>} /><CartFeedback key={feedback?.id} visible={Boolean(feedback)} message={feedback?.message || ""} onClose={() => setFeedback(null)} />
  </View></ScreenContainer>;
}

const styles = StyleSheet.create({
  screen: { flex: 1 }, header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, padding: 16, backgroundColor: "#fff", borderBottomWidth: 1, borderBottomColor: "#eaf0f7" }, back: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center" }, heading: { flex: 1, alignItems: "flex-end", minWidth: 0 }, title: { fontSize: 22, fontWeight: "900", color: "#16213e", textAlign: "right" }, sub: { fontSize: 11, color: "#718096", marginTop: 2 }, headerActions: { flexDirection: "row-reverse", gap: 7 }, shareButton: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#e8f7ef", alignItems: "center", justifyContent: "center" }, cart: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center", position: "relative" }, badge: { position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: "#dc426d", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }, badgeText: { color: "#fff", fontSize: 8, fontWeight: "900" }, search: { height: 48, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", paddingHorizontal: 13, gap: 8, marginBottom: 10 }, searchInput: { flex: 1, fontSize: 13, color: "#16213e" }, filterHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center" }, filterTitle: { color: "#16213e", fontSize: 12, fontWeight: "900", textAlign: "right", marginTop: 4, marginBottom: 6 }, resetButton: { flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: "#edf5fd", borderWidth: 1, borderColor: "#dce9f6" }, reset: { color: "#1e5fa8", fontSize: 10, fontWeight: "800" }, chips: { flexDirection: "row-reverse", gap: 7, paddingBottom: 8 }, chip: { maxWidth: 145, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6" }, chipActive: { backgroundColor: "#1e5fa8", borderColor: "#1e5fa8" }, chipText: { color: "#64748b", fontSize: 10, fontWeight: "800" }, chipTextActive: { color: "#fff" }, priceRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 3 }, priceInput: { flex: 1, height: 40, minWidth: 0, borderRadius: 11, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6", paddingHorizontal: 11, color: "#16213e", fontSize: 12 }, priceDash: { color: "#94a3b8" }, list: { padding: 16, paddingBottom: 36 }, row: { gap: 12 }, card: { flex: 1, maxWidth: "48.4%", backgroundColor: "#fff", borderWidth: 1, borderColor: "#eaf0f7", borderRadius: 18, overflow: "hidden", marginBottom: 13 }, cardOpen: { flex: 1 }, image: { width: "100%", height: 154, backgroundColor: "#edf5fd" }, imageFallback: { width: "100%", height: 154, backgroundColor: "#eaf4fc", alignItems: "center", justifyContent: "center", overflow: "hidden" }, fallbackOrbOne: { position: "absolute", width: 135, height: 135, borderRadius: 68, backgroundColor: "#d8ebfa", top: -40, right: -35 }, fallbackOrbTwo: { position: "absolute", width: 105, height: 105, borderRadius: 53, backgroundColor: "#f8dce8", bottom: -38, left: -25 }, fallbackBadge: { width: 58, height: 58, borderRadius: 20, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#1e5fa8", shadowOpacity: 0.12, shadowRadius: 8, elevation: 2 }, fallbackLogo: { width: 46, height: 25, marginTop: 7, opacity: 0.9 }, fallbackText: { color: "#1e5fa8", fontSize: 8, fontWeight: "900", letterSpacing: 1, marginTop: 2 }, discount: { position: "absolute", left: 8, top: 8, borderRadius: 8, backgroundColor: "#dc426d", paddingHorizontal: 7, paddingVertical: 4 }, discountText: { color: "#fff", fontSize: 9, fontWeight: "900" }, info: { paddingHorizontal: 11, paddingTop: 10, paddingBottom: 7, minHeight: 91 }, name: { color: "#16213e", fontSize: 13, lineHeight: 18, minHeight: 54, fontWeight: "800", textAlign: "right" }, brand: { color: "#94a3b8", fontSize: 10, lineHeight: 14, minHeight: 14, textAlign: "right", marginTop: 3 }, rating: { color: "#8a5b00", fontSize: 9, fontWeight: "800", textAlign: "right", marginTop: 4 }, footer: { minHeight: 48, paddingHorizontal: 10, paddingBottom: 10, flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", gap: 5 }, price: { flex: 1, color: "#1e5fa8", fontSize: 12, fontWeight: "900", textAlign: "right" }, add: { minWidth: 75, backgroundColor: "#1e5fa8", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 }, addText: { color: "#fff", fontSize: 10, fontWeight: "900" }, quantity: { minWidth: 89, backgroundColor: "#edf5fd", borderRadius: 10, padding: 3, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, quantityButton: { width: 25, height: 25, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }, quantityValue: { minWidth: 22, textAlign: "center", color: "#1e5fa8", fontWeight: "900" }, loadingMore: { alignItems: "center", paddingVertical: 14 }, loadingMoreText: { color: "#718096", fontSize: 11 }, empty: { padding: 40, alignItems: "center", gap: 10 }, emptyText: { color: "#718096", textAlign: "center" }, clearText: { color: "#1e5fa8", fontWeight: "900" }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
