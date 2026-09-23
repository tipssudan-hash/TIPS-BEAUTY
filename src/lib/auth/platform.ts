// Which shell the Storefront is running in. The same bundle serves the web store and (from the
// Capacitor workstream on) the Android and iOS apps, and the two need different sign-in flows:
// the web redirects to the provider, native hands a provider id_token straight to Supabase.
//
// Capacitor is not a dependency yet, so this reads the global it injects at runtime rather than
// importing it — that keeps the web build free of a package it has no use for.

export type NativePlatform = 'ios' | 'android';

type CapacitorGlobal = {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
};

function capacitor(): CapacitorGlobal | undefined {
    return (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** The native platform we're running on, or null on the web. */
export function nativePlatform(): NativePlatform | null {
    const cap = capacitor();
    if (!cap?.isNativePlatform?.()) return null;
    const platform = cap.getPlatform?.();
    return platform === 'ios' || platform === 'android' ? platform : null;
}

export function isNative(): boolean {
    return nativePlatform() !== null;
}

/**
 * Sign in with Apple is mandatory on iOS once any other social provider is offered
 * (App Review Guideline 4.8), and pointless elsewhere — Android and web customers who own an Apple
 * ID are rare enough that the button is noise.
 */
export function shouldOfferApple(): boolean {
    return nativePlatform() === 'ios';
}
