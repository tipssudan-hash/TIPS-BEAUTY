// Push registration for the Capacitor apps.
//
// The device gets an FCM registration token on both platforms — Firebase relays to APNs for iOS — so
// there is one token shape, one RPC and one dispatcher. The old Expo path stays alive on the backend
// for installs that predate this; nothing here writes Expo tokens.
//
// Permission is requested lazily, not at first launch: a customer who has not ordered yet has no
// reason to say yes, and a denied prompt cannot be asked again on iOS.

import { supabase } from '../supabase/client';
import { isNative, nativePlatform } from '../auth/platform';

const ORDERS_CHANNEL = 'orders';

type PushPlugin = typeof import('@capacitor/push-notifications').PushNotifications;

let registered: string | null = null;
let listenersBound = false;

async function plugin(): Promise<PushPlugin> {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return PushNotifications;
}

/**
 * Registers this device for order notifications.
 *
 * Safe to call repeatedly: it is a no-op on the web, and on native it re-registers only when the
 * token has changed. Resolves to the token, or null when push is unavailable or declined.
 */
export async function registerForPush(onNavigate?: (path: string) => void): Promise<string | null> {
    if (!isNative()) return null;
    const platform = nativePlatform();
    if (!platform) return null;

    try {
        const push = await plugin();

        const current = await push.checkPermissions();
        const permission = current.receive === 'prompt' || current.receive === 'prompt-with-rationale'
            ? (await push.requestPermissions()).receive
            : current.receive;
        if (permission !== 'granted') return null;

        if (platform === 'android') {
            // Android 8+ drops any notification whose channel does not exist. The id must match the
            // channel_id the dispatcher sends.
            await push.createChannel({
                id: ORDERS_CHANNEL,
                name: 'تحديثات الطلبات',
                description: 'إشعارات حالة الطلب والتوصيل',
                importance: 5,
                visibility: 1,
            });
        }

        if (!listenersBound) {
            listenersBound = true;

            await push.addListener('registration', (token) => {
                void storeToken(token.value, platform);
            });

            await push.addListener('registrationError', (error) => {
                console.error('push_registration_error', error);
            });

            // Tapping a notification should land on the order, not just open the app.
            await push.addListener('pushNotificationActionPerformed', (action) => {
                const url = action.notification.data?.url;
                if (typeof url === 'string' && url.startsWith('/')) onNavigate?.(url);
            });
        }

        await push.register();
        return registered;
    } catch (error) {
        // Push is an enhancement; a device that cannot register must still be able to shop.
        console.error('push_register', error);
        return null;
    }
}

async function storeToken(token: string, platform: 'ios' | 'android'): Promise<void> {
    if (!token || token === registered) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return; // registered before sign-in; the next call after login stores it

    const { error } = await supabase.rpc('register_push_token', {
        p_token: token,
        p_provider: 'fcm',
        p_platform: platform,
    });
    if (error) {
        console.error('register_push_token', error);
        return;
    }
    registered = token;
}

/**
 * Stops this device receiving the signed-out customer's order updates — the phone may be shared, and
 * order contents are private.
 */
export async function unregisterPush(): Promise<void> {
    if (!isNative() || !registered) return;
    try {
        const { error } = await supabase.rpc('deactivate_push_token', { p_token: registered });
        if (error) console.error('deactivate_push_token', error);
    } finally {
        registered = null;
    }
}
