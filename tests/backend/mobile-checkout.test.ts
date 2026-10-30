import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkoutArgs, cleanupTestOrders, creds, haveCreds, loose, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

const suite = haveCreds ? describe : describe.skip;

suite('mobile checkout (checkout_order_with_growth) against the live backend', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };

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

    it('refuses a checkout without the GPS pin when the state and city do not resolve to a zone', async () => {
        const args = { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_customer_lat: null, p_customer_lng: null, p_state: 'ولاية وهمية' };
        const { error } = await rpc(customer, 'checkout_order_with_growth', args);
        expect(error?.message).toMatch(/No delivery zone/);
    });

    it('places an order without the GPS pin from the chosen zone (location_source zone)', async () => {
        const args = { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_customer_lat: null, p_customer_lng: null };
        const { data, error } = await rpc(customer, 'checkout_order_with_growth', args);
        expect(error).toBeNull();
        const orderId = (data as { order_id: string }[])[0].order_id;
        const { data: row } = await loose(customer).from('orders').select('location_source,needs_fulfillment_review,customer_lat').eq('id', orderId).single();
        expect(row).toMatchObject({ location_source: 'zone', needs_fulfillment_review: true, customer_lat: null });
    });

    it('places an order with the GPS pin and replays the same key without a second order', async () => {
        const key = randomUUID();
        const args = checkoutArgs(zone, [{ id: product.id, quantity: 1 }], key);

        const first = await rpc(customer, 'checkout_order_with_growth', args);
        expect(first.error).toBeNull();
        const order = (first.data as { order_id: string; order_number: string; shipping_fee: number }[])[0];
        expect(order.order_id).toBeTruthy();
        expect(order.order_number).toMatch(/^TB-/);
        expect(Number(order.shipping_fee)).toBe(zone.fee);

        const replay = await rpc(customer, 'checkout_order_with_growth', args);
        expect(replay.error).toBeNull();
        expect((replay.data as { order_id: string }[])[0].order_id).toBe(order.order_id);
    });
});
