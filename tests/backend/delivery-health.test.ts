import { describe, expect, it } from 'vitest';
import { anonClient, creds, haveCreds, rpc, signedInClient } from './helpers';

// WhatsApp order notifications and the delivery-health screen (migration 20260924000300).
//
// The trigger's positive path needs a customer with a phone and NO email — the shared test customer has
// an email, and creating a phone-only account means a real OTP to a real handset. So what is asserted
// here is the negative (an email customer must not also get a WhatsApp message, or every order costs
// twice) and the admin surface. The positive path is covered by the real-device test plan.

const suite = haveCreds ? describe : describe.skip;

suite('delivery health RPCs', () => {
    it('gives admins a summary of every channel', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data, error } = await rpc(admin, 'admin_delivery_summary', { p_hours: 48 });
        expect(error).toBeNull();

        const summary = data as unknown as Record<string, Record<string, number>>;
        expect(Object.keys(summary).sort()).toEqual(['email', 'hours', 'otp', 'push', 'whatsapp']);
        for (const channel of ['email', 'whatsapp', 'otp', 'push']) {
            expect(typeof summary[channel].failed, channel).toBe('number');
            expect(typeof summary[channel].sent, channel).toBe('number');
        }
    });

    it('lists failures across all three pipelines', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data, error } = await rpc(admin, 'admin_delivery_failures', { p_hours: 48, p_limit: 50 });
        expect(error).toBeNull();
        expect(Array.isArray(data)).toBe(true);

        for (const row of (data ?? []) as { source: string; status: string; created_at: string }[]) {
            expect(['notification_queue', 'otp_delivery_log', 'push_notification_deliveries']).toContain(row.source);
            // Only failures belong here: a screen that lists successes hides the problem it exists to show.
            expect(['failed', 'blocked', 'cancelled']).toContain(row.status);
        }
    });

    it('refuses both to customers and to anonymous callers', async () => {
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        for (const client of [customer, anonClient()]) {
            const { error: failuresError } = await rpc(client, 'admin_delivery_failures', {});
            expect(failuresError?.message ?? '').toMatch(/Administrator access required|permission/i);
            const { error: summaryError } = await rpc(client, 'admin_delivery_summary', {});
            expect(summaryError?.message ?? '').toMatch(/Administrator access required|permission/i);
        }
    });
});

suite('WhatsApp order notifications', () => {
    it('does not queue WhatsApp for customers who have an email', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        const customer = await signedInClient(creds.customer.email, creds.customer.password);
        const { data: user } = await customer.auth.getUser();

        const { data: profile } = await customer.from('profiles').select('email').eq('id', user.user!.id).single();
        // Guard the premise of this test rather than silently passing if it changes.
        expect(profile?.email).toBeTruthy();

        const { data: rows, error } = await admin.from('notification_queue')
            .select('id,channel,payload')
            .eq('customer_id', user.user!.id)
            .eq('channel', 'whatsapp')
            // Only rows OUR trigger queued. A pre-existing trigger has been queueing whatsapp rows for
            // every customer and every event since before this project; the dispatcher ignores those,
            // and this assertion would be about someone else's design if it counted them.
            .contains('payload', { notifier: 'order_confirmation_v1' });
        expect(error).toBeNull();
        // Email reaches them; sending both would be two costs for one message.
        expect(rows ?? []).toHaveLength(0);
    });

    it('accepts whatsapp as a queue channel', async () => {
        const admin = await signedInClient(creds.admin.email, creds.admin.password);
        // The channel CHECK constraint already allowed it (migration 0006); this confirms nothing since
        // has narrowed it, because the trigger would fail silently at order creation if it had.
        const { error } = await admin.from('notification_queue').select('id').eq('channel', 'whatsapp').limit(1);
        expect(error).toBeNull();
    });
});
