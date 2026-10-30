import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
    TEST_TAG,
    cleanupTestOrders,
    createTestOrder,
    creds,
    haveCreds,
    pickZone,
    provisionProduct,
    rpc,
    signedInClient,
    type Client,
} from './helpers';

const suite = haveCreds ? describe : describe.skip;
const supervisorSuite = haveCreds ? describe : describe.skip;

type SupervisorProfileRow = { role: string; assigned_warehouse_id: string | null };
type Zone = { name: string; state: string | null; fee: number };

const readQty = async (admin: Client, warehouseId: string, productId: string): Promise<number> => {
    const { data, error } = await admin
        .from('warehouse_inventory')
        .select('quantity')
        .eq('warehouse_id', warehouseId)
        .eq('product_id', productId)
        .maybeSingle();
    if (error) throw error;
    return Number(data?.quantity ?? 0);
};

const adjust = async (admin: Client, warehouseId: string, productId: string, delta: number, note: string) => {
    const { error } = await rpc(admin, 'adjust_warehouse_inventory', {
        p_warehouse_id: warehouseId,
        p_product_id: productId,
        p_quantity_delta: delta,
        p_note: note,
    });
    if (error) throw error;
};

suite('admin_set_warehouse_supervisor', () => {
    let admin: Client;
    let customer: Client;
    let customerId: string;
    let adminId: string;
    let warehouseId: string;

    const profile = async (client: Client, id: string) => {
        const { data, error } = await client.from('profiles').select('role,assigned_warehouse_id').eq('id', id).single();
        if (error) throw error;
        return data as unknown as SupervisorProfileRow;
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        const customerUser = await customer.auth.getUser();
        const adminUser = await admin.auth.getUser();
        if (!customerUser.data.user || !adminUser.data.user) throw new Error('Test users did not resolve');
        customerId = customerUser.data.user.id;
        adminId = adminUser.data.user.id;
        const { data, error } = await admin.from('warehouses').select('id').eq('code', 'KRT').single();
        if (error) throw error;
        warehouseId = data.id;
    });

    afterAll(async () => {
        if (!admin || !customerId) return;
        await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: null });
    });

    it('refuses non-admins', async () => {
        const { error } = await rpc(customer, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: warehouseId });
        expect(error?.message).toMatch(/Administrator/);
        expect((await profile(customer, customerId)).role).toBe('customer');
    });

    it('refuses unknown users, unknown warehouses and administrator accounts', async () => {
        const unknownUser = await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: randomUUID(), p_warehouse_id: warehouseId });
        expect(unknownUser.error?.message).toMatch(/User not found/);
        const unknownWarehouse = await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: randomUUID() });
        expect(unknownWarehouse.error?.message).toMatch(/Warehouse not found/);
        const adminTarget = await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: adminId, p_warehouse_id: null });
        expect(adminTarget.error).not.toBeNull();
        expect((await profile(admin, adminId)).role).toBe('admin');
    });

    it('assigns a supervisor and unassigning returns the account to customer', async () => {
        const assign = await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: warehouseId });
        expect(assign.error).toBeNull();
        expect(await profile(customer, customerId)).toEqual({ role: 'warehouse_supervisor', assigned_warehouse_id: warehouseId });

        const unassign = await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: null });
        expect(unassign.error).toBeNull();
        expect(await profile(customer, customerId)).toEqual({ role: 'customer', assigned_warehouse_id: null });
    });

    it('stops a supervisor re-pointing their own warehouse', async () => {
        await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: customerId, p_warehouse_id: warehouseId });
        const { error } = await customer.from('profiles').update({ assigned_warehouse_id: null }).eq('id', customerId);
        expect(error?.message).toMatch(/administrator/i);
        expect((await profile(customer, customerId)).assigned_warehouse_id).toBe(warehouseId);
    });
});

supervisorSuite('warehouse manager scope (KRT only, then KRT + PZU)', () => {
    let admin: Client;
    let manager: Client;
    let managerId: string;
    let krtId: string;
    let pzuId: string;
    let zone: Zone;
    let product: { id: string; warehouseId: string; release: () => Promise<void> };
    let assignOrderId: string;
    let pzuOrderId: string;
    let outOfScopeDriverId: string;
    let inactiveDriverId: string;
    const pzuTopUp = 2;

    const orderInPzu = async (): Promise<string> => {
        const krtQty = await readQty(admin, krtId, product.id);
        if (krtQty > 0) await adjust(admin, krtId, product.id, -krtQty, `${TEST_TAG} PZU routing`);
        await adjust(admin, pzuId, product.id, pzuTopUp, `${TEST_TAG} PZU routing`);
        try {
            const order = await createTestOrder(manager, zone, product.id);
            const { data, error } = await admin.from('orders').select('fulfillment_warehouse_id').eq('id', order.order_id).single();
            if (error) throw error;
            if (data.fulfillment_warehouse_id !== pzuId) throw new Error('Checkout did not route the test order to PZU');
            const pzuLeft = await readQty(admin, pzuId, product.id);
            if (pzuLeft > 0) await adjust(admin, pzuId, product.id, -pzuLeft, `${TEST_TAG} PZU routing drain`);
            return order.order_id;
        } finally {
            if (krtQty > 0) await adjust(admin, krtId, product.id, krtQty, `${TEST_TAG} PZU routing restore`);
        }
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

        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(manager);

        const access = await rpc(admin, 'admin_set_warehouse_manager_access', {
            p_user_id: managerId,
            p_warehouse_ids: [krtId],
            p_primary_warehouse_id: krtId,
        });
        if (access.error) throw access.error;

        assignOrderId = (await createTestOrder(manager, zone, product.id)).order_id;
        pzuOrderId = await orderInPzu();

        const outOfScope = await admin
            .from('drivers')
            .insert({ name: `${TEST_TAG} PZU driver`, phone: '0955555555', status: 'active', warehouse_id: pzuId })
            .select('id')
            .single();
        if (outOfScope.error) throw outOfScope.error;
        outOfScopeDriverId = outOfScope.data.id;

        const inactive = await admin
            .from('drivers')
            .insert({ name: `${TEST_TAG} inactive driver`, phone: '0966666666', status: 'offline', warehouse_id: krtId })
            .select('id')
            .single();
        if (inactive.error) throw inactive.error;
        inactiveDriverId = inactive.data.id;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        if (pzuId && product) {
            const pzuLeft = await readQty(admin, pzuId, product.id);
            if (pzuLeft > 0) await adjust(admin, pzuId, product.id, -pzuLeft, `${TEST_TAG} PZU routing undo`);
        }
        await admin.from('drivers').delete().like('name', `${TEST_TAG}%`);
        if (managerId) await rpc(admin, 'admin_set_warehouse_supervisor', { p_user_id: managerId, p_warehouse_id: null });
        await product?.release();
    });

    it('does not see orders or inventory of PZU', async () => {
        const orders = await manager.from('orders').select('id,fulfillment_warehouse_id').eq('fulfillment_warehouse_id', pzuId);
        expect(orders.error).toBeNull();
        expect(orders.data).toEqual([]);

        const inventory = await manager.from('warehouse_inventory').select('warehouse_id').eq('warehouse_id', pzuId);
        expect(inventory.error).toBeNull();
        expect(inventory.data).toEqual([]);
    });

    it('refuses supervisor_update_order on a PZU order', async () => {
        const { error } = await rpc(manager, 'supervisor_update_order', { p_order_id: pzuOrderId, p_status: 'confirmed' });
        expect(error?.message).toMatch(/outside your warehouse scope/);
    });

    it('refuses delivered and unknown statuses on an in-scope order', async () => {
        for (const status of ['delivered', 'teleported']) {
            const { error } = await rpc(manager, 'supervisor_update_order', { p_order_id: assignOrderId, p_status: status });
            expect(error?.message).toMatch(/not allowed/);
        }
    });

    it('cancelling an in-scope order returns its reserved stock', async () => {
        const before = await readQty(admin, krtId, product.id);
        const orderId = (await createTestOrder(manager, zone, product.id)).order_id;
        expect(await readQty(admin, krtId, product.id)).toBe(before - 1);

        const cancel = await rpc(manager, 'supervisor_update_order', {
            p_order_id: orderId,
            p_status: 'cancelled',
            p_expected_status: 'new',
        });
        expect(cancel.error).toBeNull();
        expect(await readQty(admin, krtId, product.id)).toBe(before);
    });

    it('refuses assigning a driver from another warehouse or an inactive driver', async () => {
        const other = await rpc(manager, 'supervisor_assign_driver', { p_order_id: assignOrderId, p_driver_id: outOfScopeDriverId });
        expect(other.error?.message).toMatch(/another warehouse/);

        const inactive = await rpc(manager, 'supervisor_assign_driver', { p_order_id: assignOrderId, p_driver_id: inactiveDriverId });
        expect(inactive.error?.message).toMatch(/not available/);
    });

    it('blocks direct writes to orders and warehouse_inventory', async () => {
        const orderWrite = await manager.from('orders').update({ notes: TEST_TAG }).eq('id', assignOrderId);
        expect(orderWrite.error).not.toBeNull();

        const stockWrite = await manager.from('warehouse_inventory').update({ quantity: 999 }).eq('warehouse_id', krtId);
        expect(stockWrite.error).not.toBeNull();
    });

    it('refuses adjust_warehouse_inventory on PZU', async () => {
        const { error } = await rpc(manager, 'adjust_warehouse_inventory', {
            p_warehouse_id: pzuId,
            p_product_id: product.id,
            p_quantity_delta: 1,
            p_note: TEST_TAG,
        });
        expect(error?.message).toMatch(/outside your scope/);
    });

    it('multi-warehouse assignment through admin_set_warehouse_manager_access widens visibility', async () => {
        const before = await manager.from('orders').select('id').eq('id', pzuOrderId);
        expect(before.data).toEqual([]);

        const grant = await rpc(admin, 'admin_set_warehouse_manager_access', {
            p_user_id: managerId,
            p_warehouse_ids: [krtId, pzuId],
            p_primary_warehouse_id: krtId,
        });
        expect(grant.error).toBeNull();

        const after = await manager.from('orders').select('id').eq('id', pzuOrderId);
        expect(after.data).toHaveLength(1);
    });
});
