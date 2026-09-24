// The native half of the sign-in seam: Google and Apple through the platform SDKs, never a redirect.
//
// Why a nonce dance: both Apple and Google copy the nonce we hand their SDK into the id_token
// verbatim, and Supabase compares that claim against the RAW value we pass to signInWithIdToken.
// So the SDK gets sha256(raw) and Supabase gets raw. Sending the same string to both fails
// verification with a misleading "Invalid nonce" and is the classic way this integration breaks.
//
// Client IDs come from env at build time — nothing is hardcoded, so debug, TestFlight and release
// builds all read their own values and none of it lives in the repo.

import { registerNativeSocialSignIn, type NativeSocialSignIn } from './providers';

type SocialLoginPlugin = {
    initialize: (options: Record<string, unknown>) => Promise<void>;
    login: (options: { provider: string; options: Record<string, unknown> }) => Promise<unknown>;
};

const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID as string | undefined;
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID as string | undefined;

let initialized: Promise<SocialLoginPlugin> | null = null;

async function plugin(): Promise<SocialLoginPlugin> {
    if (!initialized) {
        initialized = (async () => {
            const { SocialLogin } = await import('@capgo/capacitor-social-login');
            const socialLogin = SocialLogin as unknown as SocialLoginPlugin;
            await socialLogin.initialize({
                google: {
                    // Android verifies against the web client ID; iOS needs its own.
                    webClientId: GOOGLE_WEB_CLIENT_ID,
                    iOSClientId: GOOGLE_IOS_CLIENT_ID,
                },
                apple: {
                    // Native iOS Sign in with Apple authenticates against the bundle ID and must not
                    // redirect anywhere; the plugin documents '' as "no redirect".
                    clientId: '',
                    redirectUrl: '',
                },
            });
            return socialLogin;
        })();
    }
    return initialized;
}

function randomNonce(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

type LoginResult = {
    result?: {
        idToken?: string | null;
        profile?: { givenName?: string | null; familyName?: string | null; name?: string | null };
    };
};

const nativeSignIn: NativeSocialSignIn = async (provider) => {
    const socialLogin = await plugin();

    if (provider === 'google' && !GOOGLE_WEB_CLIENT_ID) throw new Error('google_client_id_missing');

    const rawNonce = randomNonce();
    const hashedNonce = await sha256Hex(rawNonce);

    const response = (await socialLogin.login({
        provider,
        options: provider === 'google'
            ? { scopes: ['email', 'profile'], nonce: hashedNonce }
            : { scopes: ['email', 'name'], nonce: hashedNonce },
    })) as LoginResult;

    const idToken = response.result?.idToken;
    if (!idToken) throw new Error('native_social_no_id_token');

    // Apple sends the name on the FIRST authorisation only, and only as separate parts.
    const profile = response.result?.profile;
    const fullName = profile?.name
        ?? ([profile?.givenName, profile?.familyName].filter(Boolean).join(' ') || null);

    return { idToken, nonce: rawNonce, fullName };
};

/** Called once at native startup, before any login screen renders. */
export function installNativeSocialSignIn(): void {
    registerNativeSocialSignIn(nativeSignIn);
}
