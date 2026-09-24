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

export async function fetchAuthFlags(): Promise<AuthMethodFlags> {
    const { data, error } = await supabase.rpc('get_auth_settings');
    if (error) {
        console.error('get_auth_settings', error);
        return DEFAULT_AUTH_FLAGS;
    }
    return coerce(data);
}
