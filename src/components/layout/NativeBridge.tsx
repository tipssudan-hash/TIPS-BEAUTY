import { useEffect, type FC } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNative, nativePlatform } from '../../lib/auth/platform';
import { hideNativeSplash } from '../../lib/native/bootstrap';
import { pathFromDeepLink } from '../../lib/native/deepLinks';
import { registerForPush } from '../../lib/native/push';
import { useAuth } from '../../context/AuthContext';

// Everything that needs both the native shell and the router: incoming Universal Links / App Links,
// and Android's hardware back button. Renders nothing.
//
// On the web this mounts and immediately does nothing, so App.tsx needs no platform branch.
export const NativeBridge: FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { user } = useAuth();

    // Splash stays up until React has painted (launchAutoHide is false in capacitor.config.ts).
    useEffect(() => { void hideNativeSplash(); }, []);

    useEffect(() => {
        if (!isNative()) return;
        let cleanup: (() => void) | undefined;

        void (async () => {
            const { App } = await import('@capacitor/app');

            // https://beauty.tips-sd.com/orders/123 opens the app on that order rather than the site.
            const urlListener = await App.addListener('appUrlOpen', ({ url }) => {
                const path = pathFromDeepLink(url);
                if (path) navigate(path, { replace: false });
            });

            // A link tapped while the app was closed arrives here instead.
            const launch = await App.getLaunchUrl();
            const launchPath = launch?.url ? pathFromDeepLink(launch.url) : null;
            if (launchPath && launchPath !== '/') navigate(launchPath, { replace: true });

            cleanup = () => { void urlListener.remove(); };
        })();

        return () => cleanup?.();
    }, [navigate]);

    useEffect(() => {
        // Only ask for notification permission once there is an account to notify about — and after
        // sign-in, so the token is stored against the right customer. iOS only ever prompts once.
        if (!user) return;
        void registerForPush((path) => navigate(path));
    }, [user, navigate]);

    useEffect(() => {
        if (nativePlatform() !== 'android') return;
        let cleanup: (() => void) | undefined;

        void (async () => {
            const { App } = await import('@capacitor/app');
            const backListener = await App.addListener('backButton', ({ canGoBack }) => {
                // Android's back button must not silently kill the app mid-shopping. Only the home
                // screen exits; everywhere else it walks back through history.
                if (canGoBack && location.pathname !== '/') {
                    navigate(-1);
                } else {
                    void App.exitApp();
                }
            });
            cleanup = () => { void backListener.remove(); };
        })();

        return () => cleanup?.();
    }, [navigate, location.pathname]);

    return null;
};
