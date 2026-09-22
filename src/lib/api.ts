import { supabase } from './supabase';
import type { Banner, Collection, CouponPreview, CustomerNotification, DeliveryZone, Order, OrderItem, OrderStatusEntry, PaymentMethod, PricingRule, Product, ProductVariant, Review, ReviewableItem } from '../types';

// Thin typed wrappers over the backend RPCs. All pricing, stock and permission rules live in
// the database; this file only maps rows to app types.

type ProductRow = {
    id: string; name_ar: string; name_en: string | null; price: number; discount_percentage: number | null;
    effective_price: number | null; pricing_rule_kind: string | null; pricing_rule_label: string | null;
    category: string | null; brand: string | null; image: string | null; images: string[] | null; description: string | null;
    benefits: string[] | null; ingredients: string[] | null; usage: string | null; origin: string | null; expiry: string | null;
    stock: number | null; is_imported: boolean | null; skin_type: string[] | null; reviews_count: number | null;
    average_rating: number | null; created_at: string; variants: unknown;
};

function mapPricingRule(kind: string | null | undefined, label: string | null | undefined): PricingRule | null {
    return (kind === 'discount' || kind === 'promotion') && label ? { kind, label } : null;
}

type VariantRow = { id: string; name_ar: string; name_en: string | null; price: number | null; effective_price: number | null; pricing_rule_kind: string | null; pricing_rule_label: string | null };

// Variants arrive enriched by the catalogue RPCs (public_variants) with the price each one is charged at.
function mapVariants(raw: unknown, fallbackPrice: number): ProductVariant[] {
    if (!Array.isArray(raw)) return [];
    return (raw as VariantRow[])
        .filter((v) => v && typeof v.id === 'string' && typeof v.name_ar === 'string')
        .map((v) => ({
            id: v.id,
            name_ar: v.name_ar,
            name_en: v.name_en ?? '',
            price: v.price == null ? null : Number(v.price),
            effectivePrice: Number(v.effective_price ?? v.price ?? fallbackPrice),
            pricingRule: mapPricingRule(v.pricing_rule_kind, v.pricing_rule_label),
        }));
}

export function mapProduct(row: ProductRow): Product {
    return {
        id: row.id,
        name_ar: row.name_ar,
        name_en: row.name_en ?? '',
        price: Number(row.price),
        discountPercentage: Number(row.discount_percentage ?? 0),
        effectivePrice: Number(row.effective_price ?? row.price),
        pricingRule: mapPricingRule(row.pricing_rule_kind, row.pricing_rule_label),
        category: row.category ?? '',
        brand: row.brand ?? '',
        image: row.image ?? (row.images?.[0] ?? ''),
        images: row.images?.length ? row.images : row.image ? [row.image] : [],
        description: row.description ?? '',
        benefits: row.benefits ?? [],
        ingredients: row.ingredients ?? [],
        usage: row.usage ?? '',
        origin: row.origin ?? '',
        expiry: row.expiry ?? '',
        stock: Number(row.stock ?? 0),
        isImported: Boolean(row.is_imported),
        skinType: row.skin_type ?? [],
        rating: Number(row.average_rating ?? 0),
        reviewCount: Number(row.reviews_count ?? 0),
        variants: mapVariants(row.variants, Number(row.effective_price ?? row.price)),
        createdAt: row.created_at,
    };
}

export async function fetchProducts(): Promise<Product[]> {
    const { data, error } = await supabase.rpc('get_public_products');
    if (error) throw error;
    return ((data ?? []) as ProductRow[]).map(mapProduct);
}

export async function fetchProduct(id: string): Promise<Product | null> {
    const { data, error } = await supabase.rpc('get_public_product', { p_product_id: id });
    if (error) throw error;
    const row = (data as ProductRow[] | null)?.[0];
    return row ? mapProduct(row) : null;
}

// Notifications --------------------------------------------------------------------------------
// The customer reads their own rows (own-row policy); read state goes through the RPCs.

const NOTIFICATION_COLUMNS = 'id,type,title_ar,body_ar,order_id,product_id,payload,is_read,created_at';

type NotificationRow = { id: string; type: string; title_ar: string; body_ar: string; order_id: string | null; product_id: string | null; payload: unknown; is_read: boolean; created_at: string };

function mapNotification(row: NotificationRow): CustomerNotification {
    const payload = (row.payload && typeof row.payload === 'object' ? row.payload : {}) as { url?: unknown };
    return {
        id: row.id,
        type: row.type,
        title: row.title_ar,
        body: row.body_ar,
        orderId: row.order_id,
        productId: row.product_id,
        url: typeof payload.url === 'string' ? payload.url : null,
        isRead: row.is_read,
        createdAt: row.created_at,
    };
}

export async function fetchNotifications(limit = 50): Promise<CustomerNotification[]> {
    const { data, error } = await supabase.from('customer_notifications').select(NOTIFICATION_COLUMNS).order('created_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return ((data ?? []) as NotificationRow[]).map(mapNotification);
}

export async function markNotificationRead(id: string): Promise<void> {
    const { error } = await supabase.rpc('mark_notification_read', { p_id: id });
    if (error) throw error;
}

export async function markAllNotificationsRead(): Promise<number> {
    const { data, error } = await supabase.rpc('mark_all_notifications_read');
    if (error) throw error;
    return Number(data ?? 0);
}

// Realtime on the customer's own rows (the table is in the publication; RLS scopes the stream).
// Debounced like the admin's order subscription so a burst of trigger writes reloads once.
export function subscribeToNotifications(customerId: string, onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
        .channel(`notifications-${customerId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'customer_notifications', filter: `customer_id=eq.${customerId}` }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(onChange, 400);
        })
        .subscribe();
    return () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
    };
}

// Home-page banners. Content, not eligibility data: the public SELECT policy already limits rows to
// active ones inside their schedule, so a direct read is the whole contract.
export async function fetchBanners(): Promise<Banner[]> {
    const { data, error } = await supabase.from('storefront_banners')
        .select('id,title_ar,subtitle_ar,image_url,action_type,action_value,display_order')
        .order('display_order').order('created_at');
    if (error) throw error;
    const kinds: Banner['actionType'][] = ['none', 'category', 'product', 'collection', 'url'];
    return (data ?? []).filter((b) => b.image_url).map((b) => ({
        id: b.id,
        title_ar: b.title_ar,
        subtitle_ar: b.subtitle_ar,
        imageUrl: b.image_url as string,
        actionType: kinds.includes(b.action_type as Banner['actionType']) ? (b.action_type as Banner['actionType']) : 'none',
        actionValue: b.action_value,
    }));
}

export async function fetchCollections(): Promise<Collection[]> {
    const { data, error } = await supabase.rpc('get_storefront_collections');
    if (error) throw error;
    return (data ?? []).map((c) => ({
        id: c.id,
        slug: c.slug,
        name_ar: c.name_ar,
        description_ar: c.description_ar,
        icon: c.icon,
        displayOrder: c.display_order,
        productIds: c.product_ids ?? [],
    }));
}

export async function fetchPaymentMethods(): Promise<PaymentMethod[]> {
    const { data, error } = await supabase.from('payment_methods').select('code,name_ar,description_ar,requires_proof,account_details').eq('is_active', true).order('display_order');
    if (error) throw error;
    return (data ?? []).map((m) => ({
        code: m.code,
        nameAr: m.name_ar,
        descriptionAr: m.description_ar,
        requiresProof: m.requires_proof,
        accountDetails: (m.account_details ?? {}) as Record<string, string>,
    }));
}

export async function fetchDeliveryZones(): Promise<DeliveryZone[]> {
    const { data, error } = await supabase.from('delivery_zones').select('id,name,state,fee').eq('is_active', true).order('name');
    if (error) throw error;
    return (data ?? []).map((z) => ({ id: z.id, name: z.name, state: z.state, fee: Number(z.fee) }));
}

export interface CheckoutInput {
    customerName: string;
    phone: string;
    shippingAddress: string;
    zoneName: string;
    state: string;
    paymentMethod: string;
    items: CheckoutItem[];
    couponCode?: string | null;
    idempotencyKey: string;
}

// A checkout line as the backend takes it: the Variant is optional and must belong to the Product.
export type CheckoutItem = { id: string; quantity: number; variant_id?: string | null };

export interface CheckoutResult {
    orderId: string;
    orderNumber: string;
    total: number;
    shippingFee: number;
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const { data, error } = await supabase.rpc('checkout_order_safe', {
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_shipping_address: input.shippingAddress,
        p_city: input.zoneName,
        p_state: input.state,
        p_payment_method: input.paymentMethod,
        p_items: input.items,
        p_coupon_code: input.couponCode?.trim() || undefined,
        p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    const row = (data as { order_id: string; order_number: string; total: number; shipping_fee: number }[] | null)?.[0];
    if (!row) throw new Error('Checkout returned no order');
    return { orderId: row.order_id, orderNumber: row.order_number, total: Number(row.total), shippingFee: Number(row.shipping_fee) };
}

// Asks the backend what a Coupon would do to this Cart; a refusal comes back as a typed reason.
export async function previewCoupon(code: string, items: CheckoutItem[]): Promise<CouponPreview> {
    const { data, error } = await supabase.rpc('preview_coupon', { p_code: code.trim(), p_items: items });
    if (error) throw error;
    const row = (data as { ok: boolean; reason: string | null; code: string | null; name: string | null; reduction: number; base_subtotal: number; line_reductions: number }[] | null)?.[0];
    if (!row) throw new Error('Coupon preview returned nothing');
    return {
        ok: row.ok,
        reason: row.reason as CouponPreview['reason'],
        code: row.code,
        name: row.name,
        reduction: Number(row.reduction ?? 0),
        baseSubtotal: Number(row.base_subtotal ?? 0),
        lineReductions: Number(row.line_reductions ?? 0),
    };
}

// Customers may only INSERT into payment-proofs, so every attempt gets its own object name.
export async function uploadPaymentProof(userId: string, key: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${userId}/${key}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('payment-proofs').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
}

export async function submitPaymentProof(orderId: string, paymentMethod: string, amount: number, reference: string, proofPath: string): Promise<void> {
    const { error } = await supabase.rpc('submit_payment_proof', {
        p_order_id: orderId,
        p_payment_method: paymentMethod,
        p_amount: amount,
        p_transaction_reference: reference,
        p_proof_path: proofPath,
    });
    if (error) throw error;
}

type OrderRow = {
    id: string; order_number: string | null; items: unknown; total: number; shipping_fee: number | null; discount_amount: number | null; coupon_code: string | null;
    points_discount: number | null; status: string; payment_method: string; payment_status: string; payment_reference: string | null;
    shipping_address: string; city: string | null; state: string | null; created_at: string;
};

const ORDER_COLUMNS = 'id,order_number,items,total,shipping_fee,discount_amount,coupon_code,points_discount,status,payment_method,payment_status,payment_reference,shipping_address,city,state,created_at';

function mapOrder(row: OrderRow): Order {
    return {
        id: row.id,
        orderNumber: row.order_number ?? '',
        items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
        total: Number(row.total),
        shippingFee: Number(row.shipping_fee ?? 0),
        couponCode: row.coupon_code,
        couponDiscount: Number(row.discount_amount ?? 0),
        pointsDiscount: Number(row.points_discount ?? 0),
        discountAmount: Number(row.discount_amount ?? 0) + Number(row.points_discount ?? 0),
        status: row.status as Order['status'],
        paymentMethod: row.payment_method,
        paymentStatus: row.payment_status as Order['paymentStatus'],
        paymentReference: row.payment_reference,
        shippingAddress: row.shipping_address,
        city: row.city,
        state: row.state,
        createdAt: row.created_at,
    };
}

export async function fetchMyOrders(): Promise<Order[]> {
    const { data, error } = await supabase.from('orders').select(ORDER_COLUMNS).order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as OrderRow[]).map(mapOrder);
}

export async function fetchMyOrder(id: string): Promise<Order | null> {
    const { data, error } = await supabase.from('orders').select(ORDER_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? mapOrder(data as OrderRow) : null;
}

export async function fetchOrderHistory(orderId: string): Promise<OrderStatusEntry[]> {
    const { data, error } = await supabase.from('order_status_history').select('id,status,note,created_at').eq('order_id', orderId).order('created_at');
    if (error) throw error;
    return (data ?? []).map((h) => ({ id: h.id, status: h.status as OrderStatusEntry['status'], note: h.note, createdAt: h.created_at }));
}

// Realtime on one order (own row) and its history; both tables are in the publication and RLS
// scopes the stream to the customer. Debounced so a status change plus its history row reload once.
export function subscribeToOrder(orderId: string, onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const bump = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 400); };
    const channel = supabase
        .channel(`order-${orderId}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, bump)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_status_history', filter: `order_id=eq.${orderId}` }, bump)
        .subscribe();
    return () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
    };
}

export async function cancelMyOrder(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('customer_cancel_order', { p_order_id: orderId });
    if (error) throw error;
}

export async function fetchProductReviews(productId: string): Promise<Review[]> {
    const { data, error } = await supabase.rpc('get_public_product_reviews', { p_product_id: productId });
    if (error) throw error;
    return (data ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment ?? '',
        reviewerLabel: r.reviewer_label ?? '',
        createdAt: r.created_at,
        verifiedPurchase: Boolean(r.verified_purchase),
    }));
}

export async function fetchReviewableItems(): Promise<ReviewableItem[]> {
    const { data, error } = await supabase.rpc('get_reviewable_order_items');
    if (error) throw error;
    return (data ?? []).map((r) => ({
        orderId: r.order_id,
        orderNumber: r.order_number,
        productId: r.product_id,
        productName: r.product_name_ar,
        alreadyReviewed: Boolean(r.has_review),
    }));
}

export async function submitReview(orderId: string, productId: string, rating: number, comment: string): Promise<void> {
    const { error } = await supabase.rpc('submit_purchased_product_review', {
        p_order_id: orderId,
        p_product_id: productId,
        p_rating: rating,
        p_comment: comment || undefined,
    });
    if (error) throw error;
}

export async function askBeautyAdvice(query: string, skinType?: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke('beauty-advice', { body: { query, skin_type: skinType } });
    if (error) {
        const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
        throw new Error(body?.error ?? 'تعذر الحصول على رد من المساعد حالياً.');
    }
    if (data?.error) throw new Error(data.error);
    return data?.answer ?? '';
}
