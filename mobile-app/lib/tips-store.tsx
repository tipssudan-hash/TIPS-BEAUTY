import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  AuthSession,
  CartItem,
  CustomerPreferences,
  Product,
  StorefrontBanner,
  StorefrontCollection,
  addFavorite,
  fetchFavoriteIds,
  fetchProducts,
  fetchStorefront,
  getCustomerPreferences,
  removeFavorite,
  restoreSession,
  saveCustomerPreferences,
  saveSession,
} from "@/lib/tips-api";
import { addProductToCart, setCartItemQuantity } from "@/lib/cart-utils";
import { toggleFavoriteId } from "@/lib/favorites-utils";

const FALLBACK_BANNERS: StorefrontBanner[] = [
  {
    id: "banner-1",
    title_ar: "مجموعة العناية الفائقة بالبشرة",
    subtitle_ar: "خصم يصل إلى 30% على منتجات الترطيب والتفتيح",
    image_url: "https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&q=80",
    action_type: "category",
    action_value: "العناية بالبشرة",
  },
  {
    id: "banner-2",
    title_ar: "أحدث تشكيلة من مستحضرات التجميل",
    subtitle_ar: "إطلالة جذابة تناسب جميع المناسبات",
    image_url: "https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=800&q=80",
    action_type: "category",
    action_value: "المكياج",
  },
];

const FALLBACK_PRODUCTS: Product[] = [
  {
    id: "prod-1",
    name_ar: "سيروم حمض الهيالورونيك المرطب",
    name_en: "Hyaluronic Acid Hydrating Serum",
    price: 8500,
    discount_percentage: 15,
    image: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?w=600&q=80",
    stock: 50,
    description: "سيروم فائق الترطيب يعيد للبشرة نضارتها ومرونتها ويقلل من ظهور الخطوط الدقيقة.",
    category: "العناية بالبشرة",
    brand: "TIPS Skin",
    average_rating: 4.9,
    reviews_count: 38,
    sales_count: 85,
  },
  {
    id: "prod-2",
    name_ar: "أحمر شفاه مخملي مطفي - وردي كلاسيكي",
    name_en: "Velvet Matte Lipstick - Rose Classic",
    price: 4200,
    discount_percentage: 10,
    image: "https://images.unsplash.com/photo-1586495777744-4413f21062fa?w=600&q=80",
    stock: 80,
    description: "لون غني يدوم طويلاً بتركيبة كريمية ناعمة لا تسبب جفاف الشفاه.",
    category: "المكياج",
    brand: "TIPS Glam",
    average_rating: 4.8,
    reviews_count: 52,
    sales_count: 120,
  },
  {
    id: "prod-3",
    name_ar: "كريم تفتيح ونضارة بفيتامين سي",
    name_en: "Vitamin C Radiance Glow Cream",
    price: 9200,
    discount_percentage: 20,
    image: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=600&q=80",
    stock: 35,
    description: "تركيبة متطورة غنية بمضادات الأكسدة لتوحيد لون البشرة وإشراقة طبيعية تدوم.",
    category: "العناية بالبشرة",
    brand: "TIPS Skin",
    average_rating: 4.7,
    reviews_count: 27,
    sales_count: 64,
  },
  {
    id: "prod-4",
    name_ar: "عطر تيبس بيوتي روز الفاخر - 100 مل",
    name_en: "TIPS Beauty Rose Luxury Perfume 100ml",
    price: 18500,
    discount_percentage: 0,
    image: "https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=600&q=80",
    stock: 25,
    description: "توليفة عطرية زهرية ساحرة تجمع بين نفحات الورد البلغاري والفانيليا الدافئة.",
    category: "العطور",
    brand: "TIPS Fragrance",
    average_rating: 5.0,
    reviews_count: 44,
    sales_count: 95,
  },
  {
    id: "prod-5",
    name_ar: "زيت الأرغان المغربي لإصلاح الشعر",
    name_en: "Moroccan Argan Hair Repair Oil",
    price: 7800,
    discount_percentage: 12,
    image: "https://images.unsplash.com/photo-1608248597359-5989e2fb7255?w=600&q=80",
    stock: 60,
    description: "يغذي الشعر التالف من الجذور للأطراف ويمنحه لمعاناً حريرياً وقوة فائقة.",
    category: "العناية بالشعر",
    brand: "TIPS Care",
    average_rating: 4.8,
    reviews_count: 19,
    sales_count: 48,
  },
  {
    id: "prod-6",
    name_ar: "مجموعة فرش مكياج احترافية 12 قطعة",
    name_en: "Professional Makeup Brush Set 12pcs",
    price: 6500,
    discount_percentage: 25,
    image: "https://images.unsplash.com/photo-1512496015851-a90fb38ba796?w=600&q=80",
    stock: 40,
    description: "شعيرات ناعمة فائقة الدقة لتطبيق ومزج المكياج بكل احترافية.",
    category: "أدوات التجميل",
    brand: "TIPS Tools",
    average_rating: 4.9,
    reviews_count: 31,
    sales_count: 76,
  },
];

const FALLBACK_COLLECTIONS: StorefrontCollection[] = [
  {
    id: "col-1",
    slug: "bestsellers",
    name_ar: "الأكثر طلباً ومبيعاً",
    description_ar: "المنتجات الأكثر مبيعاً وتقييماً لدى عميلاتنا",
    icon: "local-fire-department",
    display_order: 1,
    product_ids: ["prod-1", "prod-2", "prod-4"],
  },
  {
    id: "col-2",
    slug: "skincare-essentials",
    name_ar: "أساسيات العناية بالبشرة",
    description_ar: "روتين يومي لبشرة مشرقة وصحية",
    icon: "auto-awesome",
    display_order: 2,
    product_ids: ["prod-1", "prod-3"],
  },
];

type Store = {
  session: AuthSession | null;
  preferences: CustomerPreferences | null;
  products: Product[];
  banners: StorefrontBanner[];
  collections: StorefrontCollection[];
  cart: CartItem[];
  favoriteIds: string[];
  loading: boolean;
  configured: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setSession: (session: AuthSession | null) => Promise<void>;
  setPreferences: (prefs: CustomerPreferences) => Promise<void>;
  toggleFavorite: (productId: string) => Promise<void>;
  addToCart: (product: Product) => Promise<void>;
  setQuantity: (id: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
};

const Context = createContext<Store | null>(null);
const CART_KEY = "tips_mobile_cart";

export function TipsStoreProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<AuthSession | null>(null);
  const [preferences, setPreferencesState] = useState<CustomerPreferences | null>(null);
  const [products, setProducts] = useState<Product[]>(FALLBACK_PRODUCTS);
  const [banners, setBanners] = useState<StorefrontBanner[]>(FALLBACK_BANNERS);
  const [collections, setCollections] = useState<StorefrontCollection[]>(FALLBACK_COLLECTIONS);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL && process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
  );

  const persistCart = async (next: CartItem[]) => {
    setCart(next);
    await AsyncStorage.setItem(CART_KEY, JSON.stringify(next));
  };

  const setPreferences = async (prefs: CustomerPreferences) => {
    setPreferencesState(prefs);
    if (session) {
      await saveCustomerPreferences(session, prefs);
    }
  };

  const refresh = async () => {
    if (!configured) return;
    setLoading(true);
    setError(null);
    try {
      const [nextProducts, storefront] = await Promise.all([
        fetchProducts(),
        fetchStorefront(),
      ]);
      if (nextProducts && nextProducts.length > 0) {
        setProducts(nextProducts);
      }
      if (storefront?.banners && storefront.banners.length > 0) {
        setBanners(storefront.banners);
      }
      if (storefront?.collections && storefront.collections.length > 0) {
        setCollections(storefront.collections);
      }
    } catch (e: any) {
      // Keep existing products while logging error
      console.warn("Live DB sync note:", e?.message || e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      const [savedSession, savedCart, savedPrefs] = await Promise.all([
        restoreSession(),
        AsyncStorage.getItem(CART_KEY),
        getCustomerPreferences(null),
      ]);
      setSessionState(savedSession);
      if (savedPrefs) setPreferencesState(savedPrefs);
      if (savedCart) {
        try {
          setCart(JSON.parse(savedCart));
        } catch {
          // ignore corrupted json
        }
      }
      if (savedSession && configured) {
        try {
          setFavoriteIds(await fetchFavoriteIds(savedSession));
          const userPrefs = await getCustomerPreferences(savedSession);
          if (userPrefs) setPreferencesState(userPrefs);
        } catch {
          setFavoriteIds([]);
        }
      }
      await refresh();
    })();
  }, []);

  const setSession = async (next: AuthSession | null) => {
    setSessionState(next);
    setFavoriteIds([]);
    await saveSession(next);
    if (next) {
      const userPrefs = await getCustomerPreferences(next);
      if (userPrefs) setPreferencesState(userPrefs);
      if (configured) {
        try {
          setFavoriteIds(await fetchFavoriteIds(next));
        } catch {
          setFavoriteIds([]);
        }
      }
    } else {
      setPreferencesState(null);
      await AsyncStorage.removeItem("tips_active_profile");
    }
  };

  const toggleFavorite = async (productId: string) => {
    if (!session) throw new Error("سجّلي الدخول أولاً لحفظ المفضلة.");
    const previous = favoriteIds;
    const next = toggleFavoriteId(previous, productId);
    setFavoriteIds(next);
    try {
      if (previous.includes(productId)) {
        await removeFavorite(session, productId);
      } else {
        await addFavorite(session, productId);
      }
    } catch (err) {
      // Fallback local update if network sync fails
      console.warn("Favorite sync warning:", err);
    }
  };

  const addToCart = async (product: Product) => {
    await persistCart(addProductToCart(cart, product));
  };

  const setQuantity = async (id: string, quantity: number) => {
    await persistCart(setCartItemQuantity(cart, id, quantity));
  };

  const clearCart = async () => persistCart([]);

  const value = useMemo(
    () => ({
      session,
      preferences,
      products,
      banners,
      collections,
      cart,
      favoriteIds,
      loading,
      configured,
      error,
      refresh,
      setSession,
      setPreferences,
      toggleFavorite,
      addToCart,
      setQuantity,
      clearCart,
    }),
    [
      session,
      preferences,
      products,
      banners,
      collections,
      cart,
      favoriteIds,
      loading,
      configured,
      error,
    ]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useTipsStore() {
  const value = useContext(Context);
  if (!value) {
    throw new Error("useTipsStore must be used within TipsStoreProvider");
  }
  return value;
}
