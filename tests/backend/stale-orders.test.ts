import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, publicStock, rpc, signedInClient, type Client } from './helpers';

// The Order Expiry sweep (cancel_stale_orders, pg_cron every 15 min) is service-role only. The
// admin-only test helpers backdate a tagged test Order and run the sweep on demand so the rule
// "only `new` Orders older than 48h" can be asserted without waiting for the schedule.

const suite = haveCreds ? describe : describe.skip;

suite('the order expiry sweep touches only stale new orders', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };

    const createOrder = async () => {
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        expect(created.error).toBeNull();
        return (created.data as { order_id: string }[])[0].order_id;
    };
    const backdate = (client: Client, orderId: string, hours: number) =>
        rpc(client, 'admin_backdate_test_order', { p_order_id: orderId, p_created_at: new Date(Date.now() - hours * 3600_000).toISOString() });
    const statusOf = async (orderId: string) => (await admin.from('orders').select('status').eq('id', orderId).single()).data!.status;

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

    it('the helpers are admin-only and only touch tagged test orders', async () => {
        const orderId = await createOrder();
        const asCustomer = await backdate(customer, orderId, 72);
        expect(asCustomer.error?.message ?? '').toMatch(/administrator/i);
        const sweepAsCustomer = await rpc(customer, 'admin_run_stale_order_sweep');
        expect(sweepAsCustomer.error?.message ?? '').toMatch(/administrator/i);
        const notTagged = await backdate(admin, randomUUID(), 72);
        expect(notTagged.error?.message ?? '').toMatch(/test order/i);
    });

    it('cancels a stale new order and releases its stock, leaving fresh and confirmed orders alone', async () => {
        const stockBefore = await publicStock(customer, product.id);
        const stale = await createOrder();
        const fresh = await createOrder();
        const confirmedButOld = await createOrder();
        expect(await publicStock(customer, product.id)).toBe(stockBefore - 3);

        expect((await backdate(admin, stale, 49)).error).toBeNull();
        expect((await backdate(admin, confirmedButOld, 49)).error).toBeNull();
        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: confirmedButOld, p_expected_status: 'new', p_status: 'confirmed' });
        expect(confirm.error).toBeNull();

        const sweep = await rpc(admin, 'admin_run_stale_order_sweep');
        expect(sweep.error).toBeNull();
        expect(Number(sweep.data)).toBeGreaterThanOrEqual(1);

        expect(await statusOf(stale)).toBe('cancelled');
        expect(await statusOf(fresh)).toBe('new');
        expect(await statusOf(confirmedButOld)).toBe('confirmed');
        // Only the stale order's unit came back.
        expect(await publicStock(customer, product.id)).toBe(stockBefore - 2);
        const { data: history } = await admin.from('order_status_history').select('status,note').eq('order_id', stale).eq('status', 'cancelled');
        expect(history?.[0]?.note).toMatch(/إلغاء تلقائي/);
    });

    it('a just-under-48h new order is not swept', async () => {
        const almost = await createOrder();
        expect((await backdate(admin, almost, 47)).error).toBeNull();
        const sweep = await rpc(admin, 'admin_run_stale_order_sweep');
        expect(sweep.error).toBeNull();
        expect(await statusOf(almost)).toBe('new');
    });
});
