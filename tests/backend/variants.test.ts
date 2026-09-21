import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, checkoutArgs, cleanupTestOrders, creds, haveCreds, pickZone, provisionProduct, publicStock, rpc, signedInClient, type Client } from './helpers';

// Variant-aware checkout (T2-09): a Variant lives on products.variants, is priced by the catalogue
// through effective_price, is validated against its Product at checkout, snapshotted into the Order
// line, and never has its own Stock (ADR 0001).

const suite = haveCreds ? describe : describe.skip;

type PublicVariant = { id: string; name_ar: string; price: number | null; effective_price: number; pricing_rule_kind: string | null; pricing_rule_label: string | null };
type PublicProduct = { id: string; price: number; effective_price: number; variants: PublicVariant[] };
type OrderLine = { id: string; variant_id: string | null; variant_name: string | null; quantity: number; unit_price: number; effective_unit_price: number; line_total: number };

suite('variants over the backend RPCs', () => {
    let customer: Client;
    let admin: Client;
    let product: { id: string; release: () => Promise<void> };
    let zone: { name: string; state: string | null; fee: number };
    let basePrice: number;
    let originalVariants: unknown;
    let originalDiscount: number | null;
    const rose = { id: randomUUID(), name_ar: `${TEST_TAG} روز`, name_en: 'Rose', price: null as number | null };
    const nude = { id: randomUUID(), name_ar: `${TEST_TAG} نيود`, name_en: 'Nude', price: 0 };

    const setVariants = async (variants: unknown) => {
        const { error } = await admin.from('products').update({ variants: variants as never }).eq('id', product.id);
        return error;
    };
    const setDiscount = async (pct: number | null) => {
        const { error } = await admin.from('products').update({ discount_percentage: pct }).eq('id', product.id);
        if (error) throw error;
    };
    const publicProduct = async () => {
        const { data, error } = await customer.rpc('get_public_product', { p_product_id: product.id });
        if (error) throw error;
        return (data as unknown as PublicProduct[])[0];
    };
    const checkout = (items: { id: string; quantity: number; variant_id?: string | null }[], extra: Record<string, unknown> = {}) =>
        rpc(customer, 'checkout_order_safe', { ...checkoutArgs(zone, items, randomUUID()), ...extra });
    const orderLines = async (orderId: string) => {
        const { data, error } = await admin.from('orders').select('items').eq('id', orderId).single();
        if (error) throw error;
        return data.items as unknown as OrderLine[];
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        await cleanupTestOrders(admin);
        product = await provisionProduct(admin);
        zone = await pickZone(customer);
        const { data } = await admin.from('products').select('price,variants,discount_percentage').eq('id', product.id).single();
        basePrice = Number(data!.price);
        originalVariants = data!.variants;
        originalDiscount = data!.discount_percentage;
        nude.price = Number((basePrice + 500).toFixed(2));
        await setDiscount(null);
        const error = await setVariants([rose, nude]);
        if (error) throw error;
    });

    afterAll(async () => {
        if (!admin) return;
        await cleanupTestOrders(admin);
        await setVariants(originalVariants);
        await setDiscount(originalDiscount);
        await product?.release();
    });

    it('the table refuses malformed Variants', async () => {
        for (const bad of [[{ name_ar: 'no id' }], [{ id: 'x', name_ar: '' }], [{ id: 'x', name_ar: 'a', price: '5' }], [{ id: 'x', name_ar: 'a', price: -1 }], [{ id: 'x', name_ar: 'a' }, { id: 'x', name_ar: 'b' }]]) {
            const error = await setVariants(bad);
            expect(error?.message ?? '').toContain('products_variants_shape');
        }
    });

    it('the catalogue prices each Variant: its own price, or the Product price, through the Pricing Rule', async () => {
        let p = await publicProduct();
        const byId = new Map(p.variants.map((v) => [v.id, v]));
        expect(byId.get(rose.id)?.name_ar).toBe(rose.name_ar);
        expect(Number(byId.get(rose.id)?.effective_price)).toBe(basePrice);
        expect(Number(byId.get(nude.id)?.effective_price)).toBe(nude.price);

        await setDiscount(10);
        p = await publicProduct();
        const nudeShown = p.variants.find((v) => v.id === nude.id)!;
        expect(Number(nudeShown.effective_price)).toBe(Number((nude.price * 0.9).toFixed(2)));
        expect(nudeShown.pricing_rule_kind).toBe('discount');
        await setDiscount(null);
    });

    it('checkout charges the Variant price and snapshots the Variant id and name', async () => {
        const shown = (await publicProduct()).variants.find((v) => v.id === nude.id)!;
        const created = await checkout([{ id: product.id, variant_id: nude.id, quantity: 2 }]);
        expect(created.error).toBeNull();
        const order = (created.data as { order_id: string; total: number }[])[0];
        expect(Number(order.total)).toBe(Number((Number(shown.effective_price) * 2 + zone.fee).toFixed(2)));
        const [line] = await orderLines(order.order_id);
        expect(line.variant_id).toBe(nude.id);
        expect(line.variant_name).toBe(nude.name_ar);
        expect(Number(line.unit_price)).toBe(nude.price);
        expect(Number(line.effective_unit_price)).toBe(Number(shown.effective_price));
        expect(Number(line.line_total)).toBe(Number((Number(shown.effective_price) * 2).toFixed(2)));
    });

    it('a Variant without a price is charged at the Product price', async () => {
        const created = await checkout([{ id: product.id, variant_id: rose.id, quantity: 1 }]);
        expect(created.error).toBeNull();
        const [line] = await orderLines((created.data as { order_id: string }[])[0].order_id);
        expect(line.variant_id).toBe(rose.id);
        expect(Number(line.unit_price)).toBe(basePrice);
    });

    it('a Variant of another Product (or none) is refused', async () => {
        const stranger = await checkout([{ id: product.id, variant_id: randomUUID(), quantity: 1 }]);
        expect(stranger.error?.message).toContain('Variant not found');
    });

    it('two Variants of one Product are two lines drawing on one Stock', async () => {
        const before = await publicStock(customer, product.id);
        const created = await checkout([
            { id: product.id, variant_id: rose.id, quantity: 1 },
            { id: product.id, variant_id: nude.id, quantity: 2 },
            { id: product.id, variant_id: rose.id, quantity: 1 },
        ]);
        expect(created.error).toBeNull();
        const lines = await orderLines((created.data as { order_id: string }[])[0].order_id);
        expect(lines).toHaveLength(2);
        expect(lines.map((l) => [l.variant_id, l.quantity]).sort()).toEqual([[nude.id, 2], [rose.id, 2]].sort());
        expect(await publicStock(customer, product.id)).toBe(before - 4);
    });

    it('editing the Variant later does not rewrite the Order line', async () => {
        const created = await checkout([{ id: product.id, variant_id: nude.id, quantity: 1 }]);
        expect(created.error).toBeNull();
        const orderId = (created.data as { order_id: string }[])[0].order_id;
        const error = await setVariants([rose, { ...nude, name_ar: `${TEST_TAG} renamed`, price: nude.price + 1000 }]);
        expect(error).toBeNull();
        const [line] = await orderLines(orderId);
        expect(line.variant_name).toBe(nude.name_ar);
        expect(Number(line.unit_price)).toBe(nude.price);
        await setVariants([rose, nude]);
    });

    it('the Coupon preview prices the Cart from the Variant', async () => {
        const preview = await rpc(customer, 'preview_coupon', { p_code: 'NO-SUCH-CODE', p_items: [{ id: product.id, variant_id: nude.id, quantity: 1 }] });
        expect(preview.error).toBeNull();
        expect(Number((preview.data as unknown as { base_subtotal: number }[])[0].base_subtotal)).toBe(nude.price);
    });
});
