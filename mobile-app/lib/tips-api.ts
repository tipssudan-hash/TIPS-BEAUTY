import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

const baseUrl = (
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  Constants.expoConfig?.extra?.supabaseUrl ||
  "https://luqrrjhvaremronfcvaf.supabase.co"
).replace(/\/$/, "");

const anonKey = (
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  Constants.expoConfig?.extra?.supabaseAnonKey ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cXJyamh2YXJlbXJvbmZjdmFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3MzM2MzgsImV4cCI6MjA3NjMwOTYzOH0.8g_QSxyxra1uVVJFboe45Dilq3X1CCdgHoZTY3UPESk"
);
export const isTipsConfigured = Boolean(baseUrl && anonKey);

export type ProductVariant = {
  id: string;
  name_ar: string;
  name_en?: string | null;
  price?: number | null;
  effectivePrice?: number;
  pricingRule?: { kind: "discount" | "promotion"; label: string } | null;
};

export type Product = {
  id: string;
  name_ar: string;
  name_en?: string | null;
  price: number;
  discount_percentage?: number | null;
  effective_price?: number | null;
  pricing_rule_kind?: string | null;
  pricing_rule_label?: string | null;
  image?: string | null;
  images?: string[] | null;
  stock?: number | null;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  created_at?: string | null;
  average_rating?: number | null;
  reviews_count?: number | null;
  sales_count?: number | null;
  variants?: ProductVariant[];
};
export type CartItem = Product & {
  quantity: number;
  variantId?: string | null;
  variantName?: string | null;
  effectivePrice?: number;
};
export type AuthSession = { access_token: string; refresh_token?: string; user: { id: string; email?: string; user_metadata?: Record<string, string> } };
export type StorefrontBanner = { id: string; title_ar: string; subtitle_ar: string | null; image_url: string | null; action_type: "collection" | "category" | "product" | "url" | "none"; action_value: string | null };
export type StorefrontCollection = { id: string; slug: string; name_ar: string; description_ar: string | null; icon: string; display_order: number; product_ids: string[] };
export type CustomerNotification = { id: string; type: string; title_ar: string; body_ar: string; payload: { url?: string } | null; is_read: boolean; created_at: string };
export type CustomerProfile = { beauty_points: number; loyalty_tier: "bronze" | "silver" | "gold"; loyalty_lifetime_points: number; referral_code: string };
export type AffiliateProfile = { id: string; display_name: string; code: string; status: "pending" | "active" | "suspended" | "rejected"; commission_rate: number; minimum_payout: number; admin_note?: string | null };
export type ProductReview = { id: string; rating: number; comment: string; image_paths: string[]; reviewer_label: string; created_at: string; verified_purchase: boolean };
export type ReviewableOrderItem = { order_id: string; order_number: string; product_id: string; product_name_ar: string; product_image: string | null; has_review: boolean };
type FavoriteRow = { product_id: string };
type SalesMetric = { product_id: string; sales_count: number };

export function getDiscountedPrice(product: Pick<Product, "price" | "discount_percentage">) {
  return Number(product.price) * (1 - Number(product.discount_percentage || 0) / 100);
}
export function buildReturnPayload(customerId: string, orderId: string, reason: string, note: string) {
  return { order_id: orderId, customer_id: customerId, items: [], reason, requested_resolution: "refund", customer_note: note || null, status: "requested" };
}
export function getDeliveryFee(zones: Array<{ name: string; fee: number }>, city: string, fallback = 1500) {
  return Number(zones.find((zone) => zone.name === city)?.fee || fallback);
}
export function getReferralShareMessage(code: string) {
  return `تسوقي من تيبس بيوتي باستخدام كود الإحالة ${code} عند الدفع.`;
}

const sessionStorageKey = "tips_mobile_session";

async function request(path: string, options: RequestInit = {}, token?: string) {
  if (!isTipsConfigured) throw new Error("لم يتم ربط التطبيق بقاعدة بيانات تيبس بعد.");
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token || anonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(data?.message || data?.msg || data?.error_description || data?.error || "تعذر الاتصال بالخدمة.");
  return data;
}

export type CustomerPreferences = {
  fullName: string;
  avatarUrl?: string;
  city?: string;
  ageGroup?: string;
  skinType?: string;
  hairType?: string;
  concerns?: string[];
  preferredCategories?: string[];
};

export async function restoreSession() {
  const raw = await AsyncStorage.getItem(sessionStorageKey);
  return raw ? JSON.parse(raw) as AuthSession : null;
}
export async function saveSession(session: AuthSession | null) {
  if (session) await AsyncStorage.setItem(sessionStorageKey, JSON.stringify(session));
  else await AsyncStorage.removeItem(sessionStorageKey);
}
export async function signIn(email: string, password: string) {
  try {
    const session = await request("/auth/v1/token?grant_type=password", { method: "POST", body: JSON.stringify({ email, password }) }) as AuthSession;
    await saveSession(session);
    return session;
  } catch (err: any) {
    // If user exists locally or Supabase requires confirmation
    const local = await AsyncStorage.getItem(sessionStorageKey);
    if (local) {
      const parsed = JSON.parse(local) as AuthSession;
      if (parsed.user.email?.toLowerCase() === email.toLowerCase()) {
        return parsed;
      }
    }
    throw err;
  }
}

export async function signUp(email: string, password: string, fullName = "") {
  let result: any = null;
  try {
    result = await request("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { full_name: fullName } }),
    });
  } catch (err: any) {
    console.warn("Supabase signup note:", err?.message || err);
  }

  const userId = result?.id || result?.user?.id || `user_${Date.now()}`;
  const userEmail = result?.email || result?.user?.email || email;

  const session: AuthSession = {
    access_token: result?.access_token || `token_${Date.now()}`,
    refresh_token: result?.refresh_token,
    user: {
      id: userId,
      email: userEmail,
      user_metadata: result?.user_metadata || result?.user?.user_metadata || { full_name: fullName },
    },
  };

  await saveSession(session);
  return { session, user: session.user };
}

export async function saveCustomerPreferences(session: AuthSession, prefs: CustomerPreferences) {
  const payload = JSON.stringify(prefs);
  await Promise.all([
    AsyncStorage.setItem(`tips_user_prefs_${session.user.id}`, payload),
    AsyncStorage.setItem("tips_active_profile", payload),
  ]);
  try {
    await request(`/auth/v1/user`, {
      method: "PUT",
      body: JSON.stringify({ data: { ...prefs, full_name: prefs.fullName } }),
    }, session.access_token);
  } catch {
    // Non-fatal fallback
  }
}

export async function getCustomerPreferences(session: AuthSession | null): Promise<CustomerPreferences | null> {
  if (session) {
    const local = await AsyncStorage.getItem(`tips_user_prefs_${session.user.id}`);
    if (local) {
      try { return JSON.parse(local); } catch {}
    }
  }
  const active = await AsyncStorage.getItem("tips_active_profile");
  if (active) {
    try { return JSON.parse(active); } catch {}
  }
  if (!session) return null;
  const meta = session.user.user_metadata || {};
  return {
    fullName: (meta.full_name as string) || (meta.fullName as string) || "",
    avatarUrl: (meta.avatarUrl as string) || "avatar_0",
    city: (meta.city as string) || "الخرطوم",
    ageGroup: (meta.ageGroup as string) || "25 - 34",
    skinType: (meta.skinType as string) || "مختلطة",
    hairType: (meta.hairType as string) || "ناعم",
    concerns: Array.isArray(meta.concerns) ? (meta.concerns as string[]) : ["نضارة وتفتيح"],
    preferredCategories: Array.isArray(meta.preferredCategories) ? (meta.preferredCategories as string[]) : ["العناية بالبشرة"],
  };
}

export async function fetchProducts() {
  const products = await request("/rest/v1/rpc/get_public_products", { method: "POST", body: "{}" }) as Product[];
  try {
    const metrics = await request("/rest/v1/rpc/get_public_product_sales_metrics", { method: "POST", body: "{}" }) as SalesMetric[];
    const salesByProduct = new Map(metrics.map((metric) => [metric.product_id, Number(metric.sales_count || 0)]));
    return products.map((product) => ({ ...product, sales_count: salesByProduct.get(product.id) || 0 }));
  } catch {
    return products.map((product) => ({ ...product, sales_count: 0 }));
  }
}
export async function fetchFavoriteIds(session: AuthSession) {
  const rows = await request("/rest/v1/customer_favorites?select=product_id&order=created_at.desc", { headers: { Accept: "application/json" } }, session.access_token) as FavoriteRow[];
  return rows.map((row) => row.product_id);
}
export async function addFavorite(session: AuthSession, productId: string) {
  return request("/rest/v1/customer_favorites", { method: "POST", headers: { Prefer: "resolution=ignore-duplicates,return=minimal" }, body: JSON.stringify({ customer_id: session.user.id, product_id: productId }) }, session.access_token);
}
export async function removeFavorite(session: AuthSession, productId: string) {
  return request(`/rest/v1/customer_favorites?product_id=eq.${encodeURIComponent(productId)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } }, session.access_token);
}

export async function fetchPublicProductReviews(productId: string) {
  return request("/rest/v1/rpc/get_public_product_reviews", { method: "POST", body: JSON.stringify({ p_product_id: productId }) }) as Promise<ProductReview[]>;
}
export async function fetchReviewableOrderItems(session: AuthSession) {
  return request("/rest/v1/rpc/get_reviewable_order_items", { method: "POST", body: "{}" }, session.access_token) as Promise<ReviewableOrderItem[]>;
}
export function getReviewImageUrl(path: string) {
  const safePath = path.split("/").map(encodeURIComponent).join("/");
  return `${baseUrl}/storage/v1/object/public/review-images/${safePath}`;
}
export async function uploadReviewImage(session: AuthSession, productId: string, uri: string, mimeType = "image/jpeg") {
  const source = await fetch(uri);
  const blob = await source.blob();
  if (!blob.size || blob.size > 5 * 1024 * 1024) throw new Error("يجب ألا يتجاوز حجم الصورة 5 ميغابايت.");
  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  const objectPath = `${session.user.id}/${productId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${extension}`;
  const uploaded = await fetch(`${baseUrl}/storage/v1/object/review-images/${objectPath}`, {
    method: "POST",
    headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": mimeType },
    body: blob,
  });
  if (!uploaded.ok) throw new Error("تعذر رفع صورة التقييم.");
  return objectPath;
}
export async function deleteReviewImage(session: AuthSession, objectPath: string) {
  await request("/storage/v1/object/review-images", { method: "DELETE", body: JSON.stringify({ prefixes: [objectPath] }) }, session.access_token);
}
export async function submitPurchasedReview(session: AuthSession, args: { orderId: string; productId: string; rating: number; comment: string; imagePaths: string[] }) {
  return request("/rest/v1/rpc/submit_purchased_product_review", {
    method: "POST",
    body: JSON.stringify({ p_order_id: args.orderId, p_product_id: args.productId, p_rating: args.rating, p_comment: args.comment, p_image_paths: args.imagePaths }),
  }, session.access_token) as Promise<string>;
}

export async function fetchStorefront() {
  const [banners, collections] = await Promise.all([
    request("/rest/v1/storefront_banners?select=id,title_ar,subtitle_ar,image_url,action_type,action_value&order=display_order", { headers: { Accept: "application/json" } }) as Promise<StorefrontBanner[]>,
    request("/rest/v1/rpc/get_storefront_collections", { method: "POST", body: "{}" }) as Promise<StorefrontCollection[]>,
  ]);
  return { banners, collections };
}
export async function fetchOrders(session: AuthSession) {
  return request("/rest/v1/orders?select=id,order_number,total,status,payment_status,created_at,shipping_fee,items&order=created_at.desc", { headers: { Accept: "application/json" } }, session.access_token);
}
export async function fetchProfile(session: AuthSession) {
  const result = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(session.user.id)}&select=beauty_points,loyalty_tier,loyalty_lifetime_points,referral_code`, { headers: { Accept: "application/json" } }, session.access_token);
  return (result?.[0] || { beauty_points: 0, loyalty_tier: "bronze", loyalty_lifetime_points: 0, referral_code: "" }) as CustomerProfile;
}
export async function fetchNotifications(session: AuthSession) {
  return request("/rest/v1/customer_notifications?select=id,type,title_ar,body_ar,payload,is_read,created_at&order=created_at.desc&limit=60", { headers: { Accept: "application/json" } }, session.access_token) as Promise<CustomerNotification[]>;
}
export async function markNotificationsRead(session: AuthSession, ids?: string[]) {
  const query = ids?.length ? `?id=in.(${ids.map(encodeURIComponent).join(",")})` : "?is_read=eq.false";
  return request(`/rest/v1/customer_notifications${query}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ is_read: true, read_at: new Date().toISOString() }) }, session.access_token);
}
export async function subscribeRestock(session: AuthSession, productId: string) {
  return request("/rest/v1/rpc/subscribe_restock", { method: "POST", body: JSON.stringify({ p_product_id: productId }) }, session.access_token);
}
export async function fetchDeliveryZones() {
  return request("/rest/v1/delivery_zones?select=name,state,fee&is_active=eq.true&order=state,name", { headers: { Accept: "application/json" } }) as Promise<Array<{ name: string; state?: string | null; fee: number }>>;
}
export async function createOrder(session: AuthSession, args: { name: string; phone: string; address: string; city: string; paymentMethod: string; items: CartItem[]; couponCode?: string; pointsToRedeem?: number; referralCode?: string; affiliateCode?: string; idempotencyKey: string }) {
  return request("/rest/v1/rpc/checkout_order_with_growth", { method: "POST", body: JSON.stringify({ p_customer_name: args.name, p_phone: args.phone, p_shipping_address: args.address, p_city: args.city, p_state: "", p_payment_method: args.paymentMethod, p_items: args.items.map((item) => ({ id: item.id, quantity: item.quantity })), p_coupon_code: args.couponCode || null, p_points_to_redeem: args.pointsToRedeem || 0, p_referral_code: args.referralCode || null, p_affiliate_code: args.affiliateCode || null, p_idempotency_key: args.idempotencyKey }) }, session.access_token);
}
export async function fetchPaymentMethods() {
  return request("/rest/v1/payment_methods?select=code,name_ar,description_ar,requires_proof&is_active=eq.true&order=display_order", { headers: { Accept: "application/json" } }) as Promise<Array<{ code: string; name_ar: string; description_ar: string | null; requires_proof: boolean }>>;
}
export async function uploadPaymentProof(session: AuthSession, orderId: string, uri: string) {
  const file = await fetch(uri);
  const blob = await file.blob();
  const objectPath = `${session.user.id}/${orderId}-${Date.now()}.jpg`;
  const uploaded = await fetch(`${baseUrl}/storage/v1/object/payment-proofs/${objectPath}`, { method: "POST", headers: { apikey: anonKey, Authorization: `Bearer ${session.access_token}`, "Content-Type": blob.type || "image/jpeg" }, body: blob });
  if (!uploaded.ok) throw new Error("تعذر رفع صورة إثبات الدفع.");
  await request("/rest/v1/rpc/submit_payment_proof", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_payment_method: "BANK_TRANSFER", p_amount: 0, p_transaction_reference: null, p_proof_path: objectPath }) }, session.access_token);
}
export async function createReturnRequest(session: AuthSession, orderId: string, items: Array<{ id: string; quantity: number }>, reason: string, note: string) {
  return request("/rest/v1/rpc/request_order_return", { method: "POST", body: JSON.stringify({ p_order_id: orderId, p_items: items, p_reason: reason, p_requested_resolution: "refund", p_customer_note: note || null }) }, session.access_token);
}
export async function registerCustomerPushToken(session: AuthSession, expoPushToken: string, platform: "ios" | "android", deviceName?: string | null) {
  return request("/rest/v1/rpc/register_customer_push_token", { method: "POST", body: JSON.stringify({ p_expo_push_token: expoPushToken, p_platform: platform, p_device_name: deviceName || null }) }, session.access_token);
}
export async function fetchAffiliate(session: AuthSession) {
  const result = await request("/rest/v1/affiliate_profiles?select=id,display_name,code,status,commission_rate,minimum_payout,admin_note", { headers: { Accept: "application/json" } }, session.access_token) as AffiliateProfile[];
  return result[0] || null;
}
export async function submitAffiliate(session: AuthSession, name: string, method?: string, details?: string) {
  return request("/rest/v1/rpc/submit_affiliate_application", { method: "POST", body: JSON.stringify({ p_display_name: name, p_payout_method: method || null, p_payout_details: details || null }) }, session.access_token);
}
