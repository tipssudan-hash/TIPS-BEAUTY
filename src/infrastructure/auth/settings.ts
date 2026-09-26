// Which sign-in methods are live is a server-side setting (app_settings), not a build-time flag:
// once the mobile apps are in the stores, a build-time flag costs a review cycle to change, so a
// broken provider could not be switched off the same day it broke.
//
// app_settings is admin-only under RLS, so the login screen reads it through get_auth_settings().

import { supabase } from '../supabase/client';

export type AuthMethodFlags = {
    password: boolean;
    google: boolean;
    apple: boolean;
    phone: boolean;
    captcha: boolean;
};

// Email+password is the method that has always worked. If the settings read fails — offline, or the
// migration has not been applied to this environment yet — customers can still sign in.
export const DEFAULT_AUTH_FLAGS: AuthMethodFlags = {
    password: true,
    google: false,
    apple: false,
    phone: false,
    captcha: false,
};

function coerce(value: unknown): AuthMethodFlags {
    if (!value || typeof value !== 'object') return DEFAULT_AUTH_FLAGS;
    const raw = value as Record<string, unknown>;
    const flag = (key: keyof AuthMethodFlags) =>
        typeof raw[key] === 'boolean' ? (raw[key] as boolean) : DEFAULT_AUTH_FLAGS[key];
    return {
        password: flag('password'),
        google: flag('google'),
        apple: flag('apple'),
        phone: flag('phone'),
        captcha: flag('captcha'),
    };
}

/**
 * The outcome, not just the flags. A failed read used to be indistinguishable from "every provider
 * is switched off": the login screen simply rendered without the buttons and never tried again, so a
 * customer on a flaky connection saw a permanently crippled screen with nothing explaining it. That
 * is what `ok` is for — the caller can say so and offer a retry.
 */
export type AuthFlagsResult = { flags: AuthMethodFlags; ok: boolean };

const RETRY_DELAYS_MS = [400, 1200];

const wait = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

export async function fetchAuthFlags(): Promise<AuthFlagsResult> {
    let lastError: unknown = null;

    // Two retries with a short backoff. This read happens at startup, when a mobile connection is
    // least likely to be ready, and it decides whether the customer can see how to sign in at all.
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        const { data, error } = await supabase.rpc('get_auth_settings');
        if (!error) return { flags: coerce(data), ok: true };
        lastError = error;
        if (attempt < RETRY_DELAYS_MS.length) await wait(RETRY_DELAYS_MS[attempt]);
    }

    console.error('get_auth_settings', lastError);
    return { flags: DEFAULT_AUTH_FLAGS, ok: false };
}
