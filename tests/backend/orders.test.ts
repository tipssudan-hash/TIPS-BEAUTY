import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, anonClient, checkoutArgs, cleanupTestOrders, creds, haveCreds, loose, pickZone, provisionProduct, publicStock, rpc, signedInClient, type Client } from './helpers';

// Runs against the linked Supabase project with two auto-confirmed test accounts
// (see .env.test.local). Orders are tagged with customer_name = TEST-AUTOMATED and deleted afterwards.

const suite = haveCreds ? describe : describe.skip;

suite('order lifecycle against the live backend', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        await product?.release();
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

    it('a checkout key reused with a different payload is refused, and the same payload replays the order', async () => {
        const key = randomUUID();
        const first = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], key));
        expect(first.error).toBeNull();
        const orderId = (first.data as { order_id: string }[])[0].order_id;

        const changed = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 2 }], key));
        expect(changed.error?.message).toMatch(/IDEMPOTENCY_KEY_REUSED/);

        const replay = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], key));
        expect(replay.error).toBeNull();
        expect((replay.data as { order_id: string }[])[0].order_id).toBe(orderId);
    });

    it('a checkout key whose order was cancelled is refused even with the same payload', async () => {
        const key = randomUUID();
        const args = checkoutArgs(zone, [{ id: product.id, quantity: 1 }], key);
        const first = await rpc(customer, 'checkout_order_safe', args);
        expect(first.error).toBeNull();
        const orderId = (first.data as { order_id: string }[])[0].order_id;

        const cancel = await rpc(customer, 'customer_cancel_order', { p_order_id: orderId });
        expect(cancel.error).toBeNull();

        const again = await rpc(customer, 'checkout_order_safe', args);
        expect(again.error?.message).toMatch(/IDEMPOTENCY_ORDER_CANCELLED/);
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

    // Runs fn with app_settings.notification_emails set to `emails`, then restores the saved list.
    async function withStaffRecipients(emails: string[], fn: () => Promise<void>) {
        const { data: settings } = await admin.from('app_settings').select('notification_emails').eq('id', true).single();
        const original = settings?.notification_emails ?? [];
        const { error } = await admin.from('app_settings').update({ notification_emails: emails }).eq('id', true);
        expect(error).toBeNull();
        try {
            await fn();
        } finally {
            await admin.from('app_settings').update({ notification_emails: original }).eq('id', true);
        }
    }

    async function emailRowsForNewOrder() {
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()));
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const { data: queue } = await admin.from('notification_queue').select('payload').eq('order_id', orderId).eq('channel', 'email');
        return (queue ?? []).map((q) => q.payload as { audience: string; recipient?: string });
    }

    it('creating an order queues one customer email row and one staff row per configured recipient', async () => {
        await withStaffRecipients(['test-staff-a@example.com', ' test-staff-b@example.com ', 'test-staff-a@example.com', ''], async () => {
            const rows = await emailRowsForNewOrder();
            expect(rows.filter((r) => r.audience === 'customer')).toHaveLength(1);
            // Trimmed, de-duplicated, blanks dropped: one row per distinct recipient.
            expect(rows.filter((r) => r.audience === 'staff').map((r) => r.recipient).sort())
                .toEqual(['test-staff-a@example.com', 'test-staff-b@example.com']);
        });
    });

    it('creating an order queues no staff email row when no recipient is configured', async () => {
        await withStaffRecipients([], async () => {
            expect((await emailRowsForNewOrder()).map((r) => r.audience)).toEqual(['customer']);
        });
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

    it('redeeming beauty points from the web lowers the charged total by the points discount', async () => {
        const { data: settings } = await loose(admin).from('loyalty_settings').select('minimum_redemption_points').eq('id', true).single();
        const minimum = Number((settings as { minimum_redemption_points: number }).minimum_redemption_points);
        const { data: user } = await customer.auth.getUser();
        const grant = await rpc(admin, 'adjust_loyalty_points', { p_customer_id: user.user!.id, p_points_delta: minimum, p_note: `${TEST_TAG} web redemption` });
        expect(grant.error).toBeNull();

        const orderIds: string[] = [];
        try {
            const plain = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()));
            expect(plain.error).toBeNull();
            const redeemed = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()), p_points_to_redeem: minimum });
            expect(redeemed.error).toBeNull();
            const plainRow = (plain.data as { order_id: string; total: number }[])[0];
            const redeemedRow = (redeemed.data as { order_id: string; total: number; points_discount: number }[])[0];
            orderIds.push(plainRow.order_id, redeemedRow.order_id);

            expect(Number(redeemedRow.points_discount)).toBeGreaterThan(0);
            expect(Number(redeemedRow.total)).toBeLessThan(Number(plainRow.total));
            expect(Number(plainRow.total) - Number(redeemedRow.total)).toBeCloseTo(Number(redeemedRow.points_discount), 2);
        } finally {
            for (const orderId of orderIds) await rpc(customer, 'customer_cancel_order', { p_order_id: orderId });
            const revoke = await rpc(admin, 'adjust_loyalty_points', { p_customer_id: user.user!.id, p_points_delta: -minimum, p_note: `${TEST_TAG} grant removed` });
            expect(revoke.error).toBeNull();
        }
    });

    it('a checkout without the GPS pin is accepted from the chosen zone and flagged for fulfilment review', async () => {
        const created = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_customer_lat: null, p_customer_lng: null });
        expect(created.error).toBeNull();
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const { data: row } = await loose(admin).from('orders').select('location_source,needs_fulfillment_review,customer_lat,customer_lng').eq('id', orderId).single();
        expect(row).toMatchObject({ location_source: 'zone', needs_fulfillment_review: true, customer_lat: null, customer_lng: null });
    });

    it('a checkout that sends only one GPS coordinate is refused', async () => {
        const { error } = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_customer_lng: null });
        expect(error?.message ?? '').toMatch(/provided together/);
    });
});

suite('payment proof storage', () => {
    it('a customer can upload two proofs for the same attempt and never into another prefix', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data: user } = await customer.auth.getUser();
        const uid = user.user!.id;
        const png = new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], { type: 'image/png' });
        const key = randomUUID();

        // Storage grants customers INSERT only, so a retry must use a fresh object name.
        const first = await customer.storage.from('payment-proofs').upload(`${uid}/${key}-1.png`, png, { upsert: false });
        const second = await customer.storage.from('payment-proofs').upload(`${uid}/${key}-2.png`, png, { upsert: false });
        expect(first.error).toBeNull();
        expect(second.error).toBeNull();

        const overwrite = await customer.storage.from('payment-proofs').upload(`${uid}/${key}-1.png`, png, { upsert: true });
        expect(overwrite.error).toBeTruthy();

        const foreign = await customer.storage.from('payment-proofs').upload(`${randomUUID()}/${key}.png`, png, { upsert: false });
        expect(foreign.error).toBeTruthy();

        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const signed = await admin.storage.from('payment-proofs').createSignedUrl(`${uid}/${key}-1.png`, 60);
        expect(signed.error).toBeNull();
        await admin.storage.from('payment-proofs').remove([`${uid}/${key}-1.png`, `${uid}/${key}-2.png`]);
    });
});
