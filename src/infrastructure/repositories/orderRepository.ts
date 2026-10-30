import { supabase } from '../supabase/client';
import type { CartPricing, CouponPreview, DeliveryQuote, Order, OrderItem, OrderReturn, OrderStatusEntry, ReturnItem, ReturnResolution } from '../../domain/entities';

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
    // Both null when GPS was denied or unavailable: the zone (state + locality) then prices the Order and staff confirm the address by phone.
    customerLat: number | null;
    customerLng: number | null;
    pointsToRedeem?: number;
}

export const ORDER_PAGE_SIZE = 10;

// A checkout line as the backend takes it: the Variant is optional and must belong to the Product.
export type CheckoutItem = { id: string; quantity: number; variant_id?: string | null };

export interface CheckoutResult {
    orderId: string;
    orderNumber: string;
    total: number;
    shippingFee: number;
    warehousesCount: number;
    distanceKm: number;
}

type OrderRow = {
    id: string; order_number: string | null; items: unknown; total: number; shipping_fee: number | null; discount_amount: number | null; coupon_code: string | null;
    points_discount: number | null; status: string; payment_method: string; payment_status: string; payment_reference: string | null;
    shipping_address: string; city: string | null; state: string | null; created_at: string; estimated_delivery_at: string | null;
};

// staff_note is deliberately absent: it is the warehouse's internal instruction, not the customer's.
const ORDER_COLUMNS = 'id,order_number,items,total,shipping_fee,discount_amount,coupon_code,points_discount,status,payment_method,payment_status,payment_reference,shipping_address,city,state,created_at,estimated_delivery_at';

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
        estimatedDeliveryAt: row.estimated_delivery_at,
    };
}

// One page of the customer's orders, newest first. A page shorter than the limit means there is nothing more to load.
export async function fetchMyOrders(offset = 0, limit = ORDER_PAGE_SIZE): Promise<Order[]> {
    const { data, error } = await supabase
        .from('orders')
        .select(ORDER_COLUMNS)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);
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

// The driver bringing an order, only while it is on the road (backend-scoped to the customer's
// own shipped order). Null once delivered, failed, or before pickup.
export interface DeliveryView {
    driverName: string;
    driverPhone: string;
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    locationUpdatedAt: string | null;
}

export async function fetchMyDelivery(orderId: string): Promise<DeliveryView | null> {
    const { data, error } = await supabase.rpc('get_my_delivery', { p_order_id: orderId });
    if (error) throw error;
    const row = (data as { driver_name: string; driver_phone: string; latitude: number | null; longitude: number | null; accuracy_meters: number | null; location_updated_at: string | null }[] | null)?.[0];
    if (!row) return null;
    return {
        driverName: row.driver_name,
        driverPhone: row.driver_phone,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        accuracyMeters: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
        locationUpdatedAt: row.location_updated_at,
    };
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

// Issuing replaces any earlier code for the order, so the value returned here is the only valid one.
export async function issueDeliveryCode(orderId: string): Promise<string> {
    const { data, error } = await supabase.rpc('customer_issue_delivery_code', { p_order_id: orderId });
    if (error) throw error;
    return data as string;
}

export async function checkout(input: CheckoutInput): Promise<CheckoutResult> {
    const { data, error } = await supabase.rpc('checkout_order_safe' as never, {
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_shipping_address: input.shippingAddress,
        p_city: input.zoneName,
        p_state: input.state,
        p_payment_method: input.paymentMethod,
        p_items: input.items,
        p_customer_lat: input.customerLat,
        p_customer_lng: input.customerLng,
        p_coupon_code: input.couponCode?.trim() || undefined,
        p_points_to_redeem: input.pointsToRedeem ?? 0,
        p_idempotency_key: input.idempotencyKey,
    } as never);
    if (error) throw error;
    const row = (data as { order_id: string; order_number: string; total: number; shipping_fee: number; warehouses_count: number | null; distance_km: number | null }[] | null)?.[0];
    if (!row) throw new Error('Checkout returned no order');
    return {
        orderId: row.order_id,
        orderNumber: row.order_number,
        total: Number(row.total),
        shippingFee: Number(row.shipping_fee),
        warehousesCount: Number(row.warehouses_count ?? 1),
        distanceKm: Number(row.distance_km ?? 0),
    };
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

// What checkout will charge for the Cart's goods (promotions and the Coupon included), line by line.
// Read-only and repeatable; the Order is still priced again at placement.
export async function previewCartPricing(items: CheckoutItem[], couponCode?: string | null): Promise<CartPricing> {
    const { data, error } = await supabase.rpc('preview_cart_pricing', { p_items: items, p_coupon_code: couponCode?.trim() || undefined });
    if (error) throw error;
    if (!data) throw new Error('Cart pricing preview returned nothing');
    // Lines cover every submitted item, so the smallest line_index is the first item's, whatever its base.
    const firstLineIndex = data.lines.reduce((min, l) => Math.min(min, l.line_index), Infinity);
    return {
        lines: data.lines.map((l) => ({
            lineIndex: l.line_index - firstLineIndex,
            productId: l.product_id,
            variantId: l.variant_id ?? null,
            quantity: Number(l.quantity),
            unitPrice: Number(l.unit_price),
            lineTotal: Number(l.line_total),
            effectiveUnitPrice: Number(l.effective_unit_price),
            pricingRuleKind: l.pricing_rule_kind,
            promotionId: l.promotion_id,
            promotionType: l.promotion_type,
        })),
        baseSubtotal: Number(data.base_subtotal),
        lineReductions: Number(data.line_reductions),
        subtotal: Number(data.subtotal),
        appliedPromotions: data.applied_promotions.map((p) => ({
            promotionId: p.promotion_id,
            promotionType: p.promotion_type,
            ruleLabel: p.rule_label,
            reduction: Number(p.reduction),
        })),
        coupon: data.coupon ? { code: data.coupon.code, reduction: Number(data.coupon.reduction), reason: data.coupon.reason } : null,
    };
}

// A side-effect-free preview of the delivery fee checkout_order_safe will freeze into the Order:
// both resolve the fulfilling warehouses and call the same calculate_delivery_quote RPC, so the
// preview can never show a number the real order wouldn't also charge. Without a GPS pin (null) the
// backend may refuse; the caller then shows the selected zone's fee as an estimate.
export async function previewDeliveryQuote(
    items: CheckoutItem[],
    customerLat: number | null,
    customerLng: number | null,
): Promise<DeliveryQuote> {
    const { data, error } = await supabase.rpc('preview_delivery_quote' as never, {
        p_items: items,
        p_customer_lat: customerLat,
        p_customer_lng: customerLng,
    } as never);
    if (error) throw error;
    const row = (data as { fee: number; eta_minutes: number | null; source: string; warehouses_count: number | null; distance_km: number | null }[] | null)?.[0];
    if (!row) throw new Error('Delivery quote preview returned nothing');
    return {
        fee: Number(row.fee),
        etaMinutes: row.eta_minutes,
        source: row.source,
        warehousesCount: Number(row.warehouses_count ?? 1),
        distanceKm: Number(row.distance_km ?? 0),
    };
}

type OrderReturnRow = {
    id: string; order_id: string; items: unknown; reason: string; requested_resolution: string; status: string;
    customer_note: string | null; admin_note: string | null; created_at: string; updated_at: string;
};

function mapOrderReturn(row: OrderReturnRow): OrderReturn {
    return {
        id: row.id,
        orderId: row.order_id,
        items: Array.isArray(row.items) ? (row.items as ReturnItem[]) : [],
        reason: row.reason,
        requestedResolution: row.requested_resolution as ReturnResolution,
        status: row.status as OrderReturn['status'],
        customerNote: row.customer_note,
        adminNote: row.admin_note,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export async function fetchOrderReturns(orderId: string): Promise<OrderReturn[]> {
    const { data, error } = await supabase.from('order_returns')
        .select('id,order_id,items,reason,requested_resolution,status,customer_note,admin_note,created_at,updated_at')
        .eq('order_id', orderId).order('created_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as OrderReturnRow[]).map(mapOrderReturn);
}

export interface ReturnRequestInput {
    orderId: string;
    items: ReturnItem[];
    reason: string;
    requestedResolution: ReturnResolution;
    customerNote?: string | null;
}

export async function requestReturn(input: ReturnRequestInput): Promise<string> {
    const { data, error } = await supabase.rpc('request_order_return', {
        p_order_id: input.orderId,
        p_items: input.items,
        p_reason: input.reason.trim(),
        p_requested_resolution: input.requestedResolution,
        p_customer_note: input.customerNote?.trim() || undefined,
    });
    if (error) throw error;
    return data as string;
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
