import { useEffect, useState, type FC } from 'react';
import { WifiOff, RotateCw } from 'lucide-react';
import { isNative } from '../../lib/auth/platform';

// Sudan has had nationwide internet shutdowns every year since 2023, plus routine outages during
// exam season. Without this the app is a silent dead end on those days and customers read it as
// "the app is broken" rather than "the network is down".
//
// Native uses the Network plugin, which reports the real radio state; the web falls back to
// navigator.onLine, which only knows whether an interface exists.
export const OfflineBanner: FC = () => {
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        let cleanup: (() => void) | undefined;

        if (isNative()) {
            void (async () => {
                const { Network } = await import('@capacitor/network');
                const status = await Network.getStatus();
                setOffline(!status.connected);
                const listener = await Network.addListener('networkStatusChange', (next) => {
                    setOffline(!next.connected);
                });
                cleanup = () => { void listener.remove(); };
            })();
        } else {
            const update = () => setOffline(!navigator.onLine);
            update();
            window.addEventListener('online', update);
            window.addEventListener('offline', update);
            cleanup = () => {
                window.removeEventListener('online', update);
                window.removeEventListener('offline', update);
            };
        }

        return () => cleanup?.();
    }, []);

    if (!offline) return null;

    return (
        <div role="status" className="sticky top-0 z-50 bg-amber-50 border-b border-amber-200 px-4 py-3">
            <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
                <span className="flex items-center gap-2 text-sm font-bold text-amber-900">
                    <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                    لا يوجد اتصال بالإنترنت
                </span>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-1.5 text-sm font-bold text-amber-900 underline"
                >
                    <RotateCw className="w-4 h-4" aria-hidden="true" />
                    إعادة المحاولة
                </button>
            </div>
        </div>
    );
};
