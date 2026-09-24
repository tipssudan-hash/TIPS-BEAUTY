import { describe, expect, it } from 'vitest';
import { pathFromDeepLink } from '@infrastructure/native/deepLinks';

// Every order link we send by WhatsApp or email lands here. Two failure modes matter: a real link
// that does not open the right screen (the customer gives up), and a foreign link that navigates the
// app anyway (a phishing link becomes an in-app page).

describe('pathFromDeepLink', () => {
    it('routes storefront https links to their path', () => {
        expect(pathFromDeepLink('https://beauty.tips-sd.com/orders/123')).toBe('/orders/123');
        expect(pathFromDeepLink('https://beauty.tips-sd.com/')).toBe('/');
        expect(pathFromDeepLink('https://beauty.tips-sd.com')).toBe('/');
    });

    it('keeps the query and hash, which carry the auth callback and anchors', () => {
        expect(pathFromDeepLink('https://beauty.tips-sd.com/auth/callback?next=%2Fcheckout'))
            .toBe('/auth/callback?next=%2Fcheckout');
        expect(pathFromDeepLink('https://beauty.tips-sd.com/product/9#reviews')).toBe('/product/9#reviews');
    });

    it('accepts the fallback scheme, where the first segment parses as the host', () => {
        expect(pathFromDeepLink('tipsbeauty://orders/123')).toBe('/orders/123');
        expect(pathFromDeepLink('tipsbeauty://orders')).toBe('/orders');
    });

    it('refuses links that are not ours, rather than navigating somewhere arbitrary', () => {
        // Look-alike hosts are the reason this is an exact host match and not a suffix check.
        expect(pathFromDeepLink('https://beauty.tips-sd.com.evil.example/orders/1')).toBeNull();
        expect(pathFromDeepLink('https://evil.example/orders/1')).toBeNull();
        expect(pathFromDeepLink('https://admin.beauty.tips-sd.com/orders')).toBeNull();
        expect(pathFromDeepLink('http://beauty.tips-sd.com/orders/1')).toBeNull();
        expect(pathFromDeepLink('javascript:alert(1)')).toBeNull();
        expect(pathFromDeepLink('not a url')).toBeNull();
        expect(pathFromDeepLink('')).toBeNull();
    });
});
