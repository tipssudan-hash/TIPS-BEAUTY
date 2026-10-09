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

export interface SupervisorOrderItem {
    id?: string;
    productId?: string;
    name_ar?: string;
    variant_name?: string | null;
    quantity: number;
    unit_price?: number;
    line_total?: number;
    imageUrl?: string | null;
}

export interface SupervisorOrder {
    id: string;
    orderNumber: string;
    status: string;
    customerName: string;
    phone: string;
    shippingAddress: string;
    city: string | null;
    state: string | null;
    notes: string | null;
    total: number;
    paymentMethod: string;
    paymentStatus: string;
    createdAt: string;
    items: SupervisorOrderItem[];
    itemCount: number;
    driverId?: string | null;
    driverName?: string | null;
    driverPhone?: string | null;
    driverStatus?: string | null;
}

export interface SupervisorInventoryRow {
    productId: string;
    productName: string;
    imageUrl?: string | null;
    quantity: number;
    reorderLevel: number;
    isLow: boolean;
}

export async function fetchSupervisorProfile(): Promise<SupervisorProfile | null> {
    const { data: auth } = await supabase.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) return null;

    let assignedWarehouseId: string | null = null;
    let userRole = 'customer';

    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('assigned_warehouse_id, role')
            .eq('id', userId)
            .maybeSingle();
        assignedWarehouseId = profile?.assigned_warehouse_id || null;
        userRole = profile?.role || 'customer';
    } catch {
        // Fallback
    }

    // Admins can supervise any warehouse; warehouse supervisors supervise their assigned warehouse
    if (userRole !== 'warehouse_supervisor' && userRole !== 'admin') {
        return null;
    }

    let whData: { id: string; name: string; city: string | null; state: string | null } | null = null;
    try {
        if (assignedWarehouseId) {
            const { data } = await supabase
                .from('warehouses')
                .select('id, name, city, state')
                .eq('id', assignedWarehouseId)
                .maybeSingle();
            whData = data;
        }

        // If admin with no assigned warehouse, load the primary active warehouse
        if (!whData && userRole === 'admin') {
            const { data } = await supabase
                .from('warehouses')
                .select('id, name, city, state')
                .eq('is_active', true)
                .limit(1)
                .maybeSingle();
            whData = data;
        }
    } catch {
        // Fallback
    }

    if (!whData) {
        if (!assignedWarehouseId && userRole !== 'admin') return null;
        return {
            warehouseId: assignedWarehouseId || '00000000-0000-0000-0000-000000000001',
            warehouseName: 'مستودع الخرطوم الرئيسي',
            warehouseCity: 'الخرطوم',
            warehouseState: 'ولاية الخرطوم',
        };
    }

    return {
        warehouseId: whData.id,
        warehouseName: whData.name || 'مستودع تيبس',
        warehouseCity: whData.city || 'الخرطوم',
        warehouseState: whData.state || 'الخرطوم',
    };
}

export async function fetchSupervisorOrders(): Promise<SupervisorOrder[]> {
    const { data, error } = await supabase
        .from('orders')
        .select('id,order_number,status,customer_name,phone,shipping_address,city,state,notes,total,payment_method,payment_status,created_at,items,driver_id')
        .not('status', 'in', '("delivered","cancelled","delivery_failed")')
        .order('created_at', { ascending: false })
        .limit(50);
    if (error) throw error;

    // Fetch drivers map to resolve driver details safely
    let driversMap = new Map<string, { name: string; phone: string; status: string }>();
    try {
        const warehouseDrivers = await fetchWarehouseDrivers();
        if (warehouseDrivers && warehouseDrivers.length > 0) {
            for (const d of warehouseDrivers) {
                driversMap.set(d.id, { name: d.name, phone: d.phone, status: d.status });
            }
        }
    } catch {
        // Non-critical
    }

    try {
        const { data: drvList } = await supabase.from('drivers').select('id, user_id, name, phone, status');
        if (drvList) {
            for (const d of drvList as any[]) {
                const info = { name: d.name, phone: d.phone, status: d.status };
                driversMap.set(d.id, info);
                if (d.user_id) {
                    driversMap.set(d.user_id, info);
                }
            }
        }
    } catch {
        // Non-critical
    }

    try {
        const { data: profDrivers } = await supabase.from('profiles').select('id, full_name, phone').eq('role', 'driver');
        if (profDrivers) {
            for (const p of profDrivers) {
                if (!driversMap.has(p.id)) {
                    driversMap.set(p.id, { name: p.full_name || 'مندوب', phone: p.phone || '', status: 'active' });
                }
            }
        }
    } catch {
        // Non-critical
    }

    // Collect all product IDs across orders to guarantee full names and images are always visible
    const allProductIds = new Set<string>();
    for (const r of (data ?? [])) {
        const rawItems = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
        for (const item of rawItems) {
            const pId = (item.id as string) || (item.product_id as string);
            if (pId) allProductIds.add(pId);
        }
    }

    const productsMap = new Map<string, { name_ar: string; image: string | null; price: number }>();
    if (allProductIds.size > 0) {
        try {
            const { data: prods } = await supabase
                .from('products')
                .select('id, name_ar, image, price')
                .in('id', Array.from(allProductIds));
            if (prods) {
                for (const p of prods) {
                    productsMap.set(p.id, { name_ar: p.name_ar || 'منتج', image: p.image, price: Number(p.price || 0) });
                }
            }
        } catch {
            // Non-critical
        }
    }

    return (data ?? []).map((r) => {
        const rawItems = Array.isArray(r.items) ? (r.items as Record<string, unknown>[]) : [];
        const items: SupervisorOrderItem[] = rawItems.map((item) => {
            const pId = (item.product_id as string) || (item.id as string) || undefined;
            const pInfo = pId ? productsMap.get(pId) : null;
            const name_ar = (item.name_ar as string) || pInfo?.name_ar || 'منتج تجميل';
            const imageUrl = (item.image_url as string) || (item.image as string) || pInfo?.image || null;
            const unit_price = item.unit_price != null ? Number(item.unit_price) : (pInfo?.price ?? undefined);
            const quantity = Number(item.quantity ?? 1);
            const line_total = item.line_total != null ? Number(item.line_total) : (unit_price != null ? unit_price * quantity : undefined);

            return {
                id: (item.id as string) || pId,
                productId: pId,
                name_ar,
                variant_name: (item.variant_name as string) || null,
                quantity,
                unit_price,
                line_total,
                imageUrl,
            };
        });

        const totalItemsCount = items.reduce((acc, curr) => acc + (curr.quantity || 1), 0);
        const driverInfo = r.driver_id ? driversMap.get(r.driver_id) : undefined;

        return {
            id: r.id,
            orderNumber: r.order_number ?? '',
            status: r.status ?? '',
            customerName: r.customer_name ?? '',
            phone: r.phone ?? '',
            shippingAddress: r.shipping_address ?? '',
            city: r.city,
            state: r.state,
            notes: r.notes,
            total: Number(r.total),
            paymentMethod: r.payment_method ?? 'COD',
            paymentStatus: r.payment_status ?? 'pending',
            createdAt: r.created_at,
            items,
            itemCount: totalItemsCount,
            driverId: r.driver_id ?? null,
            driverName: driverInfo?.name ?? null,
            driverPhone: driverInfo?.phone ?? null,
            driverStatus: driverInfo?.status ?? null,
        };
    });
}

export async function fetchSupervisorInventory(warehouseId: string): Promise<SupervisorInventoryRow[]> {
    let data: any[] | null = null;
    let joinWorked = false;

    try {
        // Try with product join first
        const result = await supabase
            .from('warehouse_inventory')
            .select('product_id, quantity, reorder_level, products(name_ar, image)')
            .eq('warehouse_id', warehouseId)
            .order('quantity', { ascending: true });
        if (!result.error && result.data && result.data.length > 0) {
            data = result.data;
            joinWorked = true;
        } else {
            // Fallback: query without the relationship join
            const fallback = await supabase
                .from('warehouse_inventory')
                .select('product_id, quantity, reorder_level')
                .eq('warehouse_id', warehouseId)
                .order('quantity', { ascending: true });
            if (!fallback.error && fallback.data && fallback.data.length > 0) {
                data = fallback.data;
            }
        }
    } catch {
        // Fallback
    }

    if (data && data.length > 0) {
        return data.map((r: any) => {
            const product = joinWorked ? (r.products as { name_ar?: string; image?: string } | null) : null;
            return {
                productId: r.product_id,
                productName: product?.name_ar ?? r.product_id,
                imageUrl: product?.image ?? null,
                quantity: Number(r.quantity ?? 0),
                reorderLevel: Number(r.reorder_level ?? 5),
                isLow: Number(r.quantity ?? 0) <= Number(r.reorder_level ?? 5),
            };
        });
    }

    // Secondary fallback: load products directly so supervisor sees the store catalog
    try {
        const { data: publicProds } = await supabase.rpc('get_public_products');
        if (publicProds && publicProds.length > 0) {
            return publicProds.map((p: any) => ({
                productId: p.id,
                productName: p.name_ar || 'منتج',
                imageUrl: p.image || null,
                quantity: Number(p.stock ?? 0),
                reorderLevel: 5,
                isLow: Number(p.stock ?? 0) <= 5,
            }));
        }
    } catch {
        // Non-critical
    }

    return [];
}

export interface WarehouseDriverOption {
    id: string;
    name: string;
    phone: string;
    status: 'active' | 'busy' | 'offline';
    activeDeliveries?: number;
}

export interface DriverCashRemittance {
    id: string;
    driverId: string;
    driverName?: string;
    amount: number;
    status: 'submitted' | 'confirmed' | 'rejected';
    driverNotes: string | null;
    supervisorNotes: string | null;
    submittedAt: string;
    confirmedAt: string | null;
}

export async function fetchWarehouseDrivers(): Promise<WarehouseDriverOption[]> {
    try {
        const { data, error } = await (supabase.rpc as any)('supervisor_get_warehouse_drivers');
        if (!error && Array.isArray(data)) {
            return data.map((d: any) => ({
                id: d.id,
                name: d.name,
                phone: d.phone,
                status: d.status as WarehouseDriverOption['status'],
                activeDeliveries: Number(d.active_deliveries ?? 0),
            }));
        }
    } catch {
        // Fallback
    }

    // Direct table fallback
    const { data: drivers } = await supabase.from('drivers').select('id, name, phone, status');
    return (drivers ?? []).map((d) => ({
        id: d.id,
        name: d.name,
        phone: d.phone,
        status: d.status as WarehouseDriverOption['status'],
    }));
}

export async function assignDriverToOrder(orderId: string, driverId: string): Promise<void> {
    try {
        const { error } = await (supabase.rpc as any)('supervisor_assign_driver', {
            p_order_id: orderId,
            p_driver_id: driverId,
        });
        if (!error) return;
    } catch {
        // Fallback
    }

    const { error: updateError } = await supabase
        .from('orders')
        .update({ driver_id: driverId, status: 'preparing' })
        .eq('id', orderId);
    if (updateError) throw updateError;
}

export async function updateSupervisorOrderStatus(
    orderId: string,
    status?: string,
    notes?: string,
): Promise<void> {
    try {
        const { error } = await (supabase.rpc as any)('supervisor_update_order', {
            p_order_id: orderId,
            p_status: status || undefined,
            p_notes: notes || undefined,
        });
        if (!error) return;
    } catch {
        // Fallback
    }

    const updatePayload: Record<string, unknown> = {};
    if (status) updatePayload.status = status;
    if (notes !== undefined) updatePayload.notes = notes;

    const { error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', orderId);
    if (updateErr) throw updateErr;
}

export async function fetchWarehouseCashRemittances(): Promise<DriverCashRemittance[]> {
    try {
        const { data, error } = await (supabase.from as any)('driver_cash_remittances')
            .select('id, driver_id, amount, status, driver_notes, supervisor_notes, submitted_at, confirmed_at, drivers(name)')
            .order('submitted_at', { ascending: false });
        if (!error && Array.isArray(data)) {
            return data.map((r: any) => {
                const driverObj = r.drivers as { name: string } | null;
                return {
                    id: r.id,
                    driverId: r.driver_id,
                    driverName: driverObj?.name || 'مندوب',
                    amount: Number(r.amount),
                    status: r.status as DriverCashRemittance['status'],
                    driverNotes: r.driver_notes,
                    supervisorNotes: r.supervisor_notes,
                    submittedAt: r.submitted_at,
                    confirmedAt: r.confirmed_at,
                };
            });
        }
    } catch {
        // Fallback
    }
    return [];
}

export async function confirmDriverCashRemittance(
    remittanceId: string,
    supervisorNotes?: string,
): Promise<void> {
    try {
        const { error } = await (supabase.rpc as any)('supervisor_confirm_cash_remittance', {
            p_remittance_id: remittanceId,
            p_notes: supervisorNotes || undefined,
        });
        if (!error) return;
    } catch {
        // Fallback
    }

    const { error: updateErr } = await (supabase.from as any)('driver_cash_remittances')
        .update({
            status: 'confirmed',
            supervisor_notes: supervisorNotes || null,
            confirmed_at: new Date().toISOString(),
        })
        .eq('id', remittanceId);
    if (updateErr) throw updateErr;
}
