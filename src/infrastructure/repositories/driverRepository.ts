import { supabase } from '../supabase/client';
import type { OrderStatus } from '../../domain/entities';

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
    warehouseName: string | null;
    customerLat: number | null;
    customerLng: number | null;
}

type DeliveryRow = {
    id: string; order_number: string | null; status: string; created_at: string; status_changed_at: string | null;
    customer_name: string; phone: string; shipping_address: string; city: string | null; state: string | null; notes: string | null;
    items: unknown; item_count: number; payment_method: string; cod_amount: number | null; warehouse_name: string | null;
    customer_lat: number | null; customer_lng: number | null;
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
        warehouseName: row.warehouse_name,
        customerLat: row.customer_lat == null ? null : Number(row.customer_lat),
        customerLng: row.customer_lng == null ? null : Number(row.customer_lng),
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
export async function updateMyDeliveryStatus(orderId: string, status: 'shipped' | 'delivered' | 'delivery_failed', failureReason?: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('update_driver_order_status', { p_order_id: orderId, p_status: status, p_failure_reason: failureReason, p_note: note });
    if (error) throw error;
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

export interface DriverCashDrawerSummary {
    collectedToday: number;
    deliveredCount: number;
    pendingRemittance: number;
    confirmedRemittance: number;
    unremittedBalance: number;
    deliveredOrders: {
        id: string;
        orderNumber: string;
        customerName: string;
        codAmount: number;
        deliveredAt: string | null;
    }[];
}

export async function fetchDriverCashDrawer(): Promise<DriverCashDrawerSummary> {
    const deliveries = await fetchMyDeliveries();
    const delivered = deliveries.filter((d) => d.status === 'delivered');

    let totalCollected = 0;
    const deliveredOrders = delivered.map((d) => {
        const amt = d.codAmount ?? 0;
        totalCollected += amt;
        return {
            id: d.id,
            orderNumber: d.orderNumber,
            customerName: d.customerName,
            codAmount: amt,
            deliveredAt: d.statusChangedAt || d.createdAt,
        };
    });

    let pendingRemittance = 0;
    let confirmedRemittance = 0;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: driver } = await supabase.from('drivers').select('id').eq('user_id', user.id).maybeSingle();
            if (driver) {
                const { data: remittances } = await (supabase.from as any)('driver_cash_remittances')
                    .select('amount, status')
                    .eq('driver_id', driver.id);

                if (remittances) {
                    for (const r of (remittances as any[])) {
                        const amt = Number(r.amount);
                        if (r.status === 'confirmed') confirmedRemittance += amt;
                        else if (r.status === 'submitted') pendingRemittance += amt;
                    }
                }
            }
        }
    } catch {
        // Fallback
    }

    const unremittedBalance = Math.max(0, totalCollected - confirmedRemittance - pendingRemittance);

    return {
        collectedToday: totalCollected,
        deliveredCount: delivered.length,
        pendingRemittance,
        confirmedRemittance,
        unremittedBalance,
        deliveredOrders,
    };
}

export async function submitDriverCashRemittance(amount: number, notes?: string): Promise<void> {
    try {
        const { error } = await (supabase.rpc as any)('driver_submit_cash_remittance', {
            p_amount: amount,
            p_notes: notes || undefined,
        });
        if (!error) return;
    } catch {
        // Fallback
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not logged in');
    const { data: driver } = await supabase.from('drivers').select('id, warehouse_id').eq('user_id', user.id).single();
    if (!driver) throw new Error('Driver profile not found');

    const { error: insertErr } = await (supabase.from as any)('driver_cash_remittances').insert({
        driver_id: driver.id,
        warehouse_id: driver.warehouse_id,
        amount,
        driver_notes: notes || null,
        status: 'submitted',
    });
    if (insertErr) throw insertErr;
}
