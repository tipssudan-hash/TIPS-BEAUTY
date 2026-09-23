import { describe, expect, it } from 'vitest';
import { anonClient, creds, haveCreds, rpc, signedInClient } from './helpers';

// Multi-provider auth (migration 20260923000000). Three contracts the app leans on:
// - normalize_sd_phone is the single definition of "the same number", so the unique index on a
//   verified phone actually holds. Anon may call it: the signup form normalises before submitting.
// - get_auth_settings is readable while signed out, because the login screen decides which buttons
//   to draw before anyone has a session. app_settings itself stays admin-only.
// - has_verified_contact is what replaced "verified email" as the gate on ordering.

const suite = haveCreds ? describe : describe.skip;

suite('normalize_sd_phone', () => {
    const anon = anonClient();
    const normalize = async (input: string | null) => {
        const { data, error } = await rpc(anon, 'normalize_sd_phone', { p_phone: input });
        if (error) throw error;
        return data as unknown as string | null;
    };

    it('folds every way a Sudanese number gets typed into one E.164 value', async () => {
        for (const input of ['0912345678', '+249912345678', '249912345678', '00249912345678', '091 234 5678', '091-234-5678']) {
            expect(await normalize(input), input).toBe('+249912345678');
        }
    });

    it('accepts the 1xx mobile range as well as 9xx', async () => {
        expect(await normalize('0123456789')).toBe('+249123456789');
    });

    it('rejects anything that is not a Sudanese mobile number', async () => {
        for (const input of ['', '12345', '0812345678', '+201012345678', 'not a phone']) {
            expect(await normalize(input), input).toBeNull();
        }
        expect(await normalize(null)).toBeNull();
    });
});

suite('get_auth_settings', () => {
    it('is readable while signed out, and reports every method flag', async () => {
        const { data, error } = await rpc(anonClient(), 'get_auth_settings');
        expect(error).toBeNull();
        const flags = data as unknown as Record<string, boolean>;
        expect(Object.keys(flags).sort()).toEqual(['apple', 'captcha', 'google', 'password', 'phone']);
        for (const [key, value] of Object.entries(flags)) {
            expect(typeof value, key).toBe('boolean');
        }
    });

    it('does not expose app_settings itself to anonymous readers', async () => {
        const { data } = await anonClient().from('app_settings').select('notification_emails');
        // RLS returns an empty set rather than an error for a table with no anon policy.
        expect(data ?? []).toHaveLength(0);
    });
});

suite('verified contact and profile shape', () => {
    it('reports a verified contact for the signed-in test customer', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data, error } = await rpc(customer, 'has_verified_contact');
        expect(error).toBeNull();
        expect(data).toBe(true);
    });

    it('exposes the new profile columns to their owner', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data: user } = await customer.auth.getUser();
        const { data, error } = await customer.from('profiles')
            .select('id,phone,phone_confirmed_at,full_name,signup_method')
            .eq('id', user.user!.id)
            .single();
        expect(error).toBeNull();
        expect(data).toBeTruthy();
        // Backfilled accounts predate the column, so a null phone is fine — the format is not.
        if (data?.phone) expect(data.phone).toMatch(/^\+249[19]\d{8}$/);
        if (data?.signup_method) expect(['password', 'google', 'apple', 'phone']).toContain(data.signup_method);
    });

    it('never records a confirmed phone without a phone', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data, error } = await admin.from('profiles')
            .select('id')
            .is('phone', null)
            .not('phone_confirmed_at', 'is', null);
        expect(error).toBeNull();
        expect(data ?? []).toHaveLength(0);
    });
});
