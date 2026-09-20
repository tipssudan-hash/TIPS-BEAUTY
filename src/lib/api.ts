import { supabase } from './supabase';
import type { DeliveryZone, Order, OrderItem, OrderStatusEntry, PaymentMethod, Product, Review, ReviewableItem } from '../types';

// Thin typed wrappers over the backend RPCs. All pricing, stock and permission rules live in
// the database; this file only maps rows to app types.

type ProductRow = {
    id: string; name_ar: string; name_en: string | null; price: number; discount_percentage: number | null;
    category: string | null; brand: string | null; image: string | null; images: string[] | null; description: string | null;
    benefits: string[] | null; ingredients: string[] | null; usage: string | null; origin: string | null; expiry: string | null;
    stock: number | null; is_imported: boolean | null; skin_type: string[] | null; reviews_count: number | null;
    average_rating: number | null; created_at: string; variants: unknown;
};

export function mapProduct(row: ProductRow): Product {
    return {
        id: row.id,
        name_ar: row.name_ar,
        name_en: row.name_en ?? '',
        price: Number(row.price),
        discountPercentage: Number(row.discount_percentage ?? 0),
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
        variants: Array.isArray(row.variants) ? (row.variants as Product['variants']) : [],
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
    items: { id: string; quantity: number }[];
    idempotencyKey: string;
}

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
        p_idempotency_key: input.idempotencyKey,
    });
    if (error) throw error;
    const row = (data as { order_id: string; order_number: string; total: number; shipping_fee: number }[] | null)?.[0];
    if (!row) throw new Error('Checkout returned no order');
    return { orderId: row.order_id, orderNumber: row.order_number, total: Number(row.total), shippingFee: Number(row.shipping_fee) };
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
    id: string; order_number: string | null; items: unknown; total: number; shipping_fee: number | null; discount_amount: number | null;
    points_discount: number | null; status: string; payment_method: string; payment_status: string; payment_reference: string | null;
    shipping_address: string; city: string | null; state: string | null; created_at: string;
};

const ORDER_COLUMNS = 'id,order_number,items,total,shipping_fee,discount_amount,points_discount,status,payment_method,payment_status,payment_reference,shipping_address,city,state,created_at';

function mapOrder(row: OrderRow): Order {
    return {
        id: row.id,
        orderNumber: row.order_number ?? '',
        items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
        total: Number(row.total),
        shippingFee: Number(row.shipping_fee ?? 0),
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

export function errorMessage(error: unknown, fallback = 'حدث خطأ غير متوقع، حاولي مرة أخرى.'): string {
    if (error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string') {
        return translateBackendError((error as { message: string }).message) ?? fallback;
    }
    return fallback;
}

const backendMessages: [RegExp, string][] = [
    [/Insufficient stock/i, 'الكمية المطلوبة غير متوفرة حالياً لأحد المنتجات.'],
    [/No active warehouse/i, 'عذراً، لا يمكن توصيل هذا الطلب كاملاً إلى منطقتك حالياً.'],
    [/Inventory changed/i, 'تغيّر المخزون أثناء إتمام الطلب، يرجى المحاولة مرة أخرى.'],
    [/no longer available/i, 'أحد المنتجات لم يعد متاحاً.'],
    [/Unsupported payment method/i, 'طريقة الدفع غير مدعومة.'],
    [/Only new orders can be cancelled/i, 'لا يمكن إلغاء الطلب بعد تأكيده، تواصلي مع خدمة العملاء.'],
    [/Authentication required/i, 'يجب تسجيل الدخول أولاً.'],
    [/delivered order/i, 'يمكن تقييم المنتجات المستلمة فقط.'],
    [/already/i, 'تم تنفيذ هذا الإجراء مسبقاً.'],
];

function translateBackendError(message: string): string | null {
    for (const [pattern, text] of backendMessages) {
        if (pattern.test(message)) return text;
    }
    return /[؀-ۿ]/.test(message) ? message : null;
}
