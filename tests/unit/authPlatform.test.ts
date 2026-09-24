import { afterEach, describe, expect, it } from 'vitest';
import { isNative, nativePlatform, shouldOfferApple } from '@infrastructure/auth/platform';

// The shell detection decides which sign-in flow runs: redirect on the web, native id_token in the
// app. Getting it wrong on the web would send customers into a plugin that isn't there; getting it
// wrong in the app would hand Google a WebView it refuses (disallowed_useragent).

type CapacitorGlobal = { isNativePlatform?: () => boolean; getPlatform?: () => string };

function setCapacitor(value: CapacitorGlobal | undefined) {
    (globalThis as { Capacitor?: CapacitorGlobal }).Capacitor = value;
}

afterEach(() => setCapacitor(undefined));

describe('nativePlatform', () => {
    it('is null on the web, where Capacitor injects nothing', () => {
        expect(nativePlatform()).toBeNull();
        expect(isNative()).toBe(false);
    });

    it('reports ios and android inside the app', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
        expect(nativePlatform()).toBe('ios');
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android' });
        expect(nativePlatform()).toBe('android');
    });

    it('treats Capacitor running in a browser tab as web', () => {
        // `npx cap serve` and the Capacitor web target both report platform "web".
        setCapacitor({ isNativePlatform: () => false, getPlatform: () => 'web' });
        expect(nativePlatform()).toBeNull();
    });

    it('does not trust a malformed Capacitor global', () => {
        setCapacitor({});
        expect(nativePlatform()).toBeNull();
        setCapacitor({ isNativePlatform: () => true });
        expect(nativePlatform()).toBeNull();
    });
});

describe('shouldOfferApple', () => {
    it('offers Apple on iOS only — guideline 4.8 requires it there once Google is offered', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
        expect(shouldOfferApple()).toBe(true);
    });

    it('hides it on Android and on the web', () => {
        setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android' });
        expect(shouldOfferApple()).toBe(false);
        setCapacitor(undefined);
        expect(shouldOfferApple()).toBe(false);
    });
});
