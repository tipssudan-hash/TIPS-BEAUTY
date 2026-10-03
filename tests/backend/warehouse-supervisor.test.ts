import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { creds, haveCreds, rpc, signedInClient, type Client } from './helpers';

const suite = haveCreds ? describe : describe.skip;
// Needs a dedicated warehouse_supervisor login that .env.test.local does not provide yet.
const supervisorSuite = describe.skip;

type SupervisorProfileRow = { role: string; assigned_warehouse_id: string | null };

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

supervisorSuite('warehouse_supervisor visibility', () => {
    let supervisor: Client;
    let ownWarehouseId: string;
    let otherWarehouseId: string;

    beforeAll(async () => {
        supervisor = await signedInClient(process.env.TEST_SUPERVISOR_EMAIL ?? '', process.env.TEST_SUPERVISOR_PASSWORD ?? '');
        const own = await rpc(supervisor, 'my_warehouse_id');
        if (own.error) throw own.error;
        ownWarehouseId = own.data as unknown as string;
        const { data, error } = await supervisor.from('warehouses').select('id').neq('id', ownWarehouseId).limit(1).single();
        if (error) throw error;
        otherWarehouseId = data.id;
    });

    it('reads only orders fulfilled by its own warehouse', async () => {
        const { data, error } = await supervisor.from('orders').select('id,fulfillment_warehouse_id');
        expect(error).toBeNull();
        expect((data ?? []).every((o) => o.fulfillment_warehouse_id === ownWarehouseId)).toBe(true);
    });

    it('cannot read orders of another warehouse', async () => {
        const { data, error } = await supervisor.from('orders').select('id').eq('fulfillment_warehouse_id', otherWarehouseId);
        expect(error).toBeNull();
        expect(data).toEqual([]);
    });

    it('reads only its own warehouse inventory', async () => {
        const { data, error } = await supervisor.from('warehouse_inventory').select('warehouse_id');
        expect(error).toBeNull();
        expect((data ?? []).every((row) => row.warehouse_id === ownWarehouseId)).toBe(true);
    });
});
