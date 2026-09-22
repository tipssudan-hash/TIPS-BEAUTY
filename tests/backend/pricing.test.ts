import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Pricing Rule (T2-07): one backend function decides a Product's effective price from its
// Discount and the active Promotions; the largest single reduction wins, nothing stacks, and
// checkout charges exactly what the public catalogue showed.

const suite = haveCreds ? describe : describe.skip;

type PublicProduct = { id: string; price: number; discount_percentage: number | null; effective_price: number; pricing_rule_kind: string | null; pricing_rule_label: string | null };

suite('effective price over the backend', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let originalDiscount: number | null;
    let basePrice: number;
    const promotionIds: string[] = [];

    const publicProduct = async () => {
        const { data, error } = await customer.rpc('get_public_product', { p_product_id: product.id });
        if (error) throw error;
        return (data as unknown as PublicProduct[])[0];
    };
    const setDiscount = async (pct: number | null) => {
        const { error } = await admin.from('products').update({ discount_percentage: pct }).eq('id', product.id);
        if (error) throw error;
    };
    // Promotions are written through the admin RPC (T2-10); a test Promotion that priced an Order
    // cannot be deleted, so it is ended instead.
    const removePromotion = async (id: string) => {
        const { error } = await rpc(admin, 'admin_delete_promotion', { p_id: id });
        if (error) await rpc(admin, 'admin_end_promotion', { p_id: id });
    };
    const clearPromotions = async () => {
        for (const id of promotionIds.splice(0)) await removePromotion(id);
    };
    const addPromotion = async (args: Record<string, unknown>) => {
        const { data, error } = await rpc(admin, 'admin_save_promotion', { p_title: `${TEST_TAG} promotion`, p_discount_type: 'percentage', p_discount_value: 20, p_target_kind: 'all', ...args });
        if (error) throw error;
        promotionIds.push(data as unknown as string);
        return data as unknown as string;
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data } = await admin.from('products').select('price,discount_percentage').eq('id', product.id).single();
        originalDiscount = data!.discount_percentage;
        basePrice = Number(data!.price);
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        await clearPromotions();
        await setDiscount(originalDiscount);
        await product?.release();
    });

    it('with no rule the effective price is the price', async () => {
        await setDiscount(null);
        const p = await publicProduct();
        expect(Number(p.effective_price)).toBe(basePrice);
        expect(p.pricing_rule_kind).toBeNull();
    });

    it('a Discount reduces the price and is labelled', async () => {
        await setDiscount(10);
        let p = await publicProduct();
        expect(Number(p.effective_price)).toBe(Number((basePrice * 0.9).toFixed(2)));
        expect(p.pricing_rule_kind).toBe('discount');
        expect(p.pricing_rule_label).toBe('خصم 10%');
        await setDiscount(12.5);
        p = await publicProduct();
        expect(p.pricing_rule_label).toBe('خصم 12.5%');
    });

    it('a tie between Discount and Promotion goes to the Discount', async () => {
        await setDiscount(10);
        await clearPromotions();
        await addPromotion({ p_discount_value: 10, p_title: `${TEST_TAG} tie` });
        const p = await publicProduct();
        expect(p.pricing_rule_kind).toBe('discount');
        expect(Number(p.effective_price)).toBe(Number((basePrice * 0.9).toFixed(2)));
    });

    it('the larger of Discount and Promotion wins; they never stack', async () => {
        await setDiscount(10);
        const bigger = await addPromotion({ p_discount_value: 20, p_title: `${TEST_TAG} big` });
        let p = await publicProduct();
        expect(Number(p.effective_price)).toBe(Number((basePrice * 0.8).toFixed(2)));
        expect(p.pricing_rule_kind).toBe('promotion');
        expect(p.pricing_rule_label).toBe(`${TEST_TAG} big`);

        await removePromotion(bigger);
        promotionIds.splice(promotionIds.indexOf(bigger), 1);
        await addPromotion({ p_discount_type: 'fixed', p_discount_value: 1, p_title: `${TEST_TAG} tiny` });
        p = await publicProduct();
        expect(p.pricing_rule_kind).toBe('discount');
        expect(Number(p.effective_price)).toBe(Number((basePrice * 0.9).toFixed(2)));
    });

    it('scheduled, expired and ended Promotions do not apply', async () => {
        await setDiscount(null);
        await clearPromotions();
        const future = new Date(Date.now() + 86_400_000).toISOString();
        const past = new Date(Date.now() - 86_400_000).toISOString();
        await addPromotion({ p_discount_value: 50, p_start_date: future });
        const ended = await addPromotion({ p_discount_value: 50, p_start_date: past });
        const { error } = await rpc(admin, 'admin_end_promotion', { p_id: ended });
        if (error) throw error;
        const p = await publicProduct();
        expect(Number(p.effective_price)).toBe(basePrice);
        expect(p.pricing_rule_kind).toBeNull();
    });

    it('checkout charges the effective price the catalogue showed and records the rule on the line', async () => {
        await setDiscount(null);
        await clearPromotions();
        await addPromotion({ p_discount_value: 25, p_title: `${TEST_TAG} quarter` });
        const shown = await publicProduct();
        const { data: list } = await customer.rpc('get_public_products');
        expect(Number((list as unknown as PublicProduct[]).find((x) => x.id === product.id)?.effective_price)).toBe(Number(shown.effective_price));
        const created = await rpc(customer, 'checkout_order_safe', checkoutArgs(zone, [{ id: product.id, quantity: 2 }], randomUUID()));
        expect(created.error).toBeNull();
        const order = (created.data as { order_id: string; total: number }[])[0];
        expect(Number(order.total)).toBe(Number((Number(shown.effective_price) * 2 + zone.fee).toFixed(2)));
        const { data: row } = await admin.from('orders').select('items').eq('id', order.order_id).single();
        const line = (row!.items as { effective_unit_price: number; pricing_rule_kind: string; pricing_rule_label: string; promotion_id: string | null; line_total: number }[])[0];
        expect(Number(line.effective_unit_price)).toBe(Number(shown.effective_price));
        expect(line.pricing_rule_kind).toBe('promotion');
        expect(line.pricing_rule_label).toBe(`${TEST_TAG} quarter`);
        expect(line.promotion_id).toBe(promotionIds[0]);
        expect(Number(line.line_total)).toBe(Number((Number(shown.effective_price) * 2).toFixed(2)));
    });
});
