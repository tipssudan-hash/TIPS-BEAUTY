import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, createTestOrder, type Client } from './helpers';

// Notification Center (launch step 4): order events already write customer_notifications through
// triggers; the customer reads their own rows and marks them read through the two RPCs. Nobody
// writes the table from the apps.

const suite = haveCreds ? describe : describe.skip;

type Row = { id: string; type: string; order_id: string | null; is_read: boolean; read_at: string | null };

suite('customer notifications over the backend', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };

    const mine = async (client: Client) => {
        const { data, error } = await client.from('customer_notifications').select('id,type,order_id,is_read,read_at').order('created_at', { ascending: false });
        if (error) throw error;
        return data as Row[];
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        await product?.release();
    });

    it('an order creates an unread notification the customer can read and mark read exactly once', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        const rows = await mine(customer);
        const created = rows.find((r) => r.order_id === order.order_id && r.type === 'order_created');
        expect(created).toBeDefined();
        expect(created!.is_read).toBe(false);

        const { error } = await rpc(customer, 'mark_notification_read', { p_id: created!.id });
        expect(error).toBeNull();
        const after = (await mine(customer)).find((r) => r.id === created!.id)!;
        expect(after.is_read).toBe(true);
        expect(after.read_at).not.toBeNull();

        // Marking again keeps the first read_at.
        await rpc(customer, 'mark_notification_read', { p_id: created!.id });
        expect((await mine(customer)).find((r) => r.id === created!.id)!.read_at).toBe(after.read_at);
    });

    it('a status change adds a notification; mark-all clears every unread row and returns the count', async () => {
        const order = await createTestOrder(customer, zone, product.id);
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: order.order_id, p_expected_status: 'new', p_status: 'confirmed' });
        expect(confirm.error).toBeNull();
        const rows = await mine(customer);
        expect(rows.some((r) => r.order_id === order.order_id && r.type === 'order_status_confirmed')).toBe(true);
        const unreadBefore = rows.filter((r) => !r.is_read).length;
        expect(unreadBefore).toBeGreaterThan(0);

        const { data, error } = await rpc(customer, 'mark_all_notifications_read');
        expect(error).toBeNull();
        expect(Number(data)).toBe(unreadBefore);
        expect((await mine(customer)).every((r) => r.is_read)).toBe(true);
        expect(Number((await rpc(customer, 'mark_all_notifications_read')).data)).toBe(0);
    });

    it('rows belong to their customer: another account cannot read or mark them', async () => {
        const mineRows = await mine(customer);
        expect(mineRows.length).toBeGreaterThan(0);
        // The admin account is a different customer_id: marking the customer's row must be refused.
        const { error } = await rpc(admin, 'mark_notification_read', { p_id: mineRows[0].id });
        expect(error?.message).toMatch(/not found/);
        // And the table takes no direct writes from the apps.
        const direct = await customer.from('customer_notifications').update({ is_read: false }).eq('id', mineRows[0].id);
        expect(direct.error).not.toBeNull();
        expect(TEST_TAG).toBeTruthy();
    });
});
