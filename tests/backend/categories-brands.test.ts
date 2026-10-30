import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { TEST_TAG, anonClient, creds, haveCreds, loose, provisionProduct, rpc, signedInClient, type Client } from './helpers';

// Categories and brands (Phase 2): staff write through the admin RPCs, everyone reads the active rows,
// no one writes the tables directly, and the text columns old clients read follow the ids.

const suite = haveCreds ? describe : describe.skip;

type ProductTaxonomy = { category: string | null; category_id: string | null; brand: string | null; brand_id: string | null };
type PublicCategory = { id: string; parent_id: string | null; product_count: number };
type PublicBrand = { id: string; product_count: number };
type AdminCategory = { id: string; parent_id: string | null; name_ar: string; is_active: boolean };
type AdminBrand = { id: string; name_ar: string };

suite('categories and brands over the backend RPCs', () => {
    let customer: Client;
    let admin: Client;
    let anon: Client;
    let product: { id: string; release: () => Promise<void> };
    let original: { category_id: string | null; brand_id: string | null };
    const stamp = randomUUID().slice(0, 8);
    const categoryIds: string[] = [];
    const brandIds: string[] = [];
    const bannerIds: string[] = [];
    const collectionIds: string[] = [];
    const promotionIds: string[] = [];

    const readProduct = async (): Promise<ProductTaxonomy & { id: string }> => {
        const { data, error } = await loose(admin).from('products').select('id,category,category_id,brand,brand_id').eq('id', product.id).single();
        if (error) throw new Error(error.message);
        return data as unknown as ProductTaxonomy & { id: string };
    };
    const setProduct = async (values: Record<string, unknown>) => {
        const { error } = await loose(admin).from('products').update(values).eq('id', product.id);
        if (error) throw new Error(error.message);
    };
    const newCategory = async (name: string, parentId: string | null = null) => {
        const { data, error } = await rpc(admin, 'admin_save_category', { p_name_ar: name, p_parent_id: parentId });
        if (error) throw new Error(error.message);
        categoryIds.push(data as unknown as string);
        return data as unknown as string;
    };
    const newBrand = async (name: string) => {
        const { data, error } = await rpc(admin, 'admin_save_brand', { p_name_ar: name });
        if (error) throw new Error(error.message);
        brandIds.push(data as unknown as string);
        return data as unknown as string;
    };
    const adminCategories = async () => {
        const { data, error } = await rpc(admin, 'admin_get_categories');
        if (error) throw error;
        return data as unknown as AdminCategory[];
    };
    const publicCategories = async (client: Client) => {
        const { data, error } = await client.rpc('get_public_categories');
        if (error) throw error;
        return data as unknown as PublicCategory[];
    };
    const publicBrands = async (client: Client) => {
        const { data, error } = await client.rpc('get_public_brands');
        if (error) throw error;
        return data as unknown as PublicBrand[];
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        product = await provisionProduct(admin);
        original = await readProduct();
    });

    afterAll(async () => {
        if (!admin || !product) return;
        await setProduct({ category_id: original.category_id, brand_id: original.brand_id });
        for (const id of bannerIds) await loose(admin).from('storefront_banners').delete().eq('id', id);
        for (const id of collectionIds) await rpc(admin, 'admin_delete_collection', { p_id: id });
        for (const id of promotionIds) await rpc(admin, 'admin_delete_promotion', { p_id: id });
        for (const id of [...categoryIds].reverse()) await rpc(admin, 'admin_delete_category', { p_id: id });
        for (const id of brandIds) await rpc(admin, 'admin_delete_brand', { p_id: id });
        await product.release();
    });

    it('only admins write, and the tables take no direct writes', async () => {
        const name = `${TEST_TAG} ${stamp} denied`;
        const asCustomer = await rpc(customer, 'admin_save_category', { p_name_ar: name });
        expect(asCustomer.error?.message ?? '').toMatch(/administrator/i);
        const asAnon = await rpc(anon, 'admin_save_brand', { p_name_ar: name });
        expect(asAnon.error).toBeTruthy();
        const directCategory = await loose(customer).from('categories').insert({ name_ar: name });
        expect(directCategory.error).toBeTruthy();
        const directBrand = await loose(anon).from('brands').insert({ name_ar: name });
        expect(directBrand.error).toBeTruthy();
        const customerRead = await rpc(customer, 'admin_get_categories');
        expect(customerRead.data).toEqual([]);
    });

    it('refuses a third level and a parent that already has a parent', async () => {
        const root = await newCategory(`${TEST_TAG} ${stamp} root`);
        const child = await newCategory(`${TEST_TAG} ${stamp} child`, root);
        const grandchild = await rpc(admin, 'admin_save_category', { p_name_ar: `${TEST_TAG} ${stamp} grandchild`, p_parent_id: child });
        expect(grandchild.error?.message ?? '').toMatch(/two levels/i);

        const other = await newCategory(`${TEST_TAG} ${stamp} other root`);
        const moved = await rpc(admin, 'admin_save_category', { p_id: root, p_name_ar: `${TEST_TAG} ${stamp} root`, p_parent_id: other });
        expect(moved.error?.message ?? '').toMatch(/two levels/i);

        const selfParent = await rpc(admin, 'admin_save_category', { p_id: other, p_name_ar: `${TEST_TAG} ${stamp} other root`, p_parent_id: other });
        expect(selfParent.error?.message ?? '').toMatch(/own parent/i);
    });

    it('setting category_id fills products.category, and setting brand_id fills products.brand', async () => {
        const cat = await newCategory(`${TEST_TAG} ${stamp} shelf`);
        const brand = await newBrand(`${TEST_TAG} ${stamp} Maison`);
        await setProduct({ category_id: cat, brand_id: brand });
        const row = await readProduct();
        expect(row.category_id).toBe(cat);
        expect(row.category).toBe(`${TEST_TAG} ${stamp} shelf`);
        expect(row.brand_id).toBe(brand);
        expect(row.brand).toBe(`${TEST_TAG} ${stamp} Maison`);
    });

    it('setting only the text resolves the id by name, ignoring case and spaces, and creates an unknown name as an active root', async () => {
        const brand = brandIds[0];
        await setProduct({ brand: `  ${TEST_TAG.toLowerCase()} ${stamp} maison  ` });
        const byName = await readProduct();
        expect(byName.brand_id).toBe(brand);
        expect(byName.brand).toBe(`${TEST_TAG} ${stamp} Maison`);

        const fresh = `${TEST_TAG} ${stamp} new from text`;
        await setProduct({ category: `  ${fresh}  ` });
        const created = await readProduct();
        expect(created.category).toBe(fresh);
        expect(created.category_id).not.toBeNull();
        const row = (await adminCategories()).find((c) => c.id === created.category_id);
        expect(row?.name_ar).toBe(fresh);
        expect(row?.parent_id).toBeNull();
        expect(row?.is_active).toBe(true);
        categoryIds.push(created.category_id!);
    });

    it('renaming a category propagates to the product, the banner, the collection and the promotion', async () => {
        const oldName = `${TEST_TAG} ${stamp} before`;
        const newName = `${TEST_TAG} ${stamp} after`;
        const cat = await newCategory(oldName);
        await setProduct({ category_id: cat });

        const { data: banner, error: bannerErr } = await loose(admin)
            .from('storefront_banners')
            .insert({ title_ar: `${TEST_TAG} ${stamp} banner`, action_type: 'category', action_value: oldName })
            .select('id')
            .single();
        expect(bannerErr).toBeNull();
        bannerIds.push((banner as { id: string }).id);

        const collection = await rpc(admin, 'admin_save_collection', {
            p_slug: `test-automated-${stamp}`, p_name_ar: `${TEST_TAG} ${stamp} collection`, p_rule_type: 'category',
            p_rule_config: { category_id: cat, limit: 12 },
        });
        expect(collection.error).toBeNull();
        collectionIds.push(collection.data as unknown as string);

        const promotion = await rpc(admin, 'admin_save_promotion', {
            p_title: `${TEST_TAG} ${stamp} promotion`, p_discount_type: 'percentage', p_discount_value: 5, p_target_kind: 'category', p_target_value: oldName,
        });
        expect(promotion.error).toBeNull();
        promotionIds.push(promotion.data as unknown as string);

        const renamed = await rpc(admin, 'admin_save_category', { p_id: cat, p_name_ar: newName });
        expect(renamed.error).toBeNull();

        expect((await readProduct()).category).toBe(newName);
        const { data: bannerRow } = await loose(admin).from('storefront_banners').select('action_value').eq('id', bannerIds[bannerIds.length - 1]).single();
        expect((bannerRow as { action_value: string }).action_value).toBe(newName);
        const { data: collections } = await rpc(admin, 'admin_get_collections');
        const savedCollection = (collections as unknown as { id: string; rule_config: { category: string; category_id: string } }[])
            .find((c) => c.id === collectionIds[collectionIds.length - 1]);
        expect(savedCollection?.rule_config.category).toBe(newName);
        expect(savedCollection?.rule_config.category_id).toBe(cat);
        const { data: promotions } = await rpc(admin, 'admin_get_promotions');
        const savedPromotion = (promotions as unknown as { id: string; target_value: string | null }[])
            .find((p) => p.id === promotionIds[promotionIds.length - 1]);
        expect(savedPromotion?.target_value).toBe(newName);
    });

    it('a brand rename propagates to the product text and to a brand promotion', async () => {
        const brand = brandIds[0];
        const { data: before } = await rpc(admin, 'admin_get_brands');
        const oldName = (before as unknown as AdminBrand[]).find((b) => b.id === brand)?.name_ar;
        expect(oldName).toBeTruthy();
        const promotion = await rpc(admin, 'admin_save_promotion', {
            p_title: `${TEST_TAG} ${stamp} brand promotion`, p_discount_type: 'percentage', p_discount_value: 5, p_target_kind: 'brand', p_target_value: oldName,
        });
        expect(promotion.error).toBeNull();
        promotionIds.push(promotion.data as unknown as string);

        const renamed = await rpc(admin, 'admin_save_brand', { p_id: brand, p_name_ar: `${TEST_TAG} ${stamp} Maison Nouvelle` });
        expect(renamed.error).toBeNull();
        expect((await readProduct()).brand).toBe(`${TEST_TAG} ${stamp} Maison Nouvelle`);
        const { data: promotions } = await rpc(admin, 'admin_get_promotions');
        const savedPromotion = (promotions as unknown as { id: string; target_value: string | null }[])
            .find((p) => p.id === promotionIds[promotionIds.length - 1]);
        expect(savedPromotion?.target_value).toBe(`${TEST_TAG} ${stamp} Maison Nouvelle`);
    });

    it('deleting a category or brand with products, subcategories or references is refused', async () => {
        const row = await readProduct();
        const inUse = await rpc(admin, 'admin_delete_category', { p_id: row.category_id });
        expect(inUse.error?.message ?? '').toMatch(/products/);
        const brandInUse = await rpc(admin, 'admin_delete_brand', { p_id: row.brand_id });
        expect(brandInUse.error?.message ?? '').toMatch(/products/);

        const parent = await newCategory(`${TEST_TAG} ${stamp} parent`);
        await newCategory(`${TEST_TAG} ${stamp} kid`, parent);
        const withChild = await rpc(admin, 'admin_delete_category', { p_id: parent });
        expect(withChild.error?.message ?? '').toMatch(/subcategories/);
    });

    it('reorders siblings only, and hides inactive rows from the public readers', async () => {
        const hidden = await newCategory(`${TEST_TAG} ${stamp} hidden`);
        const { error: hideErr } = await rpc(admin, 'admin_save_category', { p_id: hidden, p_name_ar: `${TEST_TAG} ${stamp} hidden`, p_is_active: false });
        expect(hideErr).toBeNull();
        expect((await publicCategories(anon)).some((c) => c.id === hidden)).toBe(false);
        expect((await adminCategories()).find((c) => c.id === hidden)?.is_active).toBe(false);

        const row = await readProduct();
        const shown = (await publicCategories(anon)).find((c) => c.id === row.category_id);
        expect(shown?.product_count).toBe(1);

        const a = await newCategory(`${TEST_TAG} ${stamp} sort a`);
        const b = await newCategory(`${TEST_TAG} ${stamp} sort b`);
        const nested = await newCategory(`${TEST_TAG} ${stamp} sort nested`, a);
        expect((await rpc(admin, 'admin_reorder_categories', { p_ids: [a, b] })).error).toBeNull();
        const mixed = await rpc(admin, 'admin_reorder_categories', { p_ids: [a, nested] });
        expect(mixed.error?.message ?? '').toMatch(/share one parent/);
    });

    it('public brands hide inactive rows, and the product readers expose category_id and brand_id', async () => {
        const hidden = await newBrand(`${TEST_TAG} ${stamp} hidden brand`);
        await rpc(admin, 'admin_save_brand', { p_id: hidden, p_name_ar: `${TEST_TAG} ${stamp} hidden brand`, p_is_active: false });
        expect((await publicBrands(anon)).some((b) => b.id === hidden)).toBe(false);

        const row = await readProduct();
        const { data } = await customer.rpc('get_public_product', { p_product_id: product.id });
        const shown = (data as unknown as { id: string; category_id: string | null; brand_id: string | null; effective_price: number | null }[])[0];
        expect(shown.category_id).toBe(row.category_id);
        expect(shown.brand_id).toBe(row.brand_id);
        expect(shown.effective_price).not.toBeNull();
    });
});
