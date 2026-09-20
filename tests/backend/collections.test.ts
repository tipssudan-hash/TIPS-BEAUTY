import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, anonClient, creds, haveCreds, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Collections (T2-06): staff write through the admin RPCs, the Storefront reads through
// get_storefront_collections, and only sellable Products ever come back.

const suite = haveCreds ? describe : describe.skip;

type PublicCollection = { id: string; slug: string; product_ids: string[] };
type AdminCollection = PublicCollection & { rule_type: string; is_active: boolean };

suite('collections over the backend RPCs', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; release: () => Promise<void> };
    const slug = `test-automated-${randomUUID().slice(0, 8)}`;
    const created: string[] = [];

    const save = (client: Client, args: Record<string, unknown>) =>
        rpc(client, 'admin_save_collection', {
            p_id: null, p_slug: slug, p_name_ar: `${TEST_TAG} تشكيلة`, p_description_ar: null, p_icon: 'auto-awesome',
            p_rule_type: 'manual', p_rule_config: {}, p_display_order: 999, p_is_active: true, ...args,
        });
    const publicCollections = async (client: Client) => {
        const { data, error } = await client.rpc('get_storefront_collections');
        if (error) throw error;
        return data as PublicCollection[];
    };
    const adminCollections = async () => {
        const { data, error } = await rpc(admin, 'admin_get_collections');
        if (error) throw error;
        return data as AdminCollection[];
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        product = await provisionProduct(admin);
    });

    afterAll(async () => {
        if (!admin) return;
        for (const id of created) await rpc(admin, 'admin_delete_collection', { p_id: id });
        await product?.release();
    });

    it('customers and anonymous visitors cannot use the admin RPCs', async () => {
        const asCustomer = await save(customer, {});
        expect(asCustomer.error?.message ?? '').toMatch(/administrator/i);
        const asAnon = await rpc(anon, 'admin_get_collections');
        expect(asAnon.error).toBeTruthy();
    });

    it('a hand-picked collection shows its sellable products in order, and hides a deactivated one', async () => {
        const saved = await save(admin, {});
        expect(saved.error).toBeNull();
        const id = saved.data as unknown as string;
        created.push(id);

        const members = await rpc(admin, 'admin_set_collection_products', { p_collection_id: id, p_product_ids: [product.id] });
        expect(members.error).toBeNull();

        const mine = (await publicCollections(anon)).find((c) => c.id === id);
        expect(mine?.product_ids).toEqual([product.id]);
        expect((await adminCollections()).find((c) => c.id === id)?.product_ids).toEqual([product.id]);

        await admin.from('products').update({ is_active: false }).eq('id', product.id);
        try {
            const hidden = (await publicCollections(customer)).find((c) => c.id === id);
            expect(hidden?.product_ids).toEqual([]);
        } finally {
            await admin.from('products').update({ is_active: true }).eq('id', product.id);
        }
    });

    it('setting members is all-or-nothing: an unknown product leaves the row untouched', async () => {
        const id = created[0];
        const bad = await rpc(admin, 'admin_set_collection_products', { p_collection_id: id, p_product_ids: [randomUUID(), product.id] });
        expect(bad.error?.message ?? '').toMatch(/product not found/i);
        expect((await adminCollections()).find((c) => c.id === id)?.product_ids).toEqual([product.id]);
    });

    it('a hidden collection disappears from the storefront but stays in the admin list', async () => {
        const id = created[0];
        const hide = await save(admin, { p_id: id, p_is_active: false });
        expect(hide.error).toBeNull();
        expect((await publicCollections(anon)).some((c) => c.id === id)).toBe(false);
        expect((await adminCollections()).find((c) => c.id === id)?.is_active).toBe(false);
    });

    it('a rule-based collection maintains itself, honours its limit and validates its config', async () => {
        const noPrice = await save(admin, { p_slug: `${slug}-rule`, p_rule_type: 'price_under', p_rule_config: {} });
        expect(noPrice.error?.message ?? '').toMatch(/price ceiling/i);

        const saved = await save(admin, { p_slug: `${slug}-rule`, p_rule_type: 'newest', p_rule_config: { limit: 1 } });
        expect(saved.error).toBeNull();
        const id = saved.data as unknown as string;
        created.push(id);
        const mine = (await publicCollections(anon)).find((c) => c.id === id);
        expect(mine?.product_ids).toHaveLength(1);

        // Switching a hand-picked collection to a rule drops its members.
        const switched = await save(admin, { p_id: created[0], p_rule_type: 'discount', p_rule_config: { minimum_discount: 1, limit: 3 } });
        expect(switched.error).toBeNull();
        const row = (await adminCollections()).find((c) => c.id === created[0]);
        expect(row?.rule_type).toBe('discount');
        expect(row?.product_ids).toEqual([]);
    });
});
