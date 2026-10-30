import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { creds, haveCreds, loose, rpc, signedInClient, TEST_TAG, type Client, type LooseRow } from './helpers';

// Admin audit log (admin_audit_log, §7d.1) and the admin-only bulk actions (§7d.2).

const suite = haveCreds ? describe : describe.skip;

suite('admin audit log and bulk actions', () => {
    let customer: Client;
    let admin: Client;
    let couponId: string;
    const stamp = Date.now().toString(36).toUpperCase();

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data, error } = await rpc(admin, 'admin_save_coupon', {
            p_code: `TA-AUD-${stamp}`,
            p_name: `${TEST_TAG} audit`,
            p_discount_type: 'fixed',
            p_discount_value: 1,
            p_per_user_limit: 1,
        });
        if (error) throw error;
        couponId = data as unknown as string;
    });

    afterAll(async () => {
        if (!admin || !couponId) return;
        await rpc(admin, 'admin_bulk_set_coupons_active', { p_ids: [couponId], p_is_active: false });
    });

    it('editing a coupon writes an UPDATE row that names the changed column and the admin', async () => {
        const { error } = await rpc(admin, 'admin_save_coupon', {
            p_id: couponId,
            p_code: `TA-AUD-${stamp}`,
            p_name: `${TEST_TAG} audit renamed`,
            p_discount_type: 'fixed',
            p_discount_value: 2,
            p_per_user_limit: 1,
        });
        expect(error).toBeNull();

        const { data, error: readErr } = await rpc(admin, 'admin_get_audit_log', { p_table: 'coupons', p_row_id: couponId });
        expect(readErr).toBeNull();
        const rows = (data ?? []) as unknown as { action: string; changed_columns: string[] | null; changed_by: string | null; changed_by_name: string | null }[];
        const update = rows.find((r) => r.action === 'UPDATE');
        expect(update).toBeTruthy();
        expect(update!.changed_columns).toEqual(expect.arrayContaining(['name']));
        const { data: me } = await admin.auth.getUser();
        expect(update!.changed_by).toBe(me.user!.id);
    });

    it('a customer cannot read the audit table directly', async () => {
        const { data } = await loose(customer).from('admin_audit_log').select('id');
        expect(data ?? []).toHaveLength(0);
    });

    it('a customer cannot call the audit reader', async () => {
        const { error } = await rpc(customer, 'admin_get_audit_log', { p_table: 'coupons' });
        expect(error?.message ?? '').toMatch(/Administrator access required/);
    });

    it('the admin reader pages the history and returns total_count', async () => {
        const { data, error } = await rpc(admin, 'admin_get_audit_log', { p_table: 'coupons', p_row_id: couponId, p_limit: 1, p_offset: 0 });
        expect(error).toBeNull();
        const rows = (data ?? []) as unknown as LooseRow[];
        expect(rows).toHaveLength(1);
        expect(Number(rows[0].total_count)).toBeGreaterThanOrEqual(2);
    });

    it('a bulk action refuses more than 500 ids', async () => {
        const ids = Array.from({ length: 501 }, () => randomUUID());
        const { error } = await rpc(admin, 'admin_bulk_set_coupons_active', { p_ids: ids, p_is_active: false });
        expect(error?.message ?? '').toMatch(/At most 500/);
    });

    it('a bulk action refuses a non-admin caller', async () => {
        const { error } = await rpc(customer, 'admin_bulk_set_coupons_active', { p_ids: [couponId], p_is_active: false });
        expect(error?.message ?? '').toMatch(/Administrator access required/);
    });

    it('a bulk action in the limit updates the matching rows and reports the count', async () => {
        const { data, error } = await rpc(admin, 'admin_bulk_set_coupons_active', { p_ids: [couponId], p_is_active: true });
        expect(error).toBeNull();
        expect(Number(data)).toBe(1);
    });
});
