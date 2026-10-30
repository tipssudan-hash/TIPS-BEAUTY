import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Preview = charge (plan §7.8): preview_cart_pricing states the goods total that checkout will charge, and
// both checkout RPCs (checkout_order_safe for the web, checkout_order_with_growth for mobile) price the Cart
// through the same price_cart_lines, so the three must agree for the same Cart.

const suite = haveCreds ? describe : describe.skip;

type Preview = { subtotal: number; coupon: { code: string | null; reduction: number; reason: string | null } | null };
type Placed = { order_id: string; total: number; shipping_fee: number };

suite('cart preview equals what checkout charges for the goods', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let basePrice: number;
    let originalDiscount: number | null;
    const promotionIds: string[] = [];
    const couponIds: string[] = [];
    const stamp = Date.now().toString(36).toUpperCase();

    const preview = async (items: { id: string; quantity: number }[], coupon: string | null = null): Promise<Preview> => {
        const { data, error } = await rpc(customer, 'preview_cart_pricing', { p_items: items, p_coupon_code: coupon });
        if (error) throw error;
        return data as unknown as Preview;
    };
    // Goods only: the Order total less the delivery fee the same RPC charged.
    const goodsCharged = async (fn: 'checkout_order_safe' | 'checkout_order_with_growth', items: { id: string; quantity: number }[], coupon: string | null) => {
        const { data, error } = await rpc(customer, fn, { ...checkoutArgs(zone, items, randomUUID()), p_coupon_code: coupon });
        if (error) throw error;
        const placed = (data as unknown as Placed[])[0];
        return Number((Number(placed.total) - Number(placed.shipping_fee)).toFixed(2));
    };
    const addPromotion = async (args: Record<string, unknown>) => {
        const { data, error } = await rpc(admin, 'admin_save_promotion', { p_title: `${TEST_TAG} parity`, p_discount_type: null, p_discount_value: null, p_target_kind: 'products', p_target_product_ids: [product.id], ...args });
        if (error) throw error;
        promotionIds.push(data as unknown as string);
    };
    const removePromotions = async () => {
        for (const id of promotionIds.splice(0)) {
            const { error } = await rpc(admin, 'admin_delete_promotion', { p_id: id });
            if (error) await rpc(admin, 'admin_end_promotion', { p_id: id });
        }
    };
    const assertParity = async (items: { id: string; quantity: number }[], coupon: string | null) => {
        const quoted = await preview(items, coupon);
        const direct = await goodsCharged('checkout_order_safe', items, coupon);
        const growth = await goodsCharged('checkout_order_with_growth', items, coupon);
        expect(direct).toBe(Number(Number(quoted.subtotal).toFixed(2)));
        expect(growth).toBe(Number(Number(quoted.subtotal).toFixed(2)));
        return quoted;
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data } = await admin.from('products').select('price,discount_percentage').eq('id', product.id).single();
        basePrice = Number(data!.price);
        originalDiscount = data!.discount_percentage;
        await admin.from('products').update({ discount_percentage: null }).eq('id', product.id);
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        for (const id of couponIds) await rpc(admin, 'admin_delete_coupon', { p_id: id });
        await removePromotions();
        await admin.from('products').update({ discount_percentage: originalDiscount }).eq('id', product.id);
        await product?.release();
    });

    it('a plain Cart: the preview is the goods total both checkout RPCs charge', async () => {
        const quoted = await assertParity([{ id: product.id, quantity: 2 }], null);
        expect(Number(quoted.subtotal).toFixed(2)).toBe((basePrice * 2).toFixed(2));
        expect(quoted.coupon).toBeNull();
    });

    it('a Cart under a quantity tier: the preview carries the Promotion and the charge matches it', async () => {
        await addPromotion({ p_promotion_type: 'quantity_tier', p_tiers: [{ min_quantity: 2, percent: 25 }], p_title: `${TEST_TAG} parity tier` });
        const quoted = await assertParity([{ id: product.id, quantity: 3 }], null);
        const expected = Number((basePrice * 3 - Number((basePrice * 3 * 0.25).toFixed(2))).toFixed(2));
        expect(Number(quoted.subtotal).toFixed(2)).toBe(expected.toFixed(2));
        await removePromotions();
    });

    it('a winning Coupon over a cart Promotion: the preview and both charges use the Coupon, not the Promotion', async () => {
        await addPromotion({ p_promotion_type: 'quantity_tier', p_tiers: [{ min_quantity: 2, percent: 25 }], p_title: `${TEST_TAG} parity beaten` });
        const code = `TP-${stamp}-PAR`;
        const coupon = Math.ceil(basePrice * 1.5);
        const { data, error } = await rpc(admin, 'admin_save_coupon', { p_code: code, p_name: `${TEST_TAG} parity coupon`, p_discount_type: 'fixed', p_discount_value: coupon, p_per_user_limit: 5 });
        if (error) throw error;
        couponIds.push(data as unknown as string);
        const quoted = await assertParity([{ id: product.id, quantity: 3 }], code);
        expect(quoted.coupon).toMatchObject({ code, reduction: coupon, reason: null });
        expect(Number(quoted.subtotal).toFixed(2)).toBe((basePrice * 3 - coupon).toFixed(2));
        await removePromotions();
    });
});
