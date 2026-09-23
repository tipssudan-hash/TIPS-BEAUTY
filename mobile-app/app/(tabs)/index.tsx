import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { ScreenContainer } from "@/components/screen-container";
import { CartFeedback } from "@/components/cart-feedback";
import { CatalogFilterSheet } from "@/components/catalog-filter-sheet";
import { useTipsStore } from "@/lib/tips-store";
import { getCartItemCount } from "@/lib/cart-utils";
import { EMPTY_CATALOG_FILTERS, filterCatalogProducts, getCatalogBrands, type CatalogFilters } from "@/lib/catalog-filters";
import { CATALOG_SORT_OPTIONS, sortCatalogProducts, type CatalogSort } from "@/lib/product-sorting";
import type { Product, StorefrontBanner, StorefrontCollection } from "@/lib/tips-api";

const LOGO = require("../../assets/images/tips-logo.png");
const HERO_MAKEUP = require("../../assets/images/hero-makeup-model.jpg");
const HERO_SKINCARE = require("../../assets/images/hero-skincare-glow.png");
const HERO_ELEGANCE = require("../../assets/images/hero-elegance-model.png");
const HERO_IMAGES = [HERO_SKINCARE, HERO_MAKEUP, HERO_ELEGANCE];
const { width } = Dimensions.get("window");
const HORIZONTAL_CARD_WIDTH = Math.min(Math.max(Math.round(width * 0.48), 176), 250);
const CATEGORIES = [
  { label: "المكياج", value: "المكياج", icon: "face-retouching-natural" },
  { label: "العناية بالبشرة", value: "العناية بالبشرة", icon: "auto-awesome" },
  { label: "العناية بالشعر", value: "العناية بالشعر", icon: "content-cut" },
  { label: "العطور", value: "العطور", icon: "local-florist" },
  { label: "أدوات التجميل", value: "أدوات التجميل", icon: "brush" },
];

const iconFor = (icon: string) => {
  if (["local-fire-department", "sell", "savings", "new-releases"].includes(icon)) return icon;
  return "auto-awesome";
};

function CartBadge({ count }: { count: number }) {
  if (!count) return null;
  return <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{count > 99 ? "99+" : count}</Text></View>;
}

function ProductCard({ item, onAdded }: { item: Product; onAdded: (product: Product, quantity: number) => void }) {
  const { addToCart, setQuantity, cart, favoriteIds, toggleFavorite, session } = useTipsStore();
  const liked = favoriteIds.includes(item.id);
  const quantity = cart.find((cartItem) => cartItem.id === item.id)?.quantity || 0;
  const price = Number(item.price) * (1 - Number(item.discount_percentage || 0) / 100);

  const addOne = async () => {
    await addToCart(item);
    onAdded(item, quantity + 1);
  };

  return (
    <View style={styles.productCard}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`عرض تفاصيل ${item.name_ar}`}
        onPress={() => router.push(`/product/${item.id}` as never)}
        style={({ pressed }) => [styles.productOpen, pressed && styles.pressed]}
      >
        <View style={styles.productImageWrap}>
          {item.image ? <Image source={{ uri: item.image }} style={styles.productImage} resizeMode="cover" /> : <View style={[styles.productImage, styles.imageFallback]}><MaterialIcons name="auto-awesome" size={32} color="#1e5fa8" /></View>}
          {Number(item.discount_percentage || 0) > 0 ? <View style={styles.discountBadge}><Text style={styles.discountBadgeText}>{item.discount_percentage}% خصم</Text></View> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={liked ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}
            onPress={(event) => { event.stopPropagation(); if (!session) { router.push("/auth" as never); return; } void toggleFavorite(item.id).catch((error: any) => Alert.alert("تعذر حفظ المفضلة", error.message || "حاولي مرة أخرى.")); }}
            style={({ pressed }) => [styles.heart, pressed && styles.pressed]}
          >
            <MaterialIcons name={liked ? "favorite" : "favorite-border"} size={21} color={liked ? "#dc426d" : "#64748b"} />
          </Pressable>
        </View>
        <View style={styles.productBody}>
          <Text numberOfLines={3} ellipsizeMode="tail" style={styles.productName}>{item.name_ar}</Text>
          <Text numberOfLines={2} ellipsizeMode="tail" style={styles.brand}>{item.brand || "TIPS Beauty"}</Text>
          {Number(item.reviews_count || 0) > 0 ? <View style={styles.ratingMetric}><MaterialIcons name="star" size={12} color="#f59e0b" /><Text style={styles.ratingMetricText}>{Number(item.average_rating || 0).toFixed(1)} ({item.reviews_count})</Text></View> : null}
        </View>
      </Pressable>
      <View style={styles.productFooter}>
        <Text numberOfLines={1} style={styles.price}>{price.toLocaleString()} ج.س</Text>
        {quantity ? (
          <View style={styles.miniQuantity}>
            <Pressable accessibilityRole="button" accessibilityLabel={`تقليل كمية ${item.name_ar}`} onPress={() => void setQuantity(item.id, quantity - 1)} style={({ pressed }) => [styles.miniQuantityButton, pressed && styles.pressed]}><MaterialIcons name="remove" size={16} color="#1e5fa8" /></Pressable>
            <Text style={styles.miniQuantityValue}>{quantity}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`زيادة كمية ${item.name_ar}`} onPress={() => void addOne()} style={({ pressed }) => [styles.miniQuantityButton, pressed && styles.pressed]}><MaterialIcons name="add" size={16} color="#1e5fa8" /></Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`إضافة ${item.name_ar} إلى السلة`} onPress={() => void addOne()} style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}>
            <MaterialIcons name="add-shopping-cart" size={17} color="#fff" />
            <Text style={styles.addButtonText}>أضيفي</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { products, banners, collections, cart, loading, configured, error, refresh, preferences } = useTipsStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("الكل");
  const [sort, setSort] = useState<CatalogSort>("newest");
  const [activeBanner, setActiveBanner] = useState(0);
  const [filters, setFilters] = useState<CatalogFilters>(EMPTY_CATALOG_FILTERS);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; id: number } | null>(null);
  const cartCount = getCartItemCount(cart);

  const filtered = useMemo(() => {
    const result = filterCatalogProducts(products, filters).filter((item) => {
      const text = `${item.name_ar} ${item.name_en || ""} ${item.brand || ""}`.toLowerCase();
      return text.includes(query.toLowerCase()) && (category === "الكل" || item.category === category);
    });
    return sortCatalogProducts(result, sort);
  }, [products, query, category, sort, filters]);
  const brands = useMemo(() => getCatalogBrands(products), [products]);

  const itemsForCollection = (collection: StorefrontCollection) => collection.product_ids.map((id) => products.find((product) => product.id === id)).filter((item): item is Product => Boolean(item));
  const added = (product: Product, quantity: number) => setFeedback({ message: quantity > 1 ? `تمت زيادة ${product.name_ar} إلى ${quantity}` : `تمت إضافة ${product.name_ar} إلى السلة`, id: Date.now() });
  const openCategory = (name: string) => router.push(`/category/${encodeURIComponent(name)}` as never);
  const openBanner = (banner: StorefrontBanner) => {
    if (banner.action_type === "category" && banner.action_value) openCategory(banner.action_value);
    else if (banner.action_type === "product" && banner.action_value) router.push(`/product/${banner.action_value}` as never);
    else if (banner.action_type === "url" && banner.action_value) router.push(banner.action_value as never);
  };

  const header = (
    <>
      <View style={styles.topbar}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
        <View style={styles.topbarActions}>
          <Pressable accessibilityRole="button" accessibilityLabel="المفضلة" onPress={() => router.push("/favorites" as never)} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}><MaterialIcons name="favorite-border" size={22} color="#dc426d" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="الإشعارات" onPress={() => router.push("/notifications" as never)} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}><MaterialIcons name="notifications-none" size={23} color="#1e5fa8" /></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={`السلة، ${cartCount} منتجات`} onPress={() => router.push("/cart" as never)} style={({ pressed }) => [styles.topAction, pressed && styles.pressed]}><MaterialIcons name="shopping-cart" size={22} color="#1e5fa8" /><CartBadge count={cartCount} /></Pressable>
        </View>
      </View>

      {preferences?.fullName ? (
        <View style={styles.personalBanner}>
          <MaterialIcons name="auto-awesome" size={16} color="#be185d" />
          <Text style={styles.personalBannerText}>
            أهلاً {preferences.fullName} ✨ ترشيحات مخصصة لجمالك ({preferences.skinType ? `بشرة ${preferences.skinType}` : "عناية متكاملة"})
          </Text>
        </View>
      ) : null}

      {banners.length ? (
        <View style={styles.bannerBlock}>
          <FlatList
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            data={banners}
            keyExtractor={(item) => item.id}
            onMomentumScrollEnd={(event) =>
              setActiveBanner(Math.round(event.nativeEvent.contentOffset.x / (width - 32)))
            }
            renderItem={({ item, index }) => {
              const imageSource = item.image_url
                ? { uri: item.image_url }
                : HERO_IMAGES[index % HERO_IMAGES.length];
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`فتح ${item.title_ar}`}
                  onPress={() => openBanner(item)}
                  style={({ pressed }) => [styles.banner, pressed && styles.pressed]}
                >
                  <Image source={imageSource} style={styles.bannerImage} resizeMode="cover" />
                  <View style={styles.bannerOverlay} />
                  <View style={styles.bannerText}>
                    <Text style={styles.bannerKicker}>TIPS BEAUTY</Text>
                    <Text numberOfLines={2} style={styles.bannerTitle}>
                      {item.title_ar}
                    </Text>
                    {item.subtitle_ar ? (
                      <Text numberOfLines={2} style={styles.bannerSub}>
                        {item.subtitle_ar}
                      </Text>
                    ) : null}
                    <View style={styles.bannerButton}>
                      <Text style={styles.bannerButtonText}>اكتشفي الآن</Text>
                      <MaterialIcons name="arrow-back" size={16} color="#be185d" />
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
        </View>
      ) : (
        <View style={styles.fallbackHero}>
          <Image source={HERO_MAKEUP} style={styles.bannerImage} resizeMode="cover" />
          <View style={styles.bannerOverlay} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerKicker}>TIPS BEAUTY</Text>
            <Text style={styles.bannerTitle}>اكتشفي جمالك الطبيعي</Text>
            <Text style={styles.bannerSub}>تشكيلة مختارة من أرقى مستحضرات التجميل والعناية.</Text>
          </View>
        </View>
      )}
      <View style={styles.bannerDots}>{banners.map((item, index) => <View key={item.id} style={[styles.bannerDot, index === activeBanner && styles.bannerDotActive]} />)}</View>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>تسوقي حسب القسم</Text><Text style={styles.sectionSub}>اختاري ما يناسب روتينك اليومي</Text></View><Pressable accessibilityRole="button" onPress={() => router.push("/categories" as never)}><Text style={styles.sectionLink}>كل الأقسام</Text></Pressable></View>
      <View style={styles.categoryGrid}>{CATEGORIES.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`فتح قسم ${item.label}`} key={item.label} onPress={() => openCategory(item.label)} style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}><View style={styles.categoryIcon}><MaterialIcons name={item.icon as never} size={23} color="#1e5fa8" /></View><Text numberOfLines={2} style={styles.categoryLabel}>{item.label}</Text></Pressable>)}</View>

      {collections.map((collection) => {
        const items = itemsForCollection(collection);
        if (!items.length) return null;
        return <View key={collection.id} style={styles.collection}><View style={styles.sectionHeader}><View style={styles.collectionTitleRow}><View style={styles.collectionIcon}><MaterialIcons name={iconFor(collection.icon) as never} size={20} color="#1e5fa8" /></View><View style={styles.collectionHeadingCopy}><Text numberOfLines={1} style={styles.sectionTitle}>{collection.name_ar}</Text>{collection.description_ar ? <Text numberOfLines={2} style={styles.sectionSub}>{collection.description_ar}</Text> : null}</View></View><Pressable accessibilityRole="button" accessibilityLabel={`عرض كل منتجات ${collection.name_ar}`} onPress={() => router.push(`/collection/${encodeURIComponent(collection.slug)}` as never)} style={({ pressed }) => [styles.collectionLink, pressed && styles.pressed]}><Text style={styles.sectionLink}>عرض الكل</Text></Pressable></View><FlatList horizontal showsHorizontalScrollIndicator={false} data={items.slice(0, 8)} keyExtractor={(item) => `${collection.id}-${item.id}`} contentContainerStyle={styles.collectionList} renderItem={({ item }) => <View style={styles.collectionProduct}><ProductCard item={item} onAdded={added} /></View>} /></View>;
      })}

      <View style={styles.catalogHeader}><View><Text style={styles.sectionTitle}>{category === "الكل" ? "كل المنتجات" : category}</Text><Text style={styles.sectionSub}>{filtered.length} منتج متاح</Text></View></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sorts} style={styles.sortScroll}>{CATALOG_SORT_OPTIONS.map((option) => <Pressable accessibilityRole="button" key={option.value} onPress={() => setSort(option.value)} style={[styles.sort, sort === option.value && styles.sortActive]}><Text style={[styles.sortText, sort === option.value && styles.sortTextActive]}>{option.label}</Text></Pressable>)}</ScrollView>
      <View style={styles.search}><MaterialIcons name="search" size={21} color="#718096" /><TextInput value={query} onChangeText={setQuery} placeholder="ابحثي عن منتجات الجمال..." placeholderTextColor="#94a3b8" style={styles.searchInput} textAlign="right" returnKeyType="search" /></View>
      <CatalogFilterSheet value={filters} brands={brands} expanded={filtersExpanded} onExpandedChange={setFiltersExpanded} onChange={setFilters} onClear={() => setFilters(EMPTY_CATALOG_FILTERS)} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} style={styles.categoryScroll}>{["الكل", ...CATEGORIES.map((item) => item.label)].map((item) => <Pressable accessibilityRole="button" key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}><Text style={[styles.categoryChipText, category === item && styles.categoryChipTextActive]}>{item}</Text></Pressable>)}</ScrollView>
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Pressable onPress={() => void refresh()}><Text style={styles.retryText}>إعادة المحاولة</Text></Pressable></View> : null}
      {!configured ? <Pressable onPress={() => router.push("/account" as never)} style={styles.notice}><MaterialIcons name="link" size={18} color="#8a5b00" /><Text style={styles.noticeText}>أكملي ربط قاعدة البيانات لعرض منتجاتك الحقيقية.</Text></Pressable> : null}
    </>
  );

  return (
    <ScreenContainer edges={["top", "left", "right"]} containerClassName="bg-[#f7f8fc]">
      <View style={styles.screen}>
        <FlatList data={filtered} keyExtractor={(item) => item.id} numColumns={2} columnWrapperStyle={styles.row} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void refresh()} tintColor="#1e5fa8" />} ListHeaderComponent={header} ListEmptyComponent={!loading ? <View style={styles.empty}><MaterialIcons name="inventory-2" size={40} color="#94a3b8" /><Text style={styles.emptyTitle}>{configured ? "لا توجد منتجات تطابق بحثك" : "سيظهر الكتالوج هنا"}</Text><Text style={styles.emptyText}>أضيفي المنتجات من لوحة الإدارة لتبدأ تجربة التسوق.</Text></View> : <View style={styles.loading}><ActivityIndicator color="#1e5fa8" /></View>} renderItem={({ item }) => <ProductCard item={item} onAdded={added} />} />
        <CartFeedback key={feedback?.id} visible={Boolean(feedback)} message={feedback?.message || ""} onClose={() => setFeedback(null)} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  personalBanner: { flexDirection: "row-reverse", alignItems: "center", gap: 8, backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#ffe4e6", padding: 10, borderRadius: 12, marginBottom: 12 },
  personalBannerText: { color: "#be185d", fontSize: 11, fontWeight: "800", flex: 1, textAlign: "right" },
  screen: { flex: 1 }, content: { padding: 16, paddingBottom: 36 }, topbar: { minHeight: 70, backgroundColor: "#fff", flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 12 }, logo: { width: 116, height: 58 }, topbarActions: { flexDirection: "row", gap: 8 }, topAction: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center", position: "relative" }, cartBadge: { position: "absolute", top: -5, right: -5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: "#dc426d", borderWidth: 2, borderColor: "#fff", alignItems: "center", justifyContent: "center", paddingHorizontal: 3 }, cartBadgeText: { color: "#fff", fontSize: 8, fontWeight: "900" }, bannerBlock: { marginHorizontal: -16 }, banner: { width: width - 32, height: 205, marginHorizontal: 16, overflow: "hidden", borderRadius: 24, backgroundColor: "#1e5fa8", position: "relative" }, bannerImage: { width: "100%", height: "100%", position: "absolute" }, bannerOverlay: { position: "absolute", inset: 0, backgroundColor: "rgba(10,42,83,0.28)" }, bannerText: { position: "absolute", right: 20, top: 23, width: Math.min(Math.round(width * 0.64), 360), alignItems: "flex-end" }, bannerKicker: { color: "#d7f3ff", fontSize: 10, fontWeight: "900", letterSpacing: 1 }, bannerTitle: { color: "#fff", fontWeight: "900", fontSize: 23, lineHeight: 30, textAlign: "right", marginTop: 7 }, bannerSub: { color: "#effbff", fontSize: 11, lineHeight: 17, textAlign: "right", marginTop: 7 }, bannerButton: { marginTop: 12, backgroundColor: "#fff", borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 4 }, bannerButtonText: { color: "#1e5fa8", fontWeight: "900", fontSize: 10 }, fallbackHero: { height: 205, backgroundColor: "#1e5fa8", padding: 24, borderRadius: 24, alignItems: "flex-end", justifyContent: "center" }, bannerDots: { flexDirection: "row", justifyContent: "center", gap: 5, marginTop: 9, marginBottom: 9 }, bannerDot: { height: 5, width: 5, borderRadius: 5, backgroundColor: "#cbd5e1" }, bannerDotActive: { width: 18, backgroundColor: "#1e5fa8" }, sectionHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 11 }, sectionTitle: { fontSize: 18, color: "#16213e", fontWeight: "900", textAlign: "right" }, sectionSub: { color: "#718096", fontSize: 10, textAlign: "right", marginTop: 3 }, sectionLink: { color: "#1e5fa8", fontSize: 11, fontWeight: "900" }, categoryGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9 }, categoryCard: { width: (width - 32 - 18) / 3, backgroundColor: "#fff", borderWidth: 1, borderColor: "#eaf0f7", borderRadius: 15, paddingVertical: 11, paddingHorizontal: 6, alignItems: "center", minHeight: 88 }, categoryIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center" }, categoryLabel: { color: "#334155", fontSize: 10, lineHeight: 14, fontWeight: "800", textAlign: "center", marginTop: 7 }, collection: { marginTop: 12 }, collectionTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }, collectionHeadingCopy: { flex: 1, minWidth: 0 }, collectionIcon: { width: 35, height: 35, borderRadius: 12, backgroundColor: "#edf5fd", alignItems: "center", justifyContent: "center" }, collectionLink: { paddingVertical: 8, paddingHorizontal: 4 }, collectionList: { gap: 12, paddingLeft: 2, paddingRight: 2 }, collectionProduct: { width: HORIZONTAL_CARD_WIDTH }, catalogHeader: { flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", marginTop: 20, marginBottom: 8 }, sortScroll: { marginBottom: 11 }, sorts: { flexDirection: "row-reverse", gap: 7, paddingHorizontal: 1 }, sort: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6" }, sortActive: { backgroundColor: "#1e5fa8", borderColor: "#1e5fa8" }, sortText: { color: "#536477", fontSize: 10, fontWeight: "800" }, sortTextActive: { color: "#fff" }, search: { height: 50, borderRadius: 15, backgroundColor: "#fff", borderWidth: 1, borderColor: "#e2e8f0", flexDirection: "row", alignItems: "center", paddingHorizontal: 14, gap: 8, marginBottom: 12 }, searchInput: { flex: 1, fontSize: 14, color: "#16213e" }, categoryScroll: { marginBottom: 15 }, categories: { gap: 8, flexDirection: "row-reverse" }, categoryChip: { paddingHorizontal: 15, paddingVertical: 9, borderRadius: 999, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce9f6" }, categoryChipActive: { backgroundColor: "#1e5fa8", borderColor: "#1e5fa8" }, categoryChipText: { color: "#64748b", fontSize: 12, fontWeight: "800" }, categoryChipTextActive: { color: "#fff" }, row: { gap: 12 }, productCard: { flex: 1, width: "100%", backgroundColor: "#fff", borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#eaf0f7", marginBottom: 13 }, productOpen: { flex: 1 }, productImageWrap: { position: "relative" }, productImage: { width: "100%", height: 154, backgroundColor: "#f0f5fb" }, imageFallback: { alignItems: "center", justifyContent: "center" }, discountBadge: { position: "absolute", top: 9, left: 8, backgroundColor: "#dc426d", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 }, discountBadgeText: { color: "#fff", fontWeight: "800", fontSize: 9 }, heart: { position: "absolute", top: 8, right: 8, width: 31, height: 31, borderRadius: 16, backgroundColor: "rgba(255,255,255,.92)", alignItems: "center", justifyContent: "center" }, productBody: { paddingHorizontal: 11, paddingTop: 11, paddingBottom: 7, minHeight: 91 }, productName: { color: "#16213e", fontSize: 13, lineHeight: 18, minHeight: 54, fontWeight: "800", textAlign: "right" }, brand: { color: "#94a3b8", fontSize: 10, lineHeight: 14, minHeight: 14, textAlign: "right", marginTop: 3 }, ratingMetric: { flexDirection: "row-reverse", alignItems: "center", alignSelf: "flex-end", gap: 2, marginTop: 4 }, ratingMetricText: { color: "#8a5b00", fontSize: 9, fontWeight: "800" }, productFooter: { minHeight: 48, paddingHorizontal: 10, paddingBottom: 10, flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center", gap: 5 }, price: { color: "#1e5fa8", fontWeight: "900", fontSize: 12, flex: 1, textAlign: "right" }, addButton: { minWidth: 75, backgroundColor: "#1e5fa8", borderRadius: 10, paddingHorizontal: 9, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4 }, addButtonText: { color: "#fff", fontSize: 10, fontWeight: "900" }, miniQuantity: { minWidth: 89, backgroundColor: "#edf5fd", borderRadius: 10, padding: 3, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, miniQuantityButton: { width: 25, height: 25, borderRadius: 8, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" }, miniQuantityValue: { minWidth: 22, textAlign: "center", color: "#1e5fa8", fontWeight: "900", fontSize: 12 }, notice: { backgroundColor: "#fff6dc", borderRadius: 13, padding: 11, flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 13 }, noticeText: { flex: 1, color: "#8a5b00", textAlign: "right", fontSize: 11 }, error: { backgroundColor: "#fef2f2", borderRadius: 13, padding: 12, marginBottom: 12, alignItems: "center", gap: 6 }, errorText: { color: "#b91c1c", fontSize: 12, textAlign: "center" }, retryText: { color: "#1e5fa8", fontWeight: "800", fontSize: 12 }, empty: { backgroundColor: "#fff", padding: 34, borderRadius: 18, alignItems: "center", gap: 8, marginTop: 6 }, emptyTitle: { color: "#16213e", fontWeight: "800", fontSize: 16 }, emptyText: { color: "#64748b", textAlign: "center", fontSize: 12 }, loading: { padding: 45, alignItems: "center" }, pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
});
