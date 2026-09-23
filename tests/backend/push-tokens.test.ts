import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TEST_TAG, creds, haveCreds, rpc, signedInClient, type Client } from './helpers';

// Push token registration after the FCM migration (20260924000000).
//
// The contract that matters: the table now holds both token shapes, the old Expo rules still apply to
// Expo rows, and a customer can release a device on sign-out. Expo registration is asserted here
// precisely because it must keep working — it is not removed until FCM is verified on real handsets.

const suite = haveCreds ? describe : describe.skip;

suite('register_push_token', () => {
    let customer: Client;
    let admin: Client;
    let customerId: string;
    const tokens: string[] = [];

    // Tagged so anything left behind by a failed run is identifiable in the dashboard.
    const fcmToken = () => {
        const token = `${TEST_TAG}-fcm-${crypto.randomUUID()}`;
        tokens.push(token);
        return token;
    };

    beforeAll(async () => {
        customer = await signedInClient(creds.customer.email, creds.customer.password);
        admin = await signedInClient(creds.admin.email, creds.admin.password);
        const { data } = await customer.auth.getUser();
        customerId = data.user!.id;
    });

    afterAll(async () => {
        if (tokens.length) await admin.from('customer_push_tokens').delete().in('push_token', tokens);
    });

    const register = (token: string, provider = 'fcm', platform = 'android') =>
        rpc(customer, 'register_push_token', {
            p_token: token,
            p_provider: provider,
            p_platform: platform,
            p_device_name: `${TEST_TAG} device`,
        });

    it('stores an FCM token against the signed-in customer', async () => {
        const token = fcmToken();
        const { data: id, error } = await register(token);
        expect(error).toBeNull();
        expect(id).toBeTruthy();

        const { data: row } = await customer.from('customer_push_tokens')
            .select('customer_id,provider,push_token,expo_push_token,platform,is_active')
            .eq('push_token', token)
            .single();

        expect(row?.customer_id).toBe(customerId);
        expect(row?.provider).toBe('fcm');
        expect(row?.is_active).toBe(true);
        // An FCM row must not claim to be an Expo one; the dispatcher routes on exactly this.
        expect(row?.expo_push_token).toBeNull();
    });

    it('re-registering the same device updates it rather than duplicating it', async () => {
        const token = fcmToken();
        await register(token);
        await register(token, 'fcm', 'ios');

        const { data: rows } = await customer.from('customer_push_tokens').select('id,platform').eq('push_token', token);
        expect(rows).toHaveLength(1);
        expect(rows?.[0]?.platform).toBe('ios');
    });

    it('still accepts Expo tokens, and still rejects malformed ones', async () => {
        const expoToken = `ExponentPushToken[${TEST_TAG}-${crypto.randomUUID()}]`;
        tokens.push(expoToken);
        const { error } = await register(expoToken, 'expo');
        expect(error).toBeNull();

        const { data: row } = await customer.from('customer_push_tokens')
            .select('provider,expo_push_token,push_token')
            .eq('push_token', expoToken)
            .single();
        expect(row?.provider).toBe('expo');
        // Expo rows keep both columns in step so the legacy dispatcher path is unaffected.
        expect(row?.expo_push_token).toBe(expoToken);

        const { error: rejected } = await register('not-an-expo-token', 'expo');
        expect(rejected?.message ?? '').toMatch(/Invalid Expo push token/i);
    });

    it('refuses unknown providers and platforms', async () => {
        const { error: badProvider } = await register(fcmToken(), 'onesignal');
        expect(badProvider?.message ?? '').toMatch(/Unsupported push provider/i);

        const { error: badPlatform } = await register(fcmToken(), 'fcm', 'windows');
        expect(badPlatform?.message ?? '').toMatch(/Unsupported device platform/i);
    });

    it('deactivates a device on sign-out so a shared phone stops receiving order updates', async () => {
        const token = fcmToken();
        await register(token);

        const { data: released, error } = await rpc(customer, 'deactivate_push_token', { p_token: token });
        expect(error).toBeNull();
        expect(released).toBe(true);

        const { data: row } = await customer.from('customer_push_tokens')
            .select('is_active,invalidated_at')
            .eq('push_token', token)
            .single();
        expect(row?.is_active).toBe(false);
        expect(row?.invalidated_at).toBeTruthy();
    });

    it('will not let one customer release another customer\'s device', async () => {
        const token = fcmToken();
        await register(token);

        // The admin account is a different customer_id, so the update must match nothing.
        const { data: released } = await rpc(admin, 'deactivate_push_token', { p_token: token });
        expect(released).toBe(false);

        const { data: row } = await customer.from('customer_push_tokens').select('is_active').eq('push_token', token).single();
        expect(row?.is_active).toBe(true);
    });
});
