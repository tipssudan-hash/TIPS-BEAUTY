import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, cleanupTestOrders, createTestOrder, creds, haveCreds, pickZone, provisionProduct, publicStock, rpc, signedInClient, type Client } from './helpers';

// Cancelling an Order must give back exactly once what checkout consumed: stock, the Coupon use
// and the redeemed points. Both cancel paths (customer, admin) end in release_order_resources.

const suite = haveCreds ? describe : describe.skip;

suite('order cancellation reverses coupon and points exactly once', () => {
    let customer: Client;
    let admin: Client;
    let customerId: string;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let couponId: string;
    const couponCode = `${TEST_TAG}-${Date.now().toString(36).toUpperCase()}`;

    const couponUsage = async () => {
        const { data, error } = await admin.from('coupons').select('usage_count').eq('id', couponId).single();
        if (error) throw error;
        return data.usage_count;
    };
    const redemptions = async (orderId: string) => {
        const { data, error } = await admin.from('coupon_redemptions').select('id').eq('order_id', orderId);
        if (error) throw error;
        return data.length;
    };
    const points = async () => {
        const { data, error } = await customer.from('profiles').select('beauty_points').eq('id', customerId).single();
        if (error) throw error;
        return data.beauty_points ?? 0;
    };
    const createOrder = (extra: Record<string, unknown>) => createTestOrder(customer, zone, product.id, extra);

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        customerId = (await customer.auth.getUser()).data.user!.id;
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data, error } = await admin.from('coupons')
            .insert({ code: couponCode, name: `${TEST_TAG} coupon`, discount_type: 'fixed', discount_value: 100, per_user_limit: 5, usage_limit: 10 })
            .select('id').single();
        if (error) throw error;
        couponId = data.id;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        if (couponId) await admin.from('coupons').delete().eq('id', couponId);
        await product?.release();
    });

    it('a customer cancel gives back the coupon use, and a second cancel attempt changes nothing', async () => {
        const stockBefore = await publicStock(customer, product.id);
        const order = await createOrder({ p_coupon_code: couponCode });
        expect(Number(order.discount_amount)).toBe(100);
        expect(await couponUsage()).toBe(1);
        expect(await redemptions(order.order_id)).toBe(1);
        expect(await publicStock(customer, product.id)).toBe(stockBefore - 1);

        const cancel = await rpc(customer, 'customer_cancel_order', { p_order_id: order.order_id });
        expect(cancel.error).toBeNull();
        expect(await couponUsage()).toBe(0);
        expect(await redemptions(order.order_id)).toBe(0);
        expect(await publicStock(customer, product.id)).toBe(stockBefore);

        // Neither cancel path may release twice. release_order_resources itself is internal, so
        // "exactly once" is asserted through the callers: a second cancel from either side leaves
        // usage count, stock and points as they were after the first.
        const again = await rpc(customer, 'customer_cancel_order', { p_order_id: order.order_id });
        expect(again.error).toBeTruthy();
        const adminAgain = await rpc(admin, 'admin_update_order_operation', { p_order_id: order.order_id, p_expected_status: 'cancelled', p_status: 'cancelled' });
        expect(adminAgain.error).toBeNull();
        expect(await couponUsage()).toBe(0);
        expect(await publicStock(customer, product.id)).toBe(stockBefore);
    });

    it('an admin cancel gives back redeemed points exactly once and writes one reversal ledger row', async () => {
        const { data: settings, error: sErr } = await admin.from('loyalty_settings').select('minimum_redemption_points').eq('id', true).single();
        if (sErr) throw sErr;
        const toRedeem = Math.max(settings.minimum_redemption_points, 1);
        const grant = await rpc(admin, 'adjust_loyalty_points', { p_customer_id: customerId, p_points_delta: toRedeem, p_note: `${TEST_TAG} grant` });
        expect(grant.error).toBeNull();
        try {
            const balanceBefore = await points();

            const order = await createOrder({ p_points_to_redeem: toRedeem });
            expect(Number(order.points_discount)).toBeGreaterThan(0);
            expect(await points()).toBe(balanceBefore - toRedeem);

            const cancel = await rpc(admin, 'admin_update_order_operation', { p_order_id: order.order_id, p_expected_status: 'new', p_status: 'cancelled', p_note: 'test' });
            expect(cancel.error).toBeNull();
            expect(await points()).toBe(balanceBefore);

            const again = await rpc(admin, 'admin_update_order_operation', { p_order_id: order.order_id, p_expected_status: 'cancelled', p_status: 'cancelled' });
            expect(again.error).toBeNull();
            expect(await points()).toBe(balanceBefore);
            const { data: ledger } = await admin.from('loyalty_ledger').select('event_type').eq('order_id', order.order_id);
            expect((ledger ?? []).filter((l) => l.event_type === 'refund_reversal')).toHaveLength(1);
        } finally {
            // The test Order is cancelled (or never existed), so the grant is fully back on the balance.
            await rpc(admin, 'adjust_loyalty_points', { p_customer_id: customerId, p_points_delta: -toRedeem, p_note: `${TEST_TAG} grant removed` });
        }
    });
});
