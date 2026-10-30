import { supabase } from './supabase';
import type {
    CustomerProfile, DeliveryChannelStats, DeliveryFailure, DeliverySummary, DriverLocation, FulfillmentBreakdownLine, LoyaltyLedgerEntry,
    OrderItemCheck, OrderItemCheckStage, OrderNeedsAction, PromotionType, StaffNotification,
} from '../types';

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
    promotion_type?: PromotionType | null;
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
    // Staff-only: staff_note is the internal running note; notes stays the customer's text.
    staff_note: string | null;
    estimated_delivery_at: string | null;
    packed_at: string | null;
    packed_by: string | null;
    handed_over_at: string | null;
    delivery_proof_path: string | null;
    returned_to_warehouse_at: string | null;
    returned_received_by: string | null;
}

export const ORDER_LIST_COLUMNS = 'id,order_number,customer_name,phone,total,status,payment_method,payment_status,created_at,viewed_at,needs_fulfillment_review';
const ORDER_DETAIL_COLUMNS = `${ORDER_LIST_COLUMNS},customer_id,items,shipping_fee,coupon_code,discount_amount,points_discount,payment_reference,shipping_address,city,state,notes,driver_id,fulfillment_warehouse_id,customer_lat,customer_lng,estimated_delivery_at,packed_at,packed_by,handed_over_at,delivery_proof_path,returned_to_warehouse_at,returned_received_by`;

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
    const row = data as Omit<AdminOrder, 'staff_note'> & { items: unknown };
    return {
        ...row,
        items: Array.isArray(row.items) ? (row.items as OrderItem[]) : [],
        total: Number(row.total),
        shipping_fee: Number(row.shipping_fee ?? 0),
        coupon_code: row.coupon_code ?? null,
        discount_amount: Number(row.discount_amount ?? 0),
        points_discount: Number(row.points_discount ?? 0),
        staff_note: null,
    };
}

// The internal note lives in order_staff_notes (staff-only RLS), not on the customer-readable orders row.
export async function fetchOrderStaffNote(orderId: string): Promise<string | null> {
    const { data, error } = await supabase.from('order_staff_notes').select('note').eq('order_id', orderId).maybeSingle();
    if (error) throw error;
    return data?.note ?? null;
}

export async function fetchOrder(id: string): Promise<AdminOrder | null> {
    const [{ data, error }, staffNote] = await Promise.all([
        supabase.from('orders').select(ORDER_DETAIL_COLUMNS).eq('id', id).maybeSingle(),
        fetchOrderStaffNote(id),
    ]);
    if (error) throw error;
    return data ? { ...normalizeOrder(data), staff_note: staffNote } : null;
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
    const { error } = await supabase.rpc('confirm_cod_payment', { p_order_id: orderId });
    if (error) throw error;
}

export async function overrideDeliveryCode(orderId: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('staff_override_delivery_code', { p_order_id: orderId, p_reason: reason.trim() });
    if (error) throw error;
}

export async function checkCreditCustomer(customerId: string): Promise<boolean> {
    const { data, error } = await supabase.from('profiles').select('is_credit_customer').eq('id', customerId).maybeSingle();
    if (error) throw error;
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

export interface WarehouseManager {
    user_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    warehouse_ids: string[];
    primary_warehouse_id: string | null;
}

export async function fetchWarehouseManagers(): Promise<WarehouseManager[]> {
    const { data, error } = await supabase.rpc('admin_list_warehouse_managers');
    if (error) throw error;
    return data ?? [];
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

// Replaces the user's full warehouse set. An empty list demotes the user back to customer.
export async function setWarehouseManagerAccess(userId: string, warehouseIds: string[], primaryWarehouseId: string | null): Promise<void> {
    const { error } = await supabase.rpc('admin_set_warehouse_manager_access', {
        p_user_id: userId,
        p_warehouse_ids: warehouseIds,
        p_primary_warehouse_id: primaryWarehouseId ?? undefined,
    });
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
        const { data: ordersData, error: ordersError } = await supabase
            .from('orders')
            .select('customer_id,total,status')
            .in('customer_id', customerIds);
        if (ordersError) throw ordersError;

        const statsMap = new Map<string, { count: number; spent: number }>();
        (ordersData ?? []).forEach((ord) => {
            if (!ord.customer_id) return;
            const current = statsMap.get(ord.customer_id) ?? { count: 0, spent: 0 };
            current.count += 1;
            if (ord.status !== 'cancelled' && ord.status !== 'delivery_failed') {
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
    if (ordersRes.error) throw ordersRes.error;
    if (ledgerRes.error) throw ledgerRes.error;
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
    profile.total_spent = orders.filter((o) => o.status !== 'cancelled' && o.status !== 'delivery_failed').reduce((sum, o) => sum + o.total, 0);

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

    if (error) throw error;
    const first = data?.[0] as unknown as { order_id: string; status: string; orders?: { order_number?: string } } | undefined;
    if (!first) return { found: false };
    return {
        found: true,
        orderId: first.order_id,
        orderNumber: first.orders?.order_number,
        status: first.status,
    };
}

// One atomic RPC: verifies the proof and advances the order in the same transaction.
// The server rejects a duplicate transaction reference unless allowDuplicateReference is set with a note.
export async function verifyAndAdvanceOrder(params: {
    proofId: string;
    expectedStatus: string;
    targetStatus?: string | null;
    reviewNote?: string;
    allowDuplicateReference?: boolean;
}): Promise<void> {
    const { error } = await supabase.rpc('admin_verify_payment_and_advance', {
        p_proof_id: params.proofId,
        p_expected_status: params.expectedStatus,
        p_target_status: params.targetStatus ?? undefined,
        p_review_note: params.reviewNote?.trim() || undefined,
        p_allow_duplicate_reference: params.allowDuplicateReference ?? false,
    });
    if (error) throw error;
}

// Staff access & warehouse cash -------------------------------------------------------
// The RPCs below check access server-side (is_admin / can_manage_warehouse); the UI only shapes results.

export interface ManagedWarehouse {
    id: string;
    name: string;
    code: string;
    is_primary: boolean;
}

export interface StaffContext {
    role: string;
    is_admin: boolean;
    is_warehouse_manager: boolean;
    is_accountant: boolean;
    warehouses: ManagedWarehouse[];
}

export async function fetchStaffContext(): Promise<StaffContext> {
    const { data, error } = await supabase.rpc('get_my_staff_context');
    if (error) throw error;
    const raw = (data ?? {}) as Partial<StaffContext>;
    return {
        role: raw.role ?? 'customer',
        is_admin: raw.is_admin === true,
        is_warehouse_manager: raw.is_warehouse_manager === true,
        is_accountant: raw.is_accountant === true,
        warehouses: Array.isArray(raw.warehouses) ? raw.warehouses : [],
    };
}

export interface SupervisorOrderUpdate {
    orderId: string;
    expectedStatus: string;
    status?: string;
    note?: string;
}

export async function supervisorUpdateOrder(input: SupervisorOrderUpdate): Promise<void> {
    const { error } = await supabase.rpc('supervisor_update_order', {
        p_order_id: input.orderId,
        p_expected_status: input.expectedStatus,
        p_status: input.status,
        p_notes: input.note?.trim() || undefined,
    });
    if (error) throw error;
}

export async function supervisorAssignDriver(orderId: string, driverId: string): Promise<void> {
    const { error } = await supabase.rpc('supervisor_assign_driver', { p_order_id: orderId, p_driver_id: driverId });
    if (error) throw error;
}

export async function fetchWarehouseDrivers(warehouseId: string): Promise<DriverOption[]> {
    const { data, error } = await supabase.rpc('supervisor_get_warehouse_drivers', { p_warehouse_id: warehouseId });
    if (error) throw error;
    return (data ?? []).map((driver) => ({
        id: driver.id,
        name: driver.name,
        phone: driver.phone,
        status: driver.status,
        warehouse_id: warehouseId,
        vehicle: null,
    }));
}

export interface WarehouseRemittance {
    id: string;
    driver_id: string;
    warehouse_id: string | null;
    amount: number;
    status: string;
    driver_notes: string | null;
    supervisor_notes: string | null;
    submitted_at: string;
    confirmed_at: string | null;
}

export interface RemittanceFilters {
    status?: string;
    /** `null` selects remittances without a warehouse; `undefined` selects all. */
    warehouseId?: string | null;
    driverId?: string;
}

export async function fetchWarehouseRemittances(filters: RemittanceFilters): Promise<WarehouseRemittance[]> {
    let query = supabase
        .from('driver_cash_remittances')
        .select('id,driver_id,warehouse_id,amount,status,driver_notes,supervisor_notes,submitted_at,confirmed_at')
        .order('submitted_at', { ascending: false })
        .limit(200);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.warehouseId === null) query = query.is('warehouse_id', null);
    else if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
    if (filters.driverId) query = query.eq('driver_id', filters.driverId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function confirmRemittance(remittanceId: string, action: 'confirmed' | 'rejected', note?: string): Promise<void> {
    const { error } = await supabase.rpc('supervisor_confirm_cash_remittance', {
        p_remittance_id: remittanceId,
        p_action: action,
        p_notes: note?.trim() || undefined,
    });
    if (error) throw error;
}

export interface DriverCashLedgerEntry {
    id: string;
    entry_type: string;
    amount: number;
    order_id: string | null;
    remittance_id: string | null;
    business_date: string;
    note: string | null;
    created_at: string;
}

export async function fetchDriverCashLedger(driverId: string, limit = 200): Promise<DriverCashLedgerEntry[]> {
    const { data, error } = await supabase
        .from('driver_cash_ledger')
        .select('id,entry_type,amount,order_id,remittance_id,business_date,note,created_at')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []).map((row) => ({ ...row, amount: Number(row.amount) }));
}

export async function adjustDriverCash(driverId: string, amount: number, note: string): Promise<void> {
    const { error } = await supabase.rpc('admin_adjust_driver_cash', { p_driver_id: driverId, p_amount: amount, p_note: note.trim() });
    if (error) throw error;
}

export interface SettlementDriverRow {
    driver_id: string;
    driver_name: string;
    delivered: number;
    failed: number;
    cod_collected: number;
    cash_submitted: number;
    cash_confirmed: number;
    outstanding_cod: number;
}

export interface SettlementSummary {
    total_orders: number;
    delivered_orders: number;
    failed_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    cod_collected: number;
    online_paid: number;
    pending_payment: number;
    shipping_fees_collected: number;
    cash_remittances: { total_submitted: number; total_confirmed: number; pending_confirmation: number; rejected: number };
    driver_performance: SettlementDriverRow[];
}

export async function fetchSettlementSummary(start: string, end: string, warehouseId?: string | null): Promise<SettlementSummary> {
    const { data, error } = await supabase.rpc('get_warehouse_settlement_summary', {
        p_start: start,
        p_end: end,
        p_warehouse_id: warehouseId ?? undefined,
    });
    if (error) throw error;
    const raw = (data ?? {}) as Partial<SettlementSummary>;
    const cash = (raw.cash_remittances ?? {}) as Partial<SettlementSummary['cash_remittances']>;
    const drivers = Array.isArray(raw.driver_performance) ? raw.driver_performance : [];
    return {
        total_orders: Number(raw.total_orders ?? 0),
        delivered_orders: Number(raw.delivered_orders ?? 0),
        failed_orders: Number(raw.failed_orders ?? 0),
        cancelled_orders: Number(raw.cancelled_orders ?? 0),
        total_revenue: Number(raw.total_revenue ?? 0),
        cod_collected: Number(raw.cod_collected ?? 0),
        online_paid: Number(raw.online_paid ?? 0),
        pending_payment: Number(raw.pending_payment ?? 0),
        shipping_fees_collected: Number(raw.shipping_fees_collected ?? 0),
        cash_remittances: {
            total_submitted: Number(cash.total_submitted ?? 0),
            total_confirmed: Number(cash.total_confirmed ?? 0),
            pending_confirmation: Number(cash.pending_confirmation ?? 0),
            rejected: Number(cash.rejected ?? 0),
        },
        driver_performance: drivers.map((driver) => ({
            driver_id: driver.driver_id,
            driver_name: driver.driver_name ?? '',
            delivered: Number(driver.delivered ?? 0),
            failed: Number(driver.failed ?? 0),
            cod_collected: Number(driver.cod_collected ?? 0),
            cash_submitted: Number(driver.cash_submitted ?? 0),
            cash_confirmed: Number(driver.cash_confirmed ?? 0),
            outstanding_cod: Number(driver.outstanding_cod ?? 0),
        })),
    };
}

// Operations: needs-action queue, ETA, packing, hand-over and returns ---------------------
// Every RPC below checks can_manage_warehouse / is_admin server-side; the UI only shapes results.

export async function fetchOrdersNeedingAction(warehouseId?: string | null): Promise<OrderNeedsAction[]> {
    const { data, error } = await supabase.rpc('staff_get_orders_needing_action', { p_warehouse_id: warehouseId ?? undefined });
    if (error) throw error;
    return (data ?? []) as OrderNeedsAction[];
}

export async function countOrdersNeedingAction(): Promise<number> {
    return new Set((await fetchOrdersNeedingAction()).map((row) => row.order_id)).size;
}

export async function setOrderEta(orderId: string, estimatedDeliveryAt: string | null, note?: string): Promise<void> {
    const { error } = await supabase.rpc('staff_set_order_eta', {
        p_order_id: orderId,
        p_estimated_delivery_at: estimatedDeliveryAt as string,
        p_note: note?.trim() || undefined,
    });
    if (error) throw error;
}

export async function fetchOrderItemChecks(orderId: string, stage: OrderItemCheckStage): Promise<OrderItemCheck[]> {
    const { data, error } = await supabase.rpc('staff_get_item_checks', { p_order_id: orderId });
    if (error) throw error;
    return ((data ?? []) as OrderItemCheck[]).filter((check) => check.stage === stage);
}

export async function setOrderItemCheck(orderId: string, lineNo: number, checkedQty: number): Promise<void> {
    const { error } = await supabase.rpc('staff_set_item_check', { p_order_id: orderId, p_line_no: lineNo, p_checked_qty: checkedQty });
    if (error) throw error;
}

export async function markOrderPacked(orderId: string): Promise<void> {
    const { error } = await supabase.rpc('staff_mark_packed', { p_order_id: orderId });
    if (error) throw error;
}

export async function confirmFailedDeliveryReturn(orderId: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('staff_confirm_failed_delivery_return', { p_order_id: orderId, p_note: note?.trim() || undefined });
    if (error) throw error;
}

export async function fetchFulfillmentBreakdown(orderId: string): Promise<FulfillmentBreakdownLine[]> {
    const { data, error } = await supabase.rpc('staff_get_fulfillment_breakdown', { p_order_id: orderId });
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        quantity: Number(row.quantity),
        available: Number(row.available),
    }));
}

export async function fetchDriverLocations(warehouseId?: string | null): Promise<DriverLocation[]> {
    const { data, error } = await supabase.rpc('staff_get_driver_locations', { p_warehouse_id: warehouseId ?? undefined });
    if (error) throw error;
    return (data ?? []).map((row) => ({
        ...row,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        accuracy_meters: row.accuracy_meters == null ? null : Number(row.accuracy_meters),
        active_order_numbers: row.active_order_numbers ?? [],
    }));
}

// Proof photos live in the private delivery-proofs bucket; only a short-lived signed URL is shown.
export async function signedDeliveryProofUrl(path: string): Promise<string | null> {
    const { data, error } = await supabase.storage.from('delivery-proofs').createSignedUrl(path, 600);
    if (error) return null;
    return data.signedUrl;
}

// Staff notifications -----------------------------------------------------------------

export async function fetchStaffNotifications(limit = 100): Promise<StaffNotification[]> {
    const { data, error } = await supabase
        .from('staff_notifications')
        .select('id,warehouse_id,kind,title,body,ref_type,ref_id,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error) throw error;
    return (data ?? []) as StaffNotification[];
}

export async function countUnreadStaffNotifications(): Promise<number> {
    const { count, error } = await supabase.from('staff_notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
    if (error) throw error;
    return count ?? 0;
}

export async function markStaffNotificationsRead(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.rpc('mark_staff_notifications_read', { p_ids: ids });
    if (error) throw error;
}

// Accountant -----------------------------------------------------------------------------

export interface WarehouseSettlementSummary {
    period: { start: string; end: string };
    total_orders: number;
    delivered_orders: number;
    failed_orders: number;
    cancelled_orders: number;
    total_revenue: number;
    cod_collected: number;
    online_paid: number;
    pending_payment: number;
    paid_confirmed: number;
    shipping_fees_collected: number;
    cash_remittances: {
        total_submitted: number;
        total_confirmed: number;
        pending_confirmation: number;
        rejected: number;
    };
    driver_performance: Array<{
        driver_id: string;
        driver_name: string;
        delivered: number;
        failed: number;
        cod_collected: number;
        cash_submitted: number;
        cash_confirmed: number;
        outstanding_cod: number;
    }>;
}

export async function fetchWarehouseSettlement(start: string, end: string): Promise<WarehouseSettlementSummary> {
    const { data, error } = await supabase.rpc('get_warehouse_settlement_summary', { p_start: start, p_end: end });
    if (error) throw error;
    return data as unknown as WarehouseSettlementSummary;
}

export interface CashRemittanceRow {
    id: string;
    driver_id: string;
    driver_name: string;
    warehouse_id: string | null;
    warehouse_name: string | null;
    amount: number;
    status: 'submitted' | 'confirmed' | 'rejected';
    driver_notes: string | null;
    supervisor_notes: string | null;
    submitted_at: string;
    confirmed_at: string | null;
}

export async function fetchPendingRemittances(): Promise<CashRemittanceRow[]> {
    const { data, error } = await supabase.from('driver_cash_remittances')
        .select('id,driver_id,warehouse_id,amount,status,driver_notes,supervisor_notes,submitted_at,confirmed_at,drivers(name),warehouses(name)')
        .order('submitted_at', { ascending: false });
    if (error) throw error;
    return (data ?? []).map((row) => ({
        id: row.id,
        driver_id: row.driver_id,
        driver_name: row.drivers?.name ?? '—',
        warehouse_id: row.warehouse_id,
        warehouse_name: row.warehouses?.name ?? null,
        amount: Number(row.amount),
        status: row.status as CashRemittanceRow['status'],
        driver_notes: row.driver_notes,
        supervisor_notes: row.supervisor_notes,
        submitted_at: row.submitted_at,
        confirmed_at: row.confirmed_at,
    }));
}

export async function confirmRemittanceAsAdmin(remittanceId: string, action: 'confirmed' | 'rejected', notes?: string): Promise<void> {
    await confirmRemittance(remittanceId, action, notes);
}

export interface DriverAccountSummary {
    driver_id: string;
    driver_name: string;
    warehouse_name: string | null;
    total_delivered: number;
    total_cod: number;
    total_submitted: number;
    total_confirmed: number;
    pending_amount: number;
}

// Last 30 days of activity; pending_amount is the driver's live cash balance from the ledger.
export async function fetchDriverAccountSummaries(): Promise<DriverAccountSummary[]> {
    const today = new Date().toISOString().split('T')[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const summary = await fetchWarehouseSettlement(thirtyDaysAgo, today);
    return (summary?.driver_performance ?? []).map((d) => ({
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        warehouse_name: null,
        total_delivered: Number(d.delivered),
        total_cod: Number(d.cod_collected),
        total_submitted: Number(d.cash_submitted),
        total_confirmed: Number(d.cash_confirmed),
        pending_amount: Number(d.outstanding_cod ?? 0),
    }));
}

export async function setAccountant(userId: string, isAccountant: boolean): Promise<void> {
    const { error } = await supabase.rpc('admin_set_accountant', { p_user_id: userId, p_is_accountant: isAccountant });
    if (error) throw error;
}
