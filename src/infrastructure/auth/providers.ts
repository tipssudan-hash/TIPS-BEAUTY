// One interface, two implementations — the seam that keeps authentication from becoming web-only.
//
// Web:    supabase.auth.signInWithOAuth() redirects to the provider and back to /auth/callback.
// Native: the platform SDK returns an id_token which goes to supabase.auth.signInWithIdToken().
//         Google refuses OAuth inside embedded WebViews (disallowed_useragent) and Apple expects its
//         native sheet, so the redirect flow is not an option inside the app.
//
// The native implementation lives in the Capacitor workstream and registers itself through
// registerNativeSocialSignIn(). Until it does, native builds surface a clear error instead of a
// silent failure, and the web build carries no native dependency at all.

import { supabase } from '../supabase/client';
import { isNative, nativePlatform, type NativePlatform } from './platform';

export type SocialProvider = 'google' | 'apple';

export type NativeSocialSignIn = (
    provider: SocialProvider,
    platform: NativePlatform,
) => Promise<{ idToken: string; nonce?: string; fullName?: string | null }>;

let nativeSignIn: NativeSocialSignIn | null = null;

/** Called once at native startup by the Capacitor entry point. */
export function registerNativeSocialSignIn(implementation: NativeSocialSignIn): void {
    nativeSignIn = implementation;
}

export const OAUTH_CALLBACK_PATH = '/auth/callback';

/**
 * Starts sign-in with a social provider.
 *
 * On the web this navigates away and never resolves — the session arrives when the provider
 * redirects back to OAUTH_CALLBACK_PATH. On native it resolves once the session is in place.
 */
export async function signInWithSocial(provider: SocialProvider, redirectAfter?: string): Promise<void> {
    const platform = nativePlatform();

    if (platform) {
        if (!nativeSignIn) throw new Error('native_social_sign_in_unavailable');
        const { idToken, nonce, fullName } = await nativeSignIn(provider, platform);
        const { data, error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
        if (error) throw error;
        // Apple returns the customer's name on the FIRST authorisation only. If we don't persist it
        // now it is gone for good, and every order shows an unnamed customer.
        if (fullName && data.user && !data.user.user_metadata?.full_name) {
            await supabase.auth.updateUser({ data: { full_name: fullName } });
        }
        return;
    }

    const redirectTo = new URL(OAUTH_CALLBACK_PATH, window.location.origin);
    if (redirectAfter) redirectTo.searchParams.set('next', redirectAfter);

    const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
            redirectTo: redirectTo.toString(),
            // Sudanese customers often share a device; without this Google silently reuses whichever
            // account signed in last.
            queryParams: provider === 'google' ? { prompt: 'select_account' } : undefined,
        },
    });
    if (error) throw error;
}

/** True when a social sign-in can actually complete in this shell. */
export function socialSignInAvailable(): boolean {
    return isNative() ? nativeSignIn !== null : true;
}
