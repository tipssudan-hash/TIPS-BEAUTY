import { supabase } from './supabase';

// Orders / dashboard API. Product and catalogue CRUD live in catalogApi.ts.

export interface OrderItem {
    id: string;
    quantity: number;
    name_ar?: string;
    unit_price?: number;
    discount_percentage?: number;
    line_total?: number;
}

export interface AdminOrder {
    id: string;
    order_number: string | null;
    customer_id: string | null;
    customer_name: string;
    phone: string;
    items: OrderItem[];
    total: number;
    shipping_fee: number;
    discount_amount: number;
    points_discount: number;
    status: string;
    payment_method: string;
    payment_status: string;
    payment_reference: string | null;
    shipping_address: string;
    city: string | null;
    state: string | null;
    notes: string | null;
    driver_id: string | null;
    fulfillment_warehouse_id: string | null;
    created_at: string;
    viewed_at: string | null;
}

export const ORDER_LIST_COLUMNS = 'id,order_number,customer_name,phone,total,status,payment_method,payment_status,created_at,viewed_at';
const ORDER_DETAIL_COLUMNS = `${ORDER_LIST_COLUMNS},customer_id,items,shipping_fee,discount_amount,points_discount,payment_reference,shipping_address,city,state,notes,driver_id,fulfillment_warehouse_id`;

export type OrderListRow = Pick<AdminOrder, 'id' | 'order_number' | 'customer_name' | 'phone' | 'total' | 'status' | 'payment_method' | 'payment_status' | 'created_at' | 'viewed_at'>;

export interface OrderListFilters {
    status?: string;
    paymentStatus?: string;
    search?: string;
    page: number;
    pageSize: number;
}

export async function fetchOrders(filters: OrderListFilters): Promise<{ rows: OrderListRow[]; total: number }> {
    const from = filters.page * filters.pageSize;
    let query = supabase.from('orders').select(ORDER_LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + filters.pageSize - 1);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
    const search = filters.search?.trim();
    if (search) {
        const escaped = search.replace(/[%,()]/g, ' ');
        query = query.or(`order_number.ilike.%${escaped}%,customer_name.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }
    const { data, error, count } = await query;
    if (error) throw error;
    // viewed_at was added by migration 0005; database.types.ts predates it.
    return { rows: (data ?? []) as unknown as OrderListRow[], total: count ?? 0 };
}

export async function countUnseenOrders(): Promise<number> {
    const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'new').is('viewed_at', null);
    if (error) throw error;
    return count ?? 0;
}

export async function fetchOrder(id: string): Promise<AdminOrder | null> {
    const { data, error } = await supabase.from('orders').select(ORDER_DETAIL_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as AdminOrder & { items: unknown };
    return {
        ...row,
        items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
        total: Number(row.total),
        shipping_fee: Number(row.shipping_fee ?? 0),
        discount_amount: Number(row.discount_amount ?? 0),
        points_discount: Number(row.points_discount ?? 0),
    };
}

export async function markOrderViewed(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('mark_order_viewed', { p_order_id: orderId });
    if (error) throw error;
}

export interface OrderHistoryEntry {
    id: string;
    status: string;
    note: string | null;
    created_at: string;
}

export async function fetchOrderHistory(orderId: string): Promise<OrderHistoryEntry[]> {
    const { data, error } = await supabase.from('order_status_history').select('id,status,note,created_at').eq('order_id', orderId).order('created_at');
    if (error) throw error;
    return data ?? [];
}

export interface UpdateOrderInput {
    orderId: string;
    expectedStatus: string;
    status?: string;
    driverId?: string | null;
    warehouseId?: string | null;
    note?: string;
}

export async function updateOrderOperation(input: UpdateOrderInput): Promise<void> {
    const { error } = await supabase.rpc('admin_update_order_operation', {
        p_order_id: input.orderId,
        p_expected_status: input.expectedStatus,
        p_status: input.status ?? undefined,
        p_driver_id: input.driverId ?? undefined,
        p_warehouse_id: input.warehouseId ?? undefined,
        p_note: input.note?.trim() || undefined,
    });
    if (error) throw error;
}

export interface PaymentProof {
    id: string;
    order_id: string;
    payment_method: string;
    amount: number;
    transaction_reference: string | null;
    proof_path: string;
    status: string;
    review_note: string | null;
    submitted_at: string;
    reviewed_at: string | null;
}

export async function fetchPaymentProof(orderId: string): Promise<PaymentProof | null> {
    const { data, error } = await supabase.from('payment_proofs').select('id,order_id,payment_method,amount,transaction_reference,proof_path,status,review_note,submitted_at,reviewed_at').eq('order_id', orderId).maybeSingle();
    if (error) throw error;
    return data ? { ...data, amount: Number(data.amount) } : null;
}

export async function signedProofUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('payment-proofs').createSignedUrl(path, 600);
    if (error) return null;
    return data.signedUrl;
}

export async function reviewPaymentProof(proofId: string, status: 'verified' | 'rejected', note?: string): Promise<void> {
    const { error } = await supabase.rpc('review_payment_proof', { p_proof_id: proofId, p_status: status, p_review_note: note?.trim() || undefined });
    if (error) throw error;
}

export interface DriverOption {
    id: string;
    name: string;
    phone: string;
    status: string;
    warehouse_id: string | null;
    vehicle: string | null;
}

export async function fetchDrivers(): Promise<DriverOption[]> {
    const { data, error } = await supabase.from('drivers').select('id,name,phone,status,warehouse_id,vehicle').order('name');
    if (error) throw error;
    return data ?? [];
}

export interface WarehouseOption {
    id: string;
    name: string;
    code: string;
    state: string;
    city: string;
    is_active: boolean;
}

export async function fetchActiveWarehouses(): Promise<WarehouseOption[]> {
    const { data, error } = await supabase.from('warehouses').select('id,name,code,state,city,is_active').eq('is_active', true).order('name');
    if (error) throw error;
    return data ?? [];
}

export interface BusinessReport {
    revenue: number;
    paid_revenue: number;
    orders: number;
    delivered_orders: number;
    pending_payments: number;
    returns: number;
    by_city: { city: string; orders: number; revenue: number }[];
    low_stock: { product_id: string; product_name: string; warehouse: string; quantity: number; reorder_level: number }[];
}

export async function fetchBusinessReport(start: Date, end: Date): Promise<BusinessReport> {
    const toDate = (d: Date) => d.toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc('admin_business_report', { p_start: toDate(start), p_end: toDate(end) });
    if (error) throw error;
    const report = (data ?? {}) as Partial<BusinessReport>;
    return {
        revenue: Number(report.revenue ?? 0),
        paid_revenue: Number(report.paid_revenue ?? 0),
        orders: Number(report.orders ?? 0),
        delivered_orders: Number(report.delivered_orders ?? 0),
        pending_payments: Number(report.pending_payments ?? 0),
        returns: Number(report.returns ?? 0),
        by_city: Array.isArray(report.by_city) ? report.by_city : [],
        low_stock: Array.isArray(report.low_stock) ? report.low_stock : [],
    };
}

export function subscribeToOrders(onChange: () => void): () => void {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
        .channel(`orders-changes-${Math.random().toString(36).slice(2)}`)
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
