import { supabase } from '../supabase/client';
import type { OrderStatus } from '../../domain/entities';
import { deliveryCodeRefusalMessage, translatedError } from '../../application/errors';

// Driver surface (/driver/*): every read is an allow-listed RPC, every write an existing driver RPC.
// Stock, prices, coupons and customer accounts never reach this side.

export type DeliveryStatus = Extract<OrderStatus, 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'delivery_failed'>;

export interface DeliveryItem {
    id?: string;
    productId?: string;
    name_ar: string;
    variant_name: string | null;
    quantity: number;
    imageUrl?: string | null;
    unitPrice?: number | null;
    lineTotal?: number | null;
}

export interface Delivery {
    id: string;
    orderNumber: string;
    status: DeliveryStatus;
    createdAt: string;
    statusChangedAt: string | null;
    customerName: string;
    phone: string;
    address: string;
    city: string | null;
    state: string | null;
    notes: string | null;
    items: DeliveryItem[];
    itemCount: number;
    paymentMethod: string;
    // Cash to collect on the doorstep; null for paid or non-cash orders.
    codAmount: number | null;
    codCollected: boolean;
    warehouseName: string | null;
    customerLat: number | null;
    customerLng: number | null;
    // Promised arrival set by the warehouse; the internal note is for the driver only, never the customer's notes.
    estimatedDeliveryAt: string | null;
    staffNote: string | null;
}

type DeliveryRow = {
    id: string; order_number: string | null; status: string; created_at: string; status_changed_at: string | null;
    customer_name: string; phone: string; shipping_address: string; city: string | null; state: string | null; notes: string | null;
    items: unknown; item_count: number; payment_method: string; cod_amount: number | null; cod_collected: boolean; warehouse_name: string | null;
    customer_lat: number | null; customer_lng: number | null; estimated_delivery_at: string | null; staff_note: string | null;
};

function mapDelivery(row: DeliveryRow): Delivery {
    const rawItems = Array.isArray(row.items) ? (row.items as Record<string, unknown>[]) : [];
    const items: DeliveryItem[] = rawItems.map((i) => ({
        id: (i.product_id as string) || (i.id as string) || undefined,
        productId: (i.product_id as string) || (i.id as string) || undefined,
        name_ar: (i.name_ar as string) || 'منتج',
        variant_name: (i.variant_name as string) || null,
        quantity: Number(i.quantity ?? 1),
        imageUrl: (i.image_url as string) || (i.image as string) || null,
        unitPrice: i.unit_price != null ? Number(i.unit_price) : null,
        lineTotal: i.line_total != null ? Number(i.line_total) : null,
    }));

    return {
        id: row.id,
        orderNumber: row.order_number ?? '',
        status: row.status as DeliveryStatus,
        createdAt: row.created_at,
        statusChangedAt: row.status_changed_at,
        customerName: row.customer_name,
        phone: row.phone,
        address: row.shipping_address,
        city: row.city,
        state: row.state,
        notes: row.notes,
        items,
        itemCount: items.reduce((sum, item) => sum + item.quantity, 0) || Number(row.item_count ?? 0),
        paymentMethod: row.payment_method,
        codAmount: row.cod_amount == null ? null : Number(row.cod_amount),
        codCollected: Boolean(row.cod_collected),
        warehouseName: row.warehouse_name,
        customerLat: row.customer_lat == null ? null : Number(row.customer_lat),
        customerLng: row.customer_lng == null ? null : Number(row.customer_lng),
        estimatedDeliveryAt: row.estimated_delivery_at ?? null,
        staffNote: row.staff_note ?? null,
    };
}

export async function fetchMyDeliveries(): Promise<Delivery[]> {
    const { data, error } = await supabase.rpc('get_my_deliveries');
    if (error) throw error;
    return ((data ?? []) as DeliveryRow[]).map(mapDelivery);
}

export async function fetchMyDelivery(orderId: string): Promise<Delivery | null> {
    const { data, error } = await supabase.rpc('get_my_deliveries', { p_order_id: orderId });
    if (error) throw error;
    const row = (data as DeliveryRow[] | null)?.[0];
    return row ? mapDelivery(row) : null;
}

export interface DriverProfile { id: string; name: string; status: 'active' | 'busy' | 'offline'; warehouseId: string | null }

export async function fetchMyDriverProfile(): Promise<DriverProfile | null> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase.from('drivers').select('id,name,status,warehouse_id').maybeSingle();
    if (error) throw error;
    if (data) {
        return { id: data.id, name: data.name, status: data.status as DriverProfile['status'], warehouseId: data.warehouse_id };
    }
    const { data: prof } = await supabase.from('profiles').select('full_name, role').eq('id', user.id).maybeSingle();
    if (prof?.role === 'driver') {
        return { id: user.id, name: prof.full_name || 'المندوب', status: 'active', warehouseId: null };
    }
    return null;
}

export async function setMyAvailability(status: 'active' | 'offline'): Promise<void> {
    const { error } = await supabase.rpc('set_driver_availability', { p_status: status });
    if (error) throw error;
}

// shipped = picked up; delivered / delivery_failed close the delivery (reason required on failure).
// delivered is verified server-side: the code the customer shows must match, or the call is refused.
// proofPath is a delivery-proofs object under `${orderId}/`; repeating the current status is not an error.
// A COD order paid by bank transfer carries its receipt (uploadDriverCodReceipt) and stays out of the cash drawer.
export async function updateMyDeliveryStatus(
    orderId: string,
    status: 'shipped' | 'delivered' | 'delivery_failed',
    failureReason?: string,
    note?: string,
    deliveryCode?: string,
    proofPath?: string,
    paymentType: 'cash' | 'bank_transfer' = 'cash',
    receiptPath?: string,
): Promise<void> {
    const { data, error } = await supabase.rpc('update_driver_order_status', {
        p_order_id: orderId,
        p_status: status,
        p_failure_reason: failureReason,
        p_note: note,
        p_delivery_code: deliveryCode,
        p_proof_path: proofPath,
        p_payment_type: paymentType,
        p_receipt_path: receiptPath,
    });
    if (error) throw translatedError(error);
    const refusal = deliveryCodeRefusalMessage(data);
    if (refusal) throw new Error(refusal);
}

// Private bucket: only the assigned driver may INSERT, and the object name is the proof reference the status call carries.
export async function uploadDeliveryProof(orderId: string, photo: Blob): Promise<string> {
    const path = `${orderId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from('delivery-proofs').upload(path, photo, { contentType: 'image/jpeg', upsert: false });
    if (error) throw error;
    return path;
}

// payment-proofs bucket; the assigned driver may INSERT only under `cod-receipts/${orderId}/`.
export async function uploadDriverCodReceipt(orderId: string, file: File): Promise<string> {
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `cod-receipts/${orderId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('payment-proofs').upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw error;
    return path;
}

export interface PickupCheck { lineNo: number; checkedQty: number }

// The pickup checklist lives on the server so it survives a reload; line_no is the 1-based position in orders.items.
export async function fetchPickupChecks(orderId: string): Promise<PickupCheck[]> {
    const { data, error } = await supabase.rpc('staff_get_item_checks', { p_order_id: orderId });
    if (error) throw translatedError(error);
    return (data ?? [])
        .filter((row) => row.stage === 'pickup')
        .map((row) => ({ lineNo: Number(row.line_no), checkedQty: Number(row.checked_qty) }));
}

export async function driverSetPickupCheck(orderId: string, lineNo: number, checkedQty: number): Promise<void> {
    const { error } = await supabase.rpc('driver_set_pickup_check', { p_order_id: orderId, p_line_no: lineNo, p_checked_qty: checkedQty });
    if (error) throw translatedError(error);
}

export interface DriverSummary {
    delivered: number;
    failed: number;
    cashCollected: number;
    cashRemitted: number;
}

// Counts and cash for the driver's own deliveries between two business dates (YYYY-MM-DD, inclusive).
export async function fetchMyDriverSummary(from: string, to: string): Promise<DriverSummary> {
    const { data, error } = await supabase.rpc('get_my_driver_summary', { p_from: from, p_to: to });
    if (error) throw translatedError(error);
    const row = (data ?? {}) as unknown as Record<string, number | string | null | undefined>;
    return {
        delivered: Number(row.delivered ?? 0),
        failed: Number(row.failed ?? 0),
        cashCollected: Number(row.cod_collected ?? 0),
        cashRemitted: Number(row.remitted_confirmed ?? 0),
    };
}

export async function shareMyLocation(latitude: number, longitude: number, accuracyMeters: number | null): Promise<void> {
    const { error } = await supabase.rpc('share_driver_location', { p_latitude: latitude, p_longitude: longitude, p_accuracy_meters: accuracyMeters ?? undefined });
    if (error) throw error;
}

export async function clearMyLocation(): Promise<void> {
    const { error } = await supabase.rpc('clear_driver_location');
    if (error) throw error;
}

// Realtime on the driver's assigned orders is filtered server-side by RLS; the driver only ever
// receives rows where drivers.user_id matches. Debounced like the customer's order channel.
export function subscribeToMyDeliveries(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
        .channel(`driver-deliveries-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(onChange, 400);
        })
        .subscribe();
    return () => {
        if (timer) clearTimeout(timer);
        void supabase.removeChannel(channel);
    };
}

export type CashEntryType = 'cod_collected' | 'remittance_confirmed' | 'adjustment';

export interface CashPositionEntry {
    orderNumber: string | null;
    entryType: CashEntryType;
    amount: number;
    createdAt: string;
}

export interface CashPosition {
    businessDate: string;
    openingBalance: number;
    collected: number;
    remittedConfirmed: number;
    pendingSubmitted: number;
    closingBalance: number;
    entries: CashPositionEntry[];
}

type CashPositionRow = {
    business_date: string;
    opening_balance: number;
    collected: number;
    remitted_confirmed: number;
    pending_submitted: number;
    closing_balance: number;
    entries: { order_number: string | null; entry_type: CashEntryType; amount: number; created_at: string }[] | null;
};

export async function fetchMyCashPosition(businessDate?: string): Promise<CashPosition> {
    const { data, error } = await supabase.rpc('get_my_cash_position', { p_business_date: businessDate });
    if (error) throw translatedError(error);
    const row = data as unknown as CashPositionRow;
    return {
        businessDate: row.business_date,
        openingBalance: Number(row.opening_balance),
        collected: Number(row.collected),
        remittedConfirmed: Number(row.remitted_confirmed),
        pendingSubmitted: Number(row.pending_submitted),
        closingBalance: Number(row.closing_balance),
        entries: (row.entries ?? []).map((e) => ({
            orderNumber: e.order_number,
            entryType: e.entry_type,
            amount: Number(e.amount),
            createdAt: e.created_at,
        })),
    };
}

export async function submitDriverCashRemittance(amount: number, notes?: string): Promise<void> {
    const { error } = await supabase.rpc('driver_submit_cash_remittance', {
        p_amount: amount,
        p_notes: notes || undefined,
    });
    if (error) throw translatedError(error);
}
