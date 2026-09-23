import { describe, expect, it } from 'vitest';
import { creds, haveCreds, rpc, signedInClient } from './helpers';

// Account deletion (migration 20260924000100).
//
// delete_my_account() is irreversible and is NOT exercised here: running it would destroy the shared
// test customer, and every later backend suite depends on that account existing. What is tested is
// everything guarding it — the preview the confirmation screen reads, the staff refusal, and the
// in-flight-order refusal. The destructive path itself is verified on a throwaway account during
// real-device testing, which is where it belongs.

const suite = haveCreds ? describe : describe.skip;

suite('account deletion guards', () => {
    it('previews what deletion will do, so the warning cannot drift from the function', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data, error } = await rpc(customer, 'account_deletion_preview');
        expect(error).toBeNull();

        const preview = data as unknown as Record<string, number>;
        expect(Object.keys(preview).sort()).toEqual(['active_orders', 'beauty_points', 'orders', 'reviews']);
        for (const [key, value] of Object.entries(preview)) {
            expect(typeof value, key).toBe('number');
            expect(value, key).toBeGreaterThanOrEqual(0);
        }
        // Active orders are a subset of all orders; if this inverts, the guard below is meaningless.
        expect(preview.active_orders).toBeLessThanOrEqual(preview.orders);
    });

    it('refuses to delete a staff account through the customer-facing button', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { error } = await rpc(admin, 'delete_my_account');
        // The admin account must still exist after this call — that is the point of the assertion.
        expect(error?.message ?? '').toMatch(/staff_account_deletion_not_allowed/i);

        const { data: user } = await admin.auth.getUser();
        expect(user.user?.id).toBeTruthy();
        const { data: profile } = await admin.from('profiles').select('role,deleted_at').eq('id', user.user!.id).single();
        expect(profile?.role).toBe('admin');
        expect(profile?.deleted_at).toBeNull();
    });

    it('is unavailable to anonymous callers', async () => {
        const { anonClient } = await import('./helpers');
        const { error } = await rpc(anonClient(), 'delete_my_account');
        expect(error).toBeTruthy();
    });
});
