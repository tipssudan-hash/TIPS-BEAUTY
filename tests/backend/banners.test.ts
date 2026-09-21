import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, anonClient, creds, haveCreds, signedInClient, type Client } from './helpers';

// Banners (launch step 2): staff manage storefront_banners; the Storefront reads them anonymously
// and must only ever see active rows inside their schedule — the public policy is the contract.

const suite = haveCreds ? describe : describe.skip;

suite('storefront banners over the public policy', () => {
    let admin: Client;
    let anon: Client;
    const ids: string[] = [];
    const image = 'https://example.com/banner.jpg';

    const add = async (row: Record<string, unknown>) => {
        const { data, error } = await admin.from('storefront_banners')
            .insert({ title_ar: `${TEST_TAG} banner`, image_url: image, action_type: 'none', display_order: 9000, is_active: true, ...row })
            .select('id').single();
        if (error) throw error;
        ids.push(data.id);
        return data.id;
    };
    const visible = async () => {
        const { data, error } = await anon.from('storefront_banners').select('id,title_ar').like('title_ar', `${TEST_TAG}%`);
        if (error) throw error;
        return new Set((data ?? []).map((b) => b.id));
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        await admin.from('storefront_banners').delete().like('title_ar', `${TEST_TAG}%`);
    });

    afterAll(async () => {
        if (admin) await admin.from('storefront_banners').delete().like('title_ar', `${TEST_TAG}%`);
    });

    it('anonymous readers see live banners only; staff write, anonymous cannot', async () => {
        const hour = 3_600_000;
        const live = await add({});
        const off = await add({ is_active: false });
        const future = await add({ starts_at: new Date(Date.now() + hour).toISOString() });
        const ended = await add({ starts_at: new Date(Date.now() - 2 * hour).toISOString(), ends_at: new Date(Date.now() - hour).toISOString() });
        const seen = await visible();
        expect(seen.has(live)).toBe(true);
        expect(seen.has(off)).toBe(false);
        expect(seen.has(future)).toBe(false);
        expect(seen.has(ended)).toBe(false);

        const write = await anon.from('storefront_banners').insert({ title_ar: `${TEST_TAG} anon`, image_url: image } as never);
        expect(write.error).not.toBeNull();
    });

    it('a signed-in customer cannot write banners either', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const write = await customer.from('storefront_banners').insert({ title_ar: `${TEST_TAG} customer`, image_url: image } as never);
        expect(write.error).not.toBeNull();
        const { data } = await customer.from('storefront_banners').select('id').like('title_ar', `${TEST_TAG} customer%`);
        expect(data ?? []).toHaveLength(0);
    });
});
