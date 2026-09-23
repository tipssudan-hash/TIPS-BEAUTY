// Where the Supabase session is kept.
//
// On the web, localStorage (the supabase-js default) is right. Inside the app it is not: iOS evicts
// WKWebView local storage under disk pressure and after long periods unused, which would log a
// customer out at random with no explanation — the single worst bug a shopping app can have. The
// Capacitor Preferences plugin writes to UserDefaults / SharedPreferences instead, which the OS
// treats as app data and backs up.
//
// supabase-js accepts an async storage adapter, so this is a drop-in.

import { isNative } from '../auth/platform';

type SupabaseStorage = {
    getItem: (key: string) => Promise<string | null> | string | null;
    setItem: (key: string, value: string) => Promise<void> | void;
    removeItem: (key: string) => Promise<void> | void;
};

/** Lazily imported so the web bundle never pulls the plugin in. */
async function preferences() {
    const { Preferences } = await import('@capacitor/preferences');
    return Preferences;
}

const nativeStorage: SupabaseStorage = {
    async getItem(key) {
        const { value } = await (await preferences()).get({ key });
        return value ?? null;
    },
    async setItem(key, value) {
        await (await preferences()).set({ key, value });
    },
    async removeItem(key) {
        await (await preferences()).remove({ key });
    },
};

/** The storage supabase-js should use in this shell, or undefined to keep its default. */
export function authStorage(): SupabaseStorage | undefined {
    return isNative() ? nativeStorage : undefined;
}
