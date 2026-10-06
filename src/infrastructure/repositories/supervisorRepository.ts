import { supabase } from '../supabase/client';

// Supervisor surface (/supervisor/*): plain reads on orders and warehouse_inventory. Row-level
// security (GPS-06) limits every query to the supervisor's assigned warehouse, so nothing here
// filters by warehouse except where a table has no supervisor policy of its own.

export interface SupervisorProfile {
    warehouseId: string;
    warehouseName: string;
    warehouseCity: string;
    warehouseState: string;
}

export interface SupervisorOrder {
    id: string;
    orderNumber: string;
    status: string;
    customerName: string;
    phone: string;
    city: string | null;
    state: string | null;
    total: number;
    createdAt: string;
    itemCount: number;
}

export interface SupervisorInventoryRow {
    productId: string;
    productName: string;
    quantity: number;
    reorderLevel: number;
    isLow: boolean;
}

export async function fetchSupervisorProfile(): Promise<SupervisorProfile | null> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return null;
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('assigned_warehouse_id, role')
        .eq('id', userId)
        .maybeSingle();
    if (profileError) throw profileError;
    if (!profile || profile.role !== 'warehouse_supervisor' || !profile.assigned_warehouse_id) return null;
    const { data: wh } = await supabase
        .from('warehouses')
        .select('id, name, city, state')
        .eq('id', profile.assigned_warehouse_id)
        .maybeSingle();
    return {
        warehouseId: profile.assigned_warehouse_id,
        warehouseName: wh?.name ?? 'مستودع تيبس',
        warehouseCity: wh?.city ?? 'الخرطوم',
        warehouseState: wh?.state ?? 'الخرطوم',
    };
}

export async function fetchSupervisorOrders(): Promise<SupervisorOrder[]> {
    const { data, error } = await supabase
        .from('orders')
        .select('id,order_number,status,customer_name,phone,city,state,total,created_at,items')
        .not('status', 'in', '("delivered","cancelled","delivery_failed")')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;
    return (data ?? []).map((r) => ({
        id: r.id,
        orderNumber: r.order_number ?? '',
        status: r.status ?? '',
        customerName: r.customer_name ?? '',
        phone: r.phone ?? '',
        city: r.city,
        state: r.state,
        total: Number(r.total),
        createdAt: r.created_at,
        itemCount: Array.isArray(r.items) ? (r.items as unknown[]).length : 0,
    }));
}

export async function fetchSupervisorInventory(warehouseId: string): Promise<SupervisorInventoryRow[]> {
    const { data, error } = await supabase
        .from('warehouse_inventory')
        .select('product_id, quantity, reorder_level, products(name_ar)')
        .eq('warehouse_id', warehouseId)
        .order('quantity', { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => {
        const product = r.products as { name_ar: string } | null;
        return {
            productId: r.product_id,
            productName: product?.name_ar ?? r.product_id,
            quantity: r.quantity,
            reorderLevel: r.reorder_level,
            isLow: r.quantity <= r.reorder_level,
        };
    });
}
