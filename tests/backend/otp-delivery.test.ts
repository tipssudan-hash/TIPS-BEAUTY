import { describe, expect, it } from 'vitest';
import { anonClient, creds, haveCreds, rpc, signedInClient } from './helpers';

// OTP rate limiting and logging (migration 20260924000200).
//
// record_otp_attempt() and get_otp_settings() are service-role only, so the suite cannot exercise the
// counting logic without the service key — and putting that key in a test env would be a worse trade
// than the coverage is worth. What is asserted here is the boundary: no customer and no anonymous
// caller can reach the OTP machinery, spend the SMS budget, or read other people's phone numbers out
// of the delivery log. The counting itself is verified end to end during real-device testing, where a
// real handset proves both the limit and the delivery.

const suite = haveCreds ? describe : describe.skip;

suite('OTP endpoints are not reachable from the client', () => {
    it('refuses record_otp_attempt to anonymous and signed-in callers', async () => {
        for (const client of [anonClient(), await signedInClient(creds.customer.email, creds.customer.password)]) {
            const { error } = await rpc(client, 'record_otp_attempt', { p_phone: '+249912345678', p_ip: null });
            // Spending money must never be one crafted request away.
            expect(error).toBeTruthy();
        }
    });

    it('refuses get_otp_settings and log_otp_delivery to customers', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);

        const { error: settingsError } = await rpc(customer, 'get_otp_settings');
        expect(settingsError).toBeTruthy();

        const { error: logError } = await rpc(customer, 'log_otp_delivery', {
            p_phone: '+249912345678', p_channel: 'sms', p_provider: 'fake', p_status: 'sent',
        });
        expect(logError).toBeTruthy();
    });

    it('keeps the delivery log admin-only — it is full of phone numbers', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data } = await customer.from('otp_delivery_log').select('phone');
        expect(data ?? []).toHaveLength(0);

        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { error: adminError } = await admin.from('otp_delivery_log').select('phone').limit(1);
        expect(adminError).toBeNull();
    });

    it('never exposes the raw attempt ledger', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        // No SELECT policy at all: it is rate-limiting state for the hook, not a report.
        const { data } = await admin.from('otp_request_attempts').select('phone');
        expect(data ?? []).toHaveLength(0);
    });
});

suite('OTP channel settings', () => {
    it('are readable by admins through app_settings, for the Admin Portal toggles', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data, error } = await admin.from('app_settings')
            .select('otp_whatsapp_enabled,otp_sms_enabled,otp_primary_channel,otp_cooldown_seconds,otp_max_per_phone_hour,otp_max_per_ip_hour')
            .single();

        expect(error).toBeNull();
        expect(['whatsapp', 'sms']).toContain(data?.otp_primary_channel);
        expect(data?.otp_cooldown_seconds).toBeGreaterThan(0);
        expect(data?.otp_max_per_phone_hour).toBeGreaterThan(0);
    });
});
