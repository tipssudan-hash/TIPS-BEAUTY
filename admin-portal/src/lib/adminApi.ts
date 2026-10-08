import { supabase } from './supabase';
import type { CustomerProfile, DeliveryChannelStats, DeliveryFailure, DeliverySummary, LoyaltyLedgerEntry } from '../types';

// Orders / dashboard API. Product and catalogue CRUD live in catalogApi.ts.

export interface OrderItem {
    id: string;
    quantity: number;
    name_ar?: string;
    variant_id?: string | null;
    variant_name?: string | null;
    variant_price?: number | null;
    unit_price?: number;
    discount_percentage?: number;
    effective_unit_price?: number;
    pricing_rule_kind?: 'discount' | 'promotion' | null;
    pricing_rule_label?: string | null;
    promotion_id?: string | null;
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
    coupon_code: string | null;
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
    needs_fulfillment_review?: boolean;
    customer_lat?: number | null;
    customer_lng?: number | null;
}

export const ORDER_LIST_COLUMNS = 'id,order_number,customer_name,phone,total,status,payment_method,payment_status,created_at,viewed_at,needs_fulfillment_review';
const ORDER_DETAIL_COLUMNS = `${ORDER_LIST_COLUMNS},customer_id,items,shipping_fee,coupon_code,discount_amount,points_discount,payment_reference,shipping_address,city,state,notes,driver_id,fulfillment_warehouse_id,customer_lat,customer_lng`;

export type OrderListRow = Pick<AdminOrder, 'id' | 'order_number' | 'customer_name' | 'phone' | 'total' | 'status' | 'payment_method' | 'payment_status' | 'created_at' | 'viewed_at' | 'needs_fulfillment_review'>;

export interface OrderListFilters {
    status?: string;
    paymentStatus?: string;
    needsFulfillmentReview?: boolean;
    search?: string;
    page: number;
    pageSize: number;
}

export async function fetchOrders(filters: OrderListFilters): Promise<{ rows: OrderListRow[]; total: number }> {
    const from = filters.page * filters.pageSize;
    let query = supabase.from('orders').select(ORDER_LIST_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + filters.pageSize - 1);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.paymentStatus) query = query.eq('payment_status', filters.paymentStatus);
    if (filters.needsFulfillmentReview) query = query.eq('needs_fulfillment_review', true);
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

export async function countFulfillmentReviewOrders(): Promise<number> {
    const { count, error } = await supabase.from('orders').select('id', { count: 'exact', head: true }).eq('needs_fulfillment_review', true);
    if (error) throw error;
    return count ?? 0;
}

function normalizeOrder(data: unknown): AdminOrder {
    const row = data as AdminOrder & { items: unknown };
    return {
        ...row,
        items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
        total: Number(row.total),
        shipping_fee: Number(row.shipping_fee ?? 0),
        coupon_code: row.coupon_code ?? null,
        discount_amount: Number(row.discount_amount ?? 0),
        points_discount: Number(row.points_discount ?? 0),
    };
}

export async function fetchOrder(id: string): Promise<AdminOrder | null> {
    const { data, error } = await supabase.from('orders').select(ORDER_DETAIL_COLUMNS).eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? normalizeOrder(data) : null;
}

export async function fetchFulfillmentReviewOrders(): Promise<AdminOrder[]> {
    const { data, error } = await supabase.rpc('admin_get_fulfillment_review_orders');
    if (error) throw error;
    return (data ?? []).map(normalizeOrder);
}

export async function resolveOrderFulfillmentReview(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('admin_resolve_fulfillment_review', { p_order_id: orderId });
    if (error) throw error;
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

export async function confirmCodPayment(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('confirm_cod_payment' as any, { p_order_id: orderId } as any);
    if (error) throw error;
}

export async function checkCreditCustomer(customerId: string): Promise<boolean> {
    const { data, error } = await supabase.from('profiles').select('is_credit_customer').eq('id', customerId).maybeSingle();
    if (error) return false;
    return (data as unknown as { is_credit_customer?: boolean })?.is_credit_customer ?? false;
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

export interface SupervisorUser {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    role: string;
    assigned_warehouse_id: string | null;
}

export async function fetchWarehouseSupervisors(): Promise<SupervisorUser[]> {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['warehouse_supervisor', 'admin'])
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as SupervisorUser[];
}

export async function searchAssignableUsers(query: string): Promise<SupervisorUser[]> {
    let q = supabase
        .from('profiles')
        .select('*')
        .not('role', 'in', '("admin","driver")')
        .order('created_at', { ascending: false })
        .limit(20);
    if (query.trim()) {
        const escaped = query.trim().replace(/[%,()]/g, ' ');
        q = q.or(`full_name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as SupervisorUser[];
}

// GPS-06: assign or remove a warehouse supervisor. Pass null warehouseId to demote back to customer.
export async function setWarehouseSupervisor(userId: string, warehouseId: string | null): Promise<void> {
    const { error } = await supabase.rpc('admin_set_warehouse_supervisor' as never, {
        p_user_id: userId,
        p_warehouse_id: warehouseId,
    } as never);
    if (error) throw error;
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

// Message delivery health -------------------------------------------------------
// Both RPCs check is_admin() server-side; these wrappers only shape the result.

export async function fetchDeliveryFailures(hours = 48, limit = 200): Promise<DeliveryFailure[]> {
    const { data, error } = await supabase.rpc('admin_delivery_failures', { p_hours: hours, p_limit: limit });
    if (error) throw error;
    return (data ?? []) as DeliveryFailure[];
}

export async function fetchDeliverySummary(hours = 48): Promise<DeliverySummary> {
    const { data, error } = await supabase.rpc('admin_delivery_summary', { p_hours: hours });
    if (error) throw error;
    const raw = (data ?? {}) as Partial<DeliverySummary>;
    const channel = (value: DeliveryChannelStats | undefined): DeliveryChannelStats => ({
        sent: Number(value?.sent ?? 0),
        pending: value?.pending == null ? undefined : Number(value.pending),
        blocked: value?.blocked == null ? undefined : Number(value.blocked),
        failed: Number(value?.failed ?? 0),
    });
    return {
        hours: Number(raw.hours ?? hours),
        email: channel(raw.email),
        whatsapp: channel(raw.whatsapp),
        otp: channel(raw.otp),
        push: channel(raw.push),
    };
}

// Customers & Users Management --------------------------------------------------

export interface CustomerFilters {
    search?: string;
    tier?: string;
    role?: string;
    page: number;
    pageSize: number;
}

export async function fetchCustomers(filters: CustomerFilters): Promise<{ rows: CustomerProfile[]; total: number }> {
    const from = filters.page * filters.pageSize;
    let query = supabase.from('profiles').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, from + filters.pageSize - 1);
    
    if (filters.role) query = query.eq('role', filters.role);
    if (filters.tier) query = query.eq('loyalty_tier', filters.tier);
    
    const search = filters.search?.trim();
    if (search) {
        const escaped = search.replace(/[%,()]/g, ' ');
        query = query.or(`full_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%,referral_code.ilike.%${escaped}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;
    const profiles = (data ?? []) as unknown as CustomerProfile[];

    // Aggregate orders summary for these customers
    if (profiles.length > 0) {
        const customerIds = profiles.map((p) => p.id);
        const { data: ordersData } = await supabase
            .from('orders')
            .select('customer_id,total,status')
            .in('customer_id', customerIds);

        const statsMap = new Map<string, { count: number; spent: number }>();
        (ordersData ?? []).forEach((ord) => {
            if (!ord.customer_id) return;
            const current = statsMap.get(ord.customer_id) ?? { count: 0, spent: 0 };
            current.count += 1;
            if (ord.status !== 'cancelled') {
                current.spent += Number(ord.total ?? 0);
            }
            statsMap.set(ord.customer_id, current);
        });

        profiles.forEach((p) => {
            const stat = statsMap.get(p.id);
            p.orders_count = stat?.count ?? 0;
            p.total_spent = stat?.spent ?? 0;
        });
    }

    return { rows: profiles, total: count ?? 0 };
}

export interface CustomerDetailData {
    profile: CustomerProfile;
    orders: AdminOrder[];
    loyaltyHistory: LoyaltyLedgerEntry[];
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetailData | null> {
    const [profileRes, ordersRes, ledgerRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', customerId).maybeSingle(),
        supabase.from('orders').select(ORDER_DETAIL_COLUMNS).eq('customer_id', customerId).order('created_at', { ascending: false }),
        supabase.from('loyalty_ledger').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }),
    ]);

    if (profileRes.error) throw profileRes.error;
    if (!profileRes.data) return null;

    const profile = profileRes.data as unknown as CustomerProfile;
    const orders = (ordersRes.data ?? []).map((row) => ({
        ...row,
        items: Array.isArray((row as unknown as { items?: unknown }).items) ? ((row as unknown as { items: unknown[] }).items as unknown as OrderItem[]) : [],
        total: Number(row.total),
        shipping_fee: Number(row.shipping_fee ?? 0),
        discount_amount: Number(row.discount_amount ?? 0),
        points_discount: Number(row.points_discount ?? 0),
    })) as AdminOrder[];

    profile.orders_count = orders.length;
    profile.total_spent = orders.filter((o) => o.status !== 'cancelled').reduce((sum, o) => sum + o.total, 0);

    return {
        profile,
        orders,
        loyaltyHistory: (ledgerRes.data ?? []) as LoyaltyLedgerEntry[],
    };
}

export async function adjustCustomerPoints(customerId: string, delta: number, note: string): Promise<number> {
    const { data, error } = await supabase.rpc('adjust_loyalty_points', {
        p_customer_id: customerId,
        p_points_delta: delta,
        p_note: note,
    });
    if (error) throw error;
    return Number(data);
}

// Payment Verification Helpers --------------------------------------------------

export interface DuplicateProofWarning {
    found: boolean;
    orderId?: string;
    orderNumber?: string;
    status?: string;
}

export async function checkDuplicatePaymentReference(reference: string, currentOrderId: string): Promise<DuplicateProofWarning> {
    const trimmed = reference.trim();
    if (!trimmed) return { found: false };

    const { data, error } = await supabase
        .from('payment_proofs')
        .select('id,order_id,status,orders(id,order_number)')
        .eq('transaction_reference', trimmed)
        .neq('order_id', currentOrderId)
        .limit(1);

    if (error || !data || data.length === 0) return { found: false };
    const first = data[0] as unknown as { order_id: string; status: string; orders?: { order_number?: string } };
    return {
        found: true,
        orderId: first.order_id,
        orderNumber: first.orders?.order_number,
        status: first.status,
    };
}

export async function verifyAndAdvanceOrder(params: {
    orderId: string;
    proofId: string;
    expectedStatus: string;
    targetStatus: string;
    reviewNote?: string;
}): Promise<void> {
    // 1. Verify payment proof
    await reviewPaymentProof(params.proofId, 'verified', params.reviewNote);

    // 2. Advance order status (e.g. from 'new' or 'payment_pending' to 'processing' or 'confirmed')
    if (params.targetStatus && params.targetStatus !== params.expectedStatus) {
        await updateOrderOperation({
            orderId: params.orderId,
            expectedStatus: params.expectedStatus,
            status: params.targetStatus,
            note: params.reviewNote ? `تأكيد الدفع التلقائي: ${params.reviewNote}` : 'تم تأكيد الدفع ونقل الطلب للتجهيز',
        });
    }
}

