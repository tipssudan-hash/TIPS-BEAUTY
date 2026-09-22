import { supabase } from './supabase';
import type { OrderStatus } from '../types';

// Driver surface (/driver/*): every read is an allow-listed RPC, every write an existing driver RPC.
// Stock, prices, coupons and customer accounts never reach this side.

export type DeliveryStatus = Extract<OrderStatus, 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'delivery_failed'>;

export interface DeliveryItem { name_ar: string; variant_name: string | null; quantity: number }

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
}

type DeliveryRow = {
    id: string; order_number: string | null; status: string; created_at: string; status_changed_at: string | null;
    customer_name: string; phone: string; shipping_address: string; city: string | null; state: string | null; notes: string | null;
    items: unknown; item_count: number; payment_method: string; cod_amount: number | null; warehouse_name: string | null;
};

function mapDelivery(row: DeliveryRow): Delivery {
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
        items: Array.isArray(row.items) ? (row.items as DeliveryItem[]) : [],
        itemCount: Number(row.item_count ?? 0),
        paymentMethod: row.payment_method,
        codAmount: row.cod_amount == null ? null : Number(row.cod_amount),
        warehouseName: row.warehouse_name,
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

// The driver's own row (RLS: "Drivers view their profile").
export async function fetchMyDriverProfile(): Promise<DriverProfile | null> {
    const { data, error } = await supabase.from('drivers').select('id,name,status,warehouse_id').maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, name: data.name, status: data.status as DriverProfile['status'], warehouseId: data.warehouse_id } : null;
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
