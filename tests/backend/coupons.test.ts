import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, anonClient, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Coupons (T2-08): staff create them through admin_save_coupon, the Checkout page previews them
// through preview_coupon, and checkout_order applies the same evaluation under a row lock.

const suite = haveCreds ? describe : describe.skip;

type Preview = { ok: boolean; reason: string | null; code: string | null; name: string | null; reduction: number; base_subtotal: number; line_reductions: number };

suite('coupons over the backend RPCs', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let basePrice: number;
    let originalDiscount: number | null;
    const couponIds: string[] = [];
    const stamp = Date.now().toString(36).toUpperCase();
    const code = (suffix: string) => `TA-${stamp}-${suffix}`;

    const saveCoupon = async (args: Record<string, unknown>) => {
        const { data, error } = await rpc(admin, 'admin_save_coupon', { p_name: `${TEST_TAG} coupon`, p_discount_type: 'fixed', p_discount_value: 100, p_per_user_limit: 5, ...args });
        if (error) throw error;
        couponIds.push(data as unknown as string);
        return data as unknown as string;
    };
    const preview = async (client: Client, c: string, quantity = 1) => {
        const { data, error } = await rpc(client, 'preview_coupon', { p_code: c, p_items: [{ id: product.id, quantity }] });
        if (error) throw error;
        return (data as unknown as Preview[])[0];
    };
    const setDiscount = async (pct: number | null) => {
        const { error } = await admin.from('products').update({ discount_percentage: pct }).eq('id', product.id);
        if (error) throw error;
    };
    const checkoutWith = (c: string | null, quantity = 1) =>
        rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity }], randomUUID()), p_coupon_code: c });

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data } = await admin.from('products').select('price,discount_percentage').eq('id', product.id).single();
        basePrice = Number(data!.price);
        originalDiscount = data!.discount_percentage;
        await setDiscount(null);
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        for (const id of couponIds) await rpc(admin, 'admin_delete_coupon', { p_id: id });
        await setDiscount(originalDiscount);
        await product?.release();
    });

    it('only admins create coupons, and the table takes no direct writes', async () => {
        const asCustomer = await rpc(customer, 'admin_save_coupon', { p_code: code('X'), p_name: 'x', p_discount_type: 'fixed', p_discount_value: 1 });
        expect(asCustomer.error?.message ?? '').toMatch(/administrator/i);
        const direct = await admin.from('coupons').insert({ code: code('DIRECT'), name: 'x', discount_type: 'fixed', discount_value: 1 });
        expect(direct.error?.code).toBe('42501');
        const badCode = await rpc(admin, 'admin_save_coupon', { p_code: 'a b', p_name: 'x', p_discount_type: 'fixed', p_discount_value: 1 });
        expect(badCode.error?.message ?? '').toMatch(/code is invalid/i);
        const badPct = await rpc(admin, 'admin_save_coupon', { p_code: code('PCT'), p_name: 'x', p_discount_type: 'percentage', p_discount_value: 150 });
        expect(badPct.error?.message ?? '').toMatch(/value is invalid/i);
    });

    it('preview refuses a cart checkout would refuse', async () => {
        const gone = await rpc(customer, 'preview_coupon', { p_code: code('ANY'), p_items: [{ id: randomUUID(), quantity: 1 }] });
        expect(gone.error?.message ?? '').toMatch(/product not found/i);
    });

    it('preview refuses with a typed reason and never for anonymous callers', async () => {
        await saveCoupon({ p_code: code('MIN'), p_min_order_amount: basePrice * 10 });
        await saveCoupon({ p_code: code('LATER'), p_starts_at: new Date(Date.now() + 86_400_000).toISOString() });
        await saveCoupon({ p_code: code('GONE'), p_starts_at: new Date(Date.now() - 172_800_000).toISOString(), p_ends_at: new Date(Date.now() - 86_400_000).toISOString() });
        await saveCoupon({ p_code: code('OFF'), p_is_active: false });
        expect((await preview(customer, code('NOPE'))).reason).toBe('unknown');
        expect((await preview(customer, code('MIN'))).reason).toBe('below_minimum');
        expect((await preview(customer, code('LATER'))).reason).toBe('not_started');
        expect((await preview(customer, code('GONE'))).reason).toBe('expired');
        expect((await preview(customer, code('OFF'))).reason).toBe('inactive');
        const asAnon = await rpc(anon, 'preview_coupon', { p_code: code('MIN'), p_items: [] });
        expect(asAnon.error).toBeTruthy();
    });

    it('a valid coupon previews the reduction, and checkout charges exactly that', async () => {
        await saveCoupon({ p_code: code('OK'), p_discount_type: 'percentage', p_discount_value: 10, p_max_discount_amount: 50 });
        const p = await preview(customer, code('ok'));
        expect(p.ok).toBe(true);
        expect(p.reason).toBeNull();
        expect(Number(p.reduction)).toBe(Math.min(50, Number((basePrice * 0.1).toFixed(2))));
        const created = await checkoutWith(code('OK'));
        expect(created.error).toBeNull();
        const order = (created.data as { discount_amount: number; total: number }[])[0];
        expect(Number(order.discount_amount)).toBe(Number(p.reduction));
        expect(Number(order.total)).toBe(Number((basePrice - Number(p.reduction) + zone.fee).toFixed(2)));
    });

    it('a coupon competes with the line reductions: the larger single reduction wins, nothing stacks', async () => {
        await setDiscount(20);
        try {
            await saveCoupon({ p_code: code('SMALL'), p_discount_value: 1 });
            const losing = await preview(customer, code('SMALL'));
            expect(losing.reason).toBe('not_best');
            expect(Number(losing.line_reductions)).toBe(Number((basePrice * 0.2).toFixed(2)));
            const refused = await checkoutWith(code('SMALL'));
            expect(refused.error?.message ?? '').toMatch(/Coupon refused: not_best/);

            await saveCoupon({ p_code: code('BIG'), p_discount_value: Math.ceil(basePrice * 0.3) });
            const winning = await preview(customer, code('BIG'));
            expect(winning.ok).toBe(true);
            const created = await checkoutWith(code('BIG'));
            expect(created.error).toBeNull();
            const order = (created.data as { order_id: string; discount_amount: number; total: number }[])[0];
            // The Coupon won: the line is charged at its base price and carries no line rule.
            const { data: row } = await admin.from('orders').select('items,coupon_code').eq('id', order.order_id).single();
            const line = (row!.items as { effective_unit_price: number; pricing_rule_kind: string | null; line_total: number }[])[0];
            expect(Number(line.effective_unit_price)).toBe(basePrice);
            expect(line.pricing_rule_kind).toBeNull();
            expect(row!.coupon_code).toBe(code('BIG'));
            expect(Number(order.total)).toBe(Number((basePrice - Number(winning.reduction) + zone.fee).toFixed(2)));
        } finally {
            await setDiscount(null);
        }
    });

    it('the per-customer limit holds across two orders placed at the same time', async () => {
        await saveCoupon({ p_code: code('ONCE'), p_per_user_limit: 1, p_discount_value: 10 });
        // Two different Products, so the two checkouts meet on the Coupon row lock, not the product lock.
        // The other Product must carry no line rule, or the small Coupon would lose to it (not_best).
        const { data: catalogue } = await customer.rpc('get_public_products');
        const other = (catalogue as { id: string; stock: number; pricing_rule_kind: string | null }[]).find((p) => p.id !== product.id && p.stock > 0 && !p.pricing_rule_kind) ?? { id: product.id };
        const second = rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: other.id, quantity: 1 }], randomUUID()), p_coupon_code: code('ONCE') });
        const [a, b] = await Promise.all([checkoutWith(code('ONCE')), second]);
        const errors = [a, b].filter((r) => r.error);
        expect(errors).toHaveLength(1);
        expect(errors[0].error?.message ?? '').toMatch(/Coupon refused: customer_limit/);
        expect((await preview(customer, code('ONCE'))).reason).toBe('customer_limit');
        const { data: c } = await admin.from('coupons').select('usage_count').eq('code', code('ONCE')).single();
        expect(c!.usage_count).toBe(1);
    });

    it('the total usage limit refuses the next order and reports used_up', async () => {
        await saveCoupon({ p_code: code('LAST'), p_usage_limit: 1, p_discount_value: 10 });
        expect((await checkoutWith(code('LAST'))).error).toBeNull();
        expect((await preview(customer, code('LAST'))).reason).toBe('used_up');
        expect((await checkoutWith(code('LAST'))).error?.message ?? '').toMatch(/Coupon refused: used_up/);
        const del = await rpc(admin, 'admin_delete_coupon', { p_id: couponIds[couponIds.length - 1] });
        expect(del.error?.message ?? '').toMatch(/redemptions/i);
        await cleanupTestOrders(admin); // deleting the tagged orders removes their redemptions (reversal itself is proven in reversal.test.ts)
        expect((await rpc(admin, 'admin_delete_coupon', { p_id: couponIds.pop()! })).error).toBeNull();
    });
});
