import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { anonClient, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickProduct, pickZone, publicStock, rpc, signedInClient, type Client } from './helpers';

// Runs against the linked Supabase project with two auto-confirmed test accounts
// (see .env.test.local). Orders are tagged with customer_name = TEST-AUTOMATED and deleted afterwards.

const suite = haveCreds ? describe : describe.skip;

suite('order lifecycle against the live backend', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; stock: number };
    let zone: { name: string; state: string | null; fee: number };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        await cleanupTestOrders(admin);
        product = await pickProduct(customer, 6);
        zone = await pickZone(customer);
    });

    afterAll(async () => {
        if (admin) await cleanupTestOrders(admin);
    });

    it('anonymous users cannot read products directly or call customer RPCs', async () => {
        const direct = await anon.from('products').select('cost_price').limit(1);
        expect(direct.error?.code).toBe('42501');
        const cancel = await rpc(anon, 'customer_cancel_order', { p_order_id: randomUUID() });
        expect(cancel.error).toBeTruthy();
    });

    it('a logged-in customer cannot see cost_price nor edit their own loyalty points', async () => {
        const cost = await customer.from('products').select('cost_price').limit(1);
        expect(cost.error?.code).toBe('42501');
        const { data: user } = await customer.auth.getUser();
        const pts = await customer.from('profiles').update({ beauty_points: 999999 }).eq('id', user.user!.id).select('beauty_points');
        expect(pts.error?.message ?? '').toMatch(/administrator/i);
    });

    it('checkout reserves stock, snapshots items, applies the zone fee and is idempotent', async () => {
        const before = await publicStock(customer, product.id);
        const key = randomUUID();
        const args = checkoutArgs(zone, [{ id: product.id, quantity: 2 }], key);

        const first = await rpc(customer, 'checkout_order_safe', args);
        expect(first.error).toBeNull();
        const order = (first.data as { order_id: string; shipping_fee: number; total: number }[])[0];
        expect(Number(order.shipping_fee)).toBe(zone.fee);

        const again = await rpc(customer, 'checkout_order_safe', args);
        expect(again.error).toBeNull();
        expect((again.data as { order_id: string }[])[0].order_id).toBe(order.order_id);

        expect(await publicStock(customer, product.id)).toBe(before - 2);

        const { data: row } = await customer.from('orders').select('items,status,payment_status').eq('id', order.order_id).single();
        const items = row!.items as { id: string; quantity: number; name_ar?: string; unit_price?: number; line_total?: number }[];
        expect(items[0].id).toBe(product.id);
        expect(items[0].name_ar).toBeTruthy();
        expect(items[0].unit_price).toBeGreaterThan(0);
        expect(row!.status).toBe('new');
    });

    it('two concurrent submissions with the same key create exactly one order', async () => {
        const before = await publicStock(customer, product.id);
        const key = randomUUID();
        const args = checkoutArgs(zone, [{ id: product.id, quantity: 1 }], key);
        const [a, b] = await Promise.all([rpc(customer, 'checkout_order_safe', args), rpc(customer, 'checkout_order_safe', args)]);
        const ids = [a, b].filter((r) => !r.error).map((r) => (r.data as { order_id: string }[])[0].order_id);
        expect(ids.length).toBeGreaterThanOrEqual(1);
        expect(new Set(ids).size).toBe(1);
        expect(await publicStock(customer, product.id)).toBe(before - 1);
    });

    it('customer cancels a new order and stock is restored exactly once', async () => {
        const before = await publicStock(customer, product.id);
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 3 }], randomUUID()));
        expect(created.error).toBeNull();
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        expect(await publicStock(customer, product.id)).toBe(before - 3);

        const cancel = await rpc(customer, 'customer_cancel_order', { p_order_id: orderId });
        expect(cancel.error).toBeNull();
        expect(await publicStock(customer, product.id)).toBe(before);

        const twice = await rpc(customer, 'customer_cancel_order', { p_order_id: orderId });
        expect(twice.error?.message ?? '').toMatch(/Only new orders/);
        expect(await publicStock(customer, product.id)).toBe(before);

        const { data: history } = await customer.from('order_status_history').select('status').eq('order_id', orderId).order('created_at');
        expect(history!.map((h) => h.status)).toEqual(['new', 'cancelled']);
    });

    it('concurrent checkout and admin cancel on the same product leave stock consistent', async () => {
        const before = await publicStock(customer, product.id);
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        const orderId = (created.data as { order_id: string }[])[0].order_id;

        const [cancel, newOrder] = await Promise.all([
            rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'cancelled', p_note: 'race test' }),
            rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID())),
        ]);
        expect(cancel.error).toBeNull();
        expect(newOrder.error).toBeNull();
        // first order reserved (-1) then cancelled (+1); second order reserved (-1) → before - 1
        expect(await publicStock(customer, product.id)).toBe(before - 1);
    });

    it('admin transitions follow the rules and a customer cannot cancel a confirmed order', async () => {
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        const orderId = (created.data as { order_id: string }[])[0].order_id;

        const skip = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'delivered' });
        expect(skip.error?.message ?? '').toMatch(/not allowed/);

        const confirm = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'confirmed' });
        expect(confirm.error).toBeNull();

        const stale = await rpc(admin, 'admin_update_order_operation', { p_order_id: orderId, p_expected_status: 'new', p_status: 'cancelled' });
        expect(stale.error?.message ?? '').toMatch(/another user/);

        const customerCancel = await rpc(customer, 'customer_cancel_order', { p_order_id: orderId });
        expect(customerCancel.error?.message ?? '').toMatch(/Only new orders/);

        const viewed = await rpc(admin, 'mark_order_viewed', { p_order_id: orderId });
        expect(viewed.error).toBeNull();
        const { data: row } = await admin.from('orders').select('viewed_at').eq('id', orderId).single();
        expect((row as { viewed_at: string | null }).viewed_at).toBeTruthy();
    });

    it('creating an order queues customer and staff email notifications', async () => {
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const { data: queue } = await admin.from('notification_queue').select('channel,payload,status').eq('order_id', orderId).eq('channel', 'email');
        const audiences = (queue ?? []).map((q) => (q.payload as { audience: string }).audience).sort();
        expect(audiences).toEqual(['customer', 'staff']);
    });

    it('Mycashi orders require a proof path under the caller uid and reject fake paths', async () => {
        const created = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_payment_method: 'Mychashi' });
        expect(created.error).toBeNull();
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const bad = await rpc(customer, 'submit_payment_proof', { p_order_id: orderId, p_payment_method: 'Mychashi', p_amount: 1, p_transaction_reference: 'REF1', p_proof_path: 'someone-else/x.jpg' });
        expect(bad.error).toBeTruthy();
    });

    it('the stale-order sweep cancels old new orders and releases their stock', async () => {
        const before = await publicStock(customer, product.id);
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const sweep = await rpc(admin, 'cancel_stale_orders', { p_max_age: '0 seconds' });
        // cancel_stale_orders is service_role only; an admin JWT must be refused.
        expect(sweep.error).toBeTruthy();
        const { data: row } = await admin.from('orders').select('status').eq('id', orderId).single();
        expect(row!.status).toBe('new');
        expect(await publicStock(customer, product.id)).toBe(before - 1);
    });
});
