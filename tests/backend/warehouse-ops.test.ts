import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    TEST_TAG,
    cleanupTestOrders,
    createTestOrder,
    creds,
    haveCreds,
    loose,
    pickZone,
    provisionProduct,
    rpc,
    signedInClient,
    type Client,
    type LooseRow,
} from './helpers';

// Warehouse operations (Phase 5) as a KRT-scoped manager. The test customer account is upgraded to
// KRT manager for the run, the way warehouse-supervisor.test.ts does it. Driver-side calls need a linked
// driver login, which the single test account cannot be together with the manager role, so those are
// covered in driver-flow.test.ts.

const suite = haveCreds ? describe : describe.skip;

type Zone = Awaited<ReturnType<typeof pickZone>>;
type NeedsActionRow = { order_id: string; order_number: string; status: string; reason: string; since: string; warehouse_id: string };
type LocationRow = { driver_id: string; active_order_numbers: string[] };
type ItemCheckRow = { stage: string; line_no: number; checked_qty: number; checked_at: string };

// staff_notifications.ref_id for low stock is md5(warehouse_id:product_id) cast to uuid (see 20261022000300).
const lowStockRefId = (warehouseId: string, productId: string): string => {
    const hex = createHash('md5').update(`${warehouseId}:${productId}`).digest('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

suite('warehouse operations for a KRT manager', () => {
    let admin: Client;
    let manager: Client;
    let managerId: string;
    let krtId: string;
    let pzuId: string;
    let zone: Zone;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let krtDriverId: string;
    let pzuDriverId: string;
    let krtFailedId: string;
    let pzuFailedId: string;
    let etaOrderId: string;
    let packOrderId: string;
    let originalPacking = false;

    const fetchNeeds = async (warehouseId?: string): Promise<NeedsActionRow[]> => {
        const { data, error } = await rpc(manager, 'staff_get_orders_needing_action', warehouseId ? { p_warehouse_id: warehouseId } : undefined);
        if (error) throw error;
        return data as unknown as NeedsActionRow[];
    };

    const orderRow = async (orderId: string): Promise<LooseRow> => {
        const { data, error } = await loose(admin)
            .from('orders')
            .select('status,notes,returned_to_warehouse_at,packed_at,estimated_delivery_at')
            .eq('id', orderId)
            .single();
        if (error) throw new Error(error.message);
        if (!data) throw new Error(`Order ${orderId} not found`);
        return data;
    };

    const adminMove = async (orderId: string, expected: string, status: string, extra: Record<string, unknown> = {}) => {
        const { error } = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: expected, p_status: status, ...extra });
        if (error) throw error;
    };

    const addDriver = async (name: string, phone: string, warehouseId: string): Promise<string> => {
        const { data, error } = await admin
            .from('drivers')
            .insert({ name: `${TEST_TAG} ${name}`, phone, status: 'active', warehouse_id: warehouseId })
            .select('id')
            .single();
        if (error) throw error;
        return data.id;
    };

    const adjust = async (warehouseId: string, productId: string, delta: number, note: string, reorderLevel?: number) => {
        const { error } = await rpc(admin, 'adjust_warehouse_inventory', {
            p_warehouse_id: warehouseId,
            p_product_id: productId,
            p_quantity_delta: delta,
            p_note: `${TEST_TAG} ${note}`,
            ...(reorderLevel === undefined ? {} : { p_reorder_level: reorderLevel }),
        });
        if (error) throw error;
    };

    const unreadLowStock = async (refId: string): Promise<LooseRow[]> => {
        const { data, error } = await loose(manager)
            .from('staff_notifications')
            .select('id')
            .eq('kind', 'low_stock')
            .eq('ref_id', refId)
            .is('read_at', null);
        if (error) throw new Error(error.message);
        return data ?? [];
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        manager = await signedInClient(creds.customer.email, creds.customer.password);
        const user = await manager.auth.getUser();
        if (!user.data.user) throw new Error('Test customer did not resolve');
        managerId = user.data.user.id;

        const krt = await admin.from('warehouses').select('id').eq('code', 'KRT').single();
        if (krt.error) throw krt.error;
        krtId = krt.data.id;
        const pzu = await admin.from('warehouses').select('id').eq('code', 'PZU').single();
        if (pzu.error) throw pzu.error;
        pzuId = pzu.data.id;

        const flag = await loose(admin).from('app_settings').select('require_packing_check').eq('id', true).single();
        if (flag.error) throw new Error(flag.error.message);
        originalPacking = Boolean(flag.data?.require_packing_check);

        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(manager);

        const access = await rpc(admin, 'admin_set_warehouse_manager_access', {
            p_user_id: managerId,
            p_warehouse_ids: [krtId],
            p_primary_warehouse_id: krtId,
        });
        if (access.error) throw access.error;

        krtDriverId = await addDriver('KRT ops driver', '0944444444', krtId);
        pzuDriverId = await addDriver('PZU ops driver', '0955555555', pzuId);

        // A KRT order that failed in delivery and is still waiting for its return.
        krtFailedId = (await createTestOrder(manager, zone, product.id)).order_id;
        await adminMove(krtFailedId, 'new', 'confirmed', { p_driver_id: krtDriverId });
        await adminMove(krtFailedId, 'confirmed', 'shipped');
        await adminMove(krtFailedId, 'shipped', 'delivery_failed');

        // A PZU order that failed in delivery: reassigned to PZU while still new, then driven and failed.
        pzuFailedId = (await createTestOrder(manager, zone, product.id)).order_id;
        await adminMove(pzuFailedId, 'new', 'confirmed', { p_driver_id: pzuDriverId, p_warehouse_id: pzuId });
        await adminMove(pzuFailedId, 'confirmed', 'shipped');
        await adminMove(pzuFailedId, 'shipped', 'delivery_failed');

        etaOrderId = (await createTestOrder(manager, zone, product.id)).order_id;

        packOrderId = (await createTestOrder(manager, zone, product.id)).order_id;
        await adminMove(packOrderId, 'new', 'confirmed', { p_driver_id: krtDriverId });
    });

    afterAll(async () => {
        if (!admin) return;
        if (manager) {
            const unread = await loose(manager).from('staff_notifications').select('id').is('read_at', null);
            const ids = (unread.data ?? []).map((row) => String(row.id));
            if (ids.length) await rpc(manager, 'mark_staff_notifications_read', { p_ids: ids });
        }
        await loose(admin).from('app_settings').update({ require_packing_check: originalPacking }).eq('id', true);
        await cleanupTestOrders(admin);
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        await product?.release();
        if (managerId) await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: managerId, p_warehouse_id: null });
    });

    it('the needs-action queue lists the KRT failed delivery and no PZU order', async () => {
        const rows = await fetchNeeds();
        const ids = rows.map((row) => row.order_id);
        expect(ids).toContain(krtFailedId);
        expect(ids).not.toContain(pzuFailedId);
        expect(rows.find((row) => row.order_id === krtFailedId)?.reason).toBe('failed_return_pending');
        expect(await fetchNeeds(pzuId)).toHaveLength(0);
    });

    it('staff_set_order_eta sets the estimated time and leaves orders.notes unchanged', async () => {
        const before = (await orderRow(etaOrderId)).notes;
        const when = new Date(Date.now() + 3 * 3600_000).toISOString();
        const { error } = await rpc(manager, 'staff_set_order_eta', { p_order_id: etaOrderId, p_estimated_delivery_at: when, p_note: `${TEST_TAG} eta` });
        expect(error).toBeNull();
        const after = await orderRow(etaOrderId);
        expect(after.notes).toBe(before);
        expect(after.estimated_delivery_at).not.toBeNull();
    });

    it('the staff note is stored in order_staff_notes and not in orders.notes', async () => {
        const before = (await orderRow(etaOrderId)).notes;
        const { error } = await rpc(manager, 'supervisor_update_order', { p_order_id: etaOrderId, p_notes: `${TEST_TAG} internal note` });
        expect(error).toBeNull();
        expect((await orderRow(etaOrderId)).notes).toBe(before);
        const { data, error: readError } = await loose(manager).from('order_staff_notes').select('note').eq('order_id', etaOrderId);
        expect(readError).toBeNull();
        expect((data ?? []).some((row) => String(row.note) === `${TEST_TAG} internal note`)).toBe(true);
    });

    it('refuses to cancel a failed delivery before its return is confirmed', async () => {
        const { error } = await rpc(manager, 'supervisor_update_order', { p_order_id: krtFailedId, p_status: 'cancelled' });
        expect(error?.message).toMatch(/returned to the warehouse/);
        expect((await orderRow(krtFailedId)).status).toBe('delivery_failed');
    });

    it('confirming the return moves the order to the delivery_failed reason, then cancellation is allowed', async () => {
        const outOfScope = await rpc(manager, 'staff_confirm_failed_delivery_return', { p_order_id: pzuFailedId, p_note: null });
        expect(outOfScope.error?.message).toMatch(/outside your warehouse scope/);

        const confirmed = await rpc(manager, 'staff_confirm_failed_delivery_return', { p_order_id: krtFailedId, p_note: `${TEST_TAG} received` });
        expect(confirmed.error).toBeNull();
        expect((await orderRow(krtFailedId)).returned_to_warehouse_at).not.toBeNull();
        expect((await fetchNeeds()).find((row) => row.order_id === krtFailedId)?.reason).toBe('delivery_failed');

        const cancelled = await rpc(manager, 'supervisor_update_order', { p_order_id: krtFailedId, p_status: 'cancelled' });
        expect(cancelled.error).toBeNull();
        expect((await orderRow(krtFailedId)).status).toBe('cancelled');
    });

    it('refuses shipping an unpacked order while require_packing_check is on', async () => {
        const flagOn = await loose(admin).from('app_settings').update({ require_packing_check: true }).eq('id', true);
        expect(flagOn.error).toBeNull();

        const prepare = await rpc(manager, 'supervisor_update_order', { p_order_id: packOrderId, p_status: 'preparing' });
        expect(prepare.error).toBeNull();
        const ship = await rpc(manager, 'supervisor_update_order', { p_order_id: packOrderId, p_status: 'shipped' });
        expect(ship.error?.message).toMatch(/Pack the order before/);
        expect((await orderRow(packOrderId)).status).toBe('preparing');
    });

    it('packing needs every line checked in full before the order is marked packed', async () => {
        const partial = await rpc(manager, 'staff_mark_packed', { p_order_id: packOrderId });
        expect(partial.error?.message).toMatch(/checked in full/);

        const checked = await rpc(manager, 'staff_set_item_check', { p_order_id: packOrderId, p_line_no: 1, p_checked_qty: 1 });
        expect(checked.error).toBeNull();
        const packed = await rpc(manager, 'staff_mark_packed', { p_order_id: packOrderId });
        expect(packed.error).toBeNull();
        expect((await orderRow(packOrderId)).packed_at).not.toBeNull();

        const { data, error } = await rpc(manager, 'staff_get_item_checks', { p_order_id: packOrderId });
        expect(error).toBeNull();
        const rows = data as unknown as ItemCheckRow[];
        expect(rows.some((row) => row.stage === 'packing' && row.line_no === 1 && row.checked_qty === 1)).toBe(true);
    });

    it('a delivery_failed order raises one unread notification for its KRT manager only', async () => {
        const krt = await loose(manager).from('staff_notifications').select('id').eq('kind', 'delivery_failed').eq('ref_id', krtFailedId).is('read_at', null);
        expect(krt.error).toBeNull();
        expect(krt.data ?? []).toHaveLength(1);
        const pzu = await loose(manager).from('staff_notifications').select('id').eq('ref_id', pzuFailedId);
        expect(pzu.error).toBeNull();
        expect(pzu.data ?? []).toHaveLength(0);
    });

    it('crossing reorder_level raises one low-stock notification, and a further drop does not duplicate it', async () => {
        const { data, error } = await loose(admin)
            .from('warehouse_inventory')
            .select('quantity,reorder_level')
            .eq('warehouse_id', krtId)
            .eq('product_id', product.id)
            .single();
        if (error) throw new Error(error.message);
        const before = Number(data?.quantity ?? 0);
        const refId = lowStockRefId(krtId, product.id);
        try {
            await adjust(krtId, product.id, 1, 'low stock setup', 5);
            await adjust(krtId, product.id, 5 - (before + 1), 'low stock crossing', 5);
            expect(await unreadLowStock(refId)).toHaveLength(1);

            await adjust(krtId, product.id, -1, 'low stock further drop');
            expect(await unreadLowStock(refId)).toHaveLength(1);
        } finally {
            const now = await loose(admin).from('warehouse_inventory').select('quantity').eq('warehouse_id', krtId).eq('product_id', product.id).single();
            const current = Number(now.data?.quantity ?? before);
            await adjust(krtId, product.id, before - current, 'low stock restore', 0);
        }
    });

    it('staff_get_driver_locations returns no driver of another warehouse', async () => {
        const pzuDrivers = await admin.from('drivers').select('id').eq('warehouse_id', pzuId);
        if (pzuDrivers.error) throw pzuDrivers.error;
        const pzuIds = (pzuDrivers.data ?? []).map((row) => row.id);
        expect(pzuIds).toContain(pzuDriverId);

        const { data, error } = await rpc(manager, 'staff_get_driver_locations');
        expect(error).toBeNull();
        const rows = data as unknown as LocationRow[];
        expect(rows.some((row) => pzuIds.includes(row.driver_id))).toBe(false);

        const scoped = await rpc(manager, 'staff_get_driver_locations', { p_warehouse_id: pzuId });
        expect(scoped.error?.message).toMatch(/outside your scope/);
    });
});
