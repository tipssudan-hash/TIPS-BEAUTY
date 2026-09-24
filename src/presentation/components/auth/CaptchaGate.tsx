import { useEffect, useRef, useState, type FC } from 'react';
import { useAuth } from '../../context/AuthContext';

// hCaptcha, only when the server says so.
//
// The flag defaults to off: friction is the problem this whole project is solving, so a challenge is
// held in reserve for the first time someone abuses the OTP endpoint rather than taxed on every
// customer. Flipping app_settings.auth_captcha_enabled turns it on without a mobile release.
//
// Supabase verifies the token server-side when CAPTCHA protection is enabled on the project; passing a
// token while that is off is simply ignored, so the two can be enabled in either order.

const SCRIPT_ID = 'hcaptcha-api';
const SCRIPT_SRC = 'https://js.hcaptcha.com/1/api.js?render=explicit';

type HCaptcha = {
    render: (container: HTMLElement, options: Record<string, unknown>) => string;
    reset: (widgetId?: string) => void;
};

function hcaptcha(): HCaptcha | undefined {
    return (window as unknown as { hcaptcha?: HCaptcha }).hcaptcha;
}

function loadScript(): Promise<void> {
    if (hcaptcha()) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
        if (existing) {
            existing.addEventListener('load', () => resolve());
            existing.addEventListener('error', () => reject(new Error('hcaptcha_script_failed')));
            return;
        }
        const script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.src = SCRIPT_SRC;
        script.async = true;
        script.defer = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('hcaptcha_script_failed'));
        document.head.appendChild(script);
    });
}

type Props = {
    /** Called with the solved token, or null when it expires or is reset. */
    onToken: (token: string | null) => void;
};

/** Renders nothing unless the CAPTCHA flag is on and a site key is configured. */
export const CaptchaGate: FC<Props> = ({ onToken }) => {
    const { authFlags } = useAuth();
    const container = useRef<HTMLDivElement | null>(null);
    const widget = useRef<string | null>(null);
    const [failed, setFailed] = useState(false);

    const siteKey = import.meta.env.VITE_HCAPTCHA_SITE_KEY as string | undefined;
    const active = authFlags.captcha && Boolean(siteKey);

    useEffect(() => {
        if (!active || !container.current || widget.current) return;
        let cancelled = false;

        void loadScript()
            .then(() => {
                const api = hcaptcha();
                if (cancelled || !api || !container.current) return;
                widget.current = api.render(container.current, {
                    sitekey: siteKey,
                    hl: 'ar',
                    callback: (token: string) => onToken(token),
                    'expired-callback': () => onToken(null),
                    'error-callback': () => onToken(null),
                });
            })
            .catch(() => {
                if (cancelled) return;
                // A blocked or unreachable CDN must not lock customers out of signing in. The server
                // still rejects a missing token if Supabase requires one, so this fails visibly there
                // rather than silently here.
                setFailed(true);
                onToken(null);
            });

        return () => { cancelled = true; };
    }, [active, siteKey, onToken]);

    if (!active) return null;

    return (
        <div className="space-y-2">
            <div ref={container} />
            {failed && <p className="text-xs text-gray-500">تعذر تحميل أداة التحقق، حاولي تحديث الصفحة.</p>}
        </div>
    );
};
