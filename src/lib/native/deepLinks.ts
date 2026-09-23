// Turning an incoming link into a route.
//
// Primary mechanism is HTTPS: Universal Links (iOS) and App Links (Android) on
// https://beauty.tips-sd.com, so a link in a WhatsApp order message opens the app when it is
// installed and the website when it is not — one URL that always works. The tipsbeauty:// scheme is
// kept only as a fallback for contexts that refuse https app links.

export const STOREFRONT_ORIGIN = 'https://beauty.tips-sd.com';
export const APP_SCHEME = 'tipsbeauty:';

/**
 * The in-app path for a deep link, or null if the link is not ours.
 *
 * Returning null matters: an unrecognised URL must fall through to the system rather than navigate
 * the app somewhere arbitrary.
 */
export function pathFromDeepLink(url: string): string | null {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return null;
    }

    if (parsed.protocol === APP_SCHEME) {
        // tipsbeauty://orders/123 parses with host "orders" and pathname "/123".
        const path = `/${parsed.host}${parsed.pathname}`.replace(/\/+$/, '') || '/';
        return `${path}${parsed.search}${parsed.hash}`;
    }

    if (parsed.protocol !== 'https:') return null;
    if (parsed.host !== new URL(STOREFRONT_ORIGIN).host) return null;

    return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
}
