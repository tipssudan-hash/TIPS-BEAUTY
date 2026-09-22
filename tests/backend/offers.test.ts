import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, anonClient, creds, haveCreds, rpc, signedInClient, type Client } from './helpers';

// Offers (launch step 9): the public RPC lists only Promotions running now, with the Products each
// one touches, while the promotions table itself stays private.

const suite = haveCreds ? describe : describe.skip;

type Offer = { id: string; title: string; target_kind: string; product_ids: string[] };

suite('public offers', () => {
    let admin: Client;
    let anon: Client;
    const ids: string[] = [];

    const offers = async () => {
        const { data, error } = await rpc(anon, 'get_active_promotions');
        if (error) throw error;
        return (data as unknown as Offer[]).filter((o) => o.title.startsWith(TEST_TAG));
    };
    const add = async (args: Record<string, unknown>) => {
        const { data, error } = await rpc(admin, 'admin_save_promotion', { p_title: `${TEST_TAG} offer`, p_discount_type: 'percentage', p_discount_value: 10, p_target_kind: 'all', ...args });
        if (error) throw error;
        ids.push(data as unknown as string);
        return data as unknown as string;
    };
    const removeAll = async () => {
        for (const id of ids.splice(0)) {
            const { error } = await rpc(admin, 'admin_delete_promotion', { p_id: id });
            if (error) await rpc(admin, 'admin_end_promotion', { p_id: id });
        }
    };

    beforeAll(async () => {
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        anon = anonClient();
        const { data } = await rpc(admin, 'admin_get_promotions');
        ids.push(...((data as unknown as { id: string; title: string }[]) ?? []).filter((p) => p.title.startsWith(TEST_TAG)).map((p) => p.id));
        await removeAll();
    });

    afterAll(async () => { if (admin) await removeAll(); });

    it('lists running Promotions with matching Products, hides scheduled/ended ones, and the table stays private', async () => {
        const { data: catalogue } = await anon.rpc('get_public_products');
        const product = (catalogue as unknown as { id: string; brand: string | null }[])[0];
        const running = await add({ p_target_kind: 'products', p_target_product_ids: [product.id], p_title: `${TEST_TAG} running` });
        await add({ p_start_date: new Date(Date.now() + 86_400_000).toISOString(), p_title: `${TEST_TAG} later` });
        const ended = await add({ p_title: `${TEST_TAG} over` });
        await rpc(admin, 'admin_end_promotion', { p_id: ended });

        const list = await offers();
        expect(list.map((o) => o.id)).toEqual([running]);
        expect(list[0].product_ids).toEqual([product.id]);

        const direct = await anon.from('promotions').select('id').limit(1);
        expect(direct.error).not.toBeNull();
    });
});
