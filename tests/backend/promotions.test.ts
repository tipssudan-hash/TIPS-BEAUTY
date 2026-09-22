import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, anonClient, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Promotions (T2-10): staff schedule and target them through the admin RPCs, the backend derives
// their state from the schedule, effective_price matches them per target kind, and checkout charges
// the same price the catalogue showed. Discount vs Promotion vs Coupon never stack.

const suite = haveCreds ? describe : describe.skip;

type PublicProduct = { id: string; price: number; category: string | null; brand: string | null; effective_price: number; pricing_rule_kind: string | null; pricing_rule_label: string | null };
type AdminPromotion = { id: string; title: string; target_kind: string; target_value: string | null; target_product_ids: string[]; start_date: string; end_date: string | null; status: string };

suite('promotions over the backend RPCs', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let shown: PublicProduct;
    let originalDiscount: number | null;
    const ids: string[] = [];
    const couponIds: string[] = [];

    const publicProduct = async () => {
        const { data, error } = await customer.rpc('get_public_product', { p_product_id: product.id });
        if (error) throw error;
        return (data as unknown as PublicProduct[])[0];
    };
    const save = (client: Client, args: Record<string, unknown>) =>
        rpc(client, 'admin_save_promotion', { p_title: `${TEST_TAG} promotion`, p_discount_type: 'percentage', p_discount_value: 20, p_target_kind: 'all', ...args });
    const add = async (args: Record<string, unknown>) => {
        const { data, error } = await save(admin, args);
        if (error) throw error;
        ids.push(data as unknown as string);
        return data as unknown as string;
    };
    const list = async () => {
        const { data, error } = await rpc(admin, 'admin_get_promotions');
        if (error) throw error;
        return (data as unknown as AdminPromotion[]).filter((p) => p.title.startsWith(TEST_TAG));
    };
    const removeAll = async () => {
        for (const id of ids.splice(0)) {
            const { error } = await rpc(admin, 'admin_delete_promotion', { p_id: id });
            if (error) await rpc(admin, 'admin_end_promotion', { p_id: id });
        }
    };
    const setDiscount = async (pct: number | null) => {
        const { error } = await admin.from('products').update({ discount_percentage: pct }).eq('id', product.id);
        if (error) throw error;
    };
    const pct = (base: number, percent: number) => Number((base - Number((base * percent / 100).toFixed(2))).toFixed(2));

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        await cleanupTestOrders(admin);
        // Leftovers from an interrupted run would skew the pricing assertions.
        ids.push(...(await list()).map((p) => p.id));
        await removeAll();
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data } = await admin.from('products').select('discount_percentage').eq('id', product.id).single();
        originalDiscount = data!.discount_percentage;
        await setDiscount(null);
        shown = await publicProduct();
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        // Test Orders are gone now, so Promotions that priced them can be deleted too.
        ids.push(...(await list()).map((p) => p.id));
        await removeAll();
        for (const id of couponIds) await rpc(admin, 'admin_delete_coupon', { p_id: id });
        await setDiscount(originalDiscount);
        await product?.release();
    });

    it('only admins write Promotions, the table takes no direct writes, and invalid input is refused', async () => {
        expect((await save(customer, {})).error?.message).toMatch(/Administrator/);
        expect((await save(anon, {})).error).not.toBeNull();
        const direct = await customer.from('promotions').insert({ title: 'x', discount_type: 'fixed', discount_value: 1 } as never);
        expect(direct.error).not.toBeNull();
        expect((await save(admin, { p_title: ' ' })).error?.message).toMatch(/title/);
        expect((await save(admin, { p_discount_value: 0 })).error?.message).toMatch(/value/);
        expect((await save(admin, { p_discount_value: 101 })).error?.message).toMatch(/value/);
        expect((await save(admin, { p_target_kind: 'shade' })).error?.message).toMatch(/target/);
        expect((await save(admin, { p_target_kind: 'category' })).error?.message).toMatch(/target value/);
        expect((await save(admin, { p_target_kind: 'products' })).error?.message).toMatch(/product/);
        expect((await save(admin, { p_target_kind: 'products', p_target_product_ids: [randomUUID()] })).error?.message).toMatch(/not found/);
        const now = new Date().toISOString();
        expect((await save(admin, { p_start_date: now, p_end_date: now })).error?.message).toMatch(/window/);
        expect(await list()).toHaveLength(0);
    });

    it('a Promotion on all Products prices the catalogue and is labelled with its title', async () => {
        await add({ p_discount_value: 20, p_title: `${TEST_TAG} fifth` });
        const p = await publicProduct();
        expect(Number(p.effective_price)).toBe(pct(Number(shown.price), 20));
        expect(p.pricing_rule_kind).toBe('promotion');
        expect(p.pricing_rule_label).toBe(`${TEST_TAG} fifth`);
        expect((await list())[0].status).toBe('active');
        await removeAll();
    });

    it('a Category or Brand Promotion applies only to matching Products', async () => {
        await add({ p_target_kind: 'category', p_target_value: shown.category, p_discount_value: 10 });
        expect(Number((await publicProduct()).effective_price)).toBe(pct(Number(shown.price), 10));
        await removeAll();
        await add({ p_target_kind: 'category', p_target_value: `${TEST_TAG} no such category`, p_discount_value: 10 });
        expect(Number((await publicProduct()).effective_price)).toBe(Number(shown.price));
        await removeAll();
        await add({ p_target_kind: 'brand', p_target_value: shown.brand, p_discount_type: 'fixed', p_discount_value: 500 });
        expect(Number((await publicProduct()).effective_price)).toBe(Number(shown.price) - 500);
        await removeAll();
        await add({ p_target_kind: 'brand', p_target_value: `${TEST_TAG} no such brand`, p_discount_value: 10 });
        expect(Number((await publicProduct()).effective_price)).toBe(Number(shown.price));
        await removeAll();
    });

    it('a chosen-Products Promotion applies to the listed Products only', async () => {
        const { data: catalogue } = await customer.rpc('get_public_products');
        const other = (catalogue as unknown as PublicProduct[]).find((p) => p.id !== product.id)!;
        await add({ p_target_kind: 'products', p_target_product_ids: [product.id], p_discount_value: 15 });
        expect(Number((await publicProduct()).effective_price)).toBe(pct(Number(shown.price), 15));
        const { data: list2 } = await customer.rpc('get_public_products');
        const otherNow = (list2 as unknown as PublicProduct[]).find((p) => p.id === other.id)!;
        expect(Number(otherNow.effective_price)).toBe(Number(other.effective_price));
        expect(otherNow.pricing_rule_label).toBe(other.pricing_rule_label);
        await removeAll();
    });

    it('the state is derived from the schedule: scheduled and expired Promotions do not price', async () => {
        const future = new Date(Date.now() + 86_400_000).toISOString();
        const past = new Date(Date.now() - 86_400_000).toISOString();
        const scheduled = await add({ p_discount_value: 50, p_start_date: future, p_title: `${TEST_TAG} later` });
        const expired = await add({ p_discount_value: 50, p_start_date: new Date(Date.now() - 2 * 86_400_000).toISOString(), p_end_date: past, p_title: `${TEST_TAG} over` });
        const rows = await list();
        expect(rows.find((r) => r.id === scheduled)?.status).toBe('scheduled');
        expect(rows.find((r) => r.id === expired)?.status).toBe('expired');
        expect(Number((await publicProduct()).effective_price)).toBe(Number(shown.price));
        await removeAll();
    });

    it('"end now" closes an active Promotion and cancels a scheduled one', async () => {
        const active = await add({ p_discount_value: 30 });
        expect(Number((await publicProduct()).effective_price)).toBe(pct(Number(shown.price), 30));
        const { error } = await rpc(admin, 'admin_end_promotion', { p_id: active });
        expect(error).toBeNull();
        expect(Number((await publicProduct()).effective_price)).toBe(Number(shown.price));
        expect((await list()).find((r) => r.id === active)?.status).toBe('expired');
        expect((await rpc(admin, 'admin_end_promotion', { p_id: active })).error?.message).toMatch(/already ended/);

        const scheduled = await add({ p_discount_value: 30, p_start_date: new Date(Date.now() + 86_400_000).toISOString() });
        expect((await rpc(admin, 'admin_end_promotion', { p_id: scheduled })).error).toBeNull();
        expect((await list()).find((r) => r.id === scheduled)?.status).toBe('expired');
        expect((await rpc(customer, 'admin_end_promotion', { p_id: scheduled })).error?.message).toMatch(/Administrator/);
        await removeAll();
    });

    it('Discount and Promotion never stack: the larger wins, a tie goes to the Discount', async () => {
        await setDiscount(10);
        await add({ p_discount_value: 25, p_title: `${TEST_TAG} quarter` });
        let p = await publicProduct();
        expect(Number(p.effective_price)).toBe(pct(Number(shown.price), 25));
        expect(p.pricing_rule_kind).toBe('promotion');
        await setDiscount(40);
        p = await publicProduct();
        expect(Number(p.effective_price)).toBe(pct(Number(shown.price), 40));
        expect(p.pricing_rule_kind).toBe('discount');
        await setDiscount(25);
        p = await publicProduct();
        expect(p.pricing_rule_kind).toBe('discount');
        await setDiscount(null);
        await removeAll();
    });

    it('checkout charges the promoted price and records the Promotion on the line; the Promotion then cannot be deleted', async () => {
        const id = await add({ p_discount_value: 20, p_title: `${TEST_TAG} charged` });
        const p = await publicProduct();
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()));
        expect(created.error).toBeNull();
        const order = (created.data as { order_id: string; total: number }[])[0];
        expect(Number(order.total)).toBe(Number((Number(p.effective_price) * 2 + zone.fee).toFixed(2)));
        const { data: row } = await admin.from('orders').select('items').eq('id', order.order_id).single();
        const line = (row!.items as { promotion_id: string | null; pricing_rule_label: string; effective_unit_price: number }[])[0];
        expect(line.promotion_id).toBe(id);
        expect(line.pricing_rule_label).toBe(`${TEST_TAG} charged`);
        expect(Number(line.effective_unit_price)).toBe(Number(p.effective_price));
        expect((await rpc(admin, 'admin_delete_promotion', { p_id: id })).error?.message).toMatch(/priced orders/);
        await removeAll();
    });

    it('a Coupon competes with the Promotion: the larger single reduction wins, nothing stacks', async () => {
        await add({ p_discount_value: 20, p_title: `${TEST_TAG} versus` });
        const p = await publicProduct();
        const promoted = Number(p.effective_price);
        const stamp = Date.now().toString(36).toUpperCase();
        const smallCode = `TP-${stamp}-S`;
        const bigCode = `TP-${stamp}-B`;
        for (const [code, value] of [[smallCode, 10], [bigCode, Number(shown.price)]] as const) {
            const { data, error } = await rpc(admin, 'admin_save_coupon', { p_code: code, p_name: `${TEST_TAG} coupon`, p_discount_type: 'fixed', p_discount_value: value, p_per_user_limit: 5 });
            if (error) throw error;
            couponIds.push(data as unknown as string);
        }
        const small = await rpc(customer, 'preview_coupon', { p_code: smallCode, p_items: [{ id: product.id, quantity: 1 }] });
        expect((small.data as unknown as { reason: string | null }[])[0].reason).toBe('not_best');
        const refused = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_coupon_code: smallCode });
        expect(refused.error?.message).toMatch(/not_best/);

        const created = await rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, [{ id: product.id, quantity: 1 }], randomUUID()), p_coupon_code: bigCode });
        expect(created.error).toBeNull();
        const order = (created.data as { order_id: string; total: number; discount_amount: number }[])[0];
        expect(Number(order.discount_amount)).toBe(Number(shown.price));
        expect(Number(order.total)).toBe(zone.fee);
        const { data: row } = await admin.from('orders').select('items').eq('id', order.order_id).single();
        const line = (row!.items as { promotion_id: string | null; effective_unit_price: number }[])[0];
        expect(line.promotion_id).toBeNull();
        expect(Number(line.effective_unit_price)).toBe(Number(shown.price));
        expect(promoted).toBeLessThan(Number(shown.price));
        await removeAll();
    });
});
