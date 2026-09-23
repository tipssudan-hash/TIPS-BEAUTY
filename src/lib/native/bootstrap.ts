// Native startup. Runs before React mounts, only inside the Capacitor shell — the web build skips
// all of it and never loads these plugins.

import { isNative, nativePlatform } from '../auth/platform';
import { installNativeSocialSignIn } from '../auth/nativeSocial';

export async function bootstrapNative(): Promise<void> {
    if (!isNative()) return;

    // Register the native sign-in strategy before any login screen can render.
    installNativeSocialSignIn();

    const platform = nativePlatform();

    try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        // The Storefront is a light surface (#f8fafc); dark glyphs are the readable pairing.
        await StatusBar.setStyle({ style: Style.Light });
        if (platform === 'android') {
            await StatusBar.setBackgroundColor({ color: '#f8fafc' });
        }
    } catch (error) {
        // A status bar that will not style is cosmetic; never let it stop the app booting.
        console.error('status_bar_init', error);
    }
}

/** Called once React has painted, so customers never see a white flash behind the splash. */
export async function hideNativeSplash(): Promise<void> {
    if (!isNative()) return;
    try {
        const { SplashScreen } = await import('@capacitor/splash-screen');
        await SplashScreen.hide();
    } catch (error) {
        console.error('splash_hide', error);
    }
}
