import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Notice } from '../ui';
import { signInWithSocial, socialSignInAvailable, type SocialProvider } from '../../lib/auth/providers';
import { shouldOfferApple } from '../../lib/auth/platform';
import { socialAuthErrorMessage } from '../../lib/errors';
import { useAuth } from '../../context/AuthContext';

// Google and Apple both publish branding rules that App Review and Google's OAuth verification
// actually check: Google's button is white with the four-colour mark and full-height padding;
// Apple's is solid black with the Apple glyph and may not be smaller or less prominent than any
// other sign-in button on the screen (Sign in with Apple HIG). Hence the hand-rolled marks below
// rather than generic icons.

const GoogleMark: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
);

const AppleMark: React.FC = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
        <path d="M17.05 12.53c-.02-2.2 1.79-3.26 1.87-3.31-1.02-1.49-2.6-1.7-3.17-1.72-1.35-.14-2.63.79-3.32.79-.68 0-1.74-.77-2.86-.75-1.47.02-2.83.85-3.59 2.16-1.53 2.65-.39 6.58 1.1 8.73.73 1.05 1.6 2.23 2.74 2.19 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.71.71 2.87.69 1.19-.02 1.94-1.07 2.66-2.13.84-1.22 1.19-2.4 1.21-2.46-.03-.01-2.32-.89-2.36-3.48zM14.88 5.4c.6-.73 1.01-1.75.9-2.76-.87.04-1.92.58-2.55 1.31-.56.64-1.05 1.68-.92 2.67.97.07 1.96-.49 2.57-1.22z" />
    </svg>
);

type Props = {
    /** Where to return the customer after the provider redirects back. */
    redirectAfter?: string;
    /** Signup screens say "التسجيل" instead of "تسجيل الدخول". */
    intent?: 'login' | 'signup';
};

export const SocialAuthButtons: React.FC<Props> = ({ redirectAfter, intent = 'login' }) => {
    const { authFlags } = useAuth();
    const [pending, setPending] = useState<SocialProvider | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Apple's button belongs on iOS, where guideline 4.8 requires it once Google is offered.
    const showGoogle = authFlags.google;
    const showApple = authFlags.apple && shouldOfferApple();
    if (!showGoogle && !showApple) return null;

    const start = async (provider: SocialProvider) => {
        setError(null);
        if (!socialSignInAvailable()) {
            setError(socialAuthErrorMessage('native_social_sign_in_unavailable'));
            return;
        }
        setPending(provider);
        try {
            // On the web this navigates away and never resolves.
            await signInWithSocial(provider, redirectAfter);
        } catch (err) {
            setError(socialAuthErrorMessage(err instanceof Error ? err.message : ''));
            setPending(null);
        }
    };

    const verb = intent === 'signup' ? 'التسجيل' : 'المتابعة';

    return (
        <div className="space-y-3">
            {error && <Notice kind="error">{error}</Notice>}

            {showGoogle && (
                <button
                    type="button"
                    onClick={() => void start('google')}
                    disabled={pending !== null}
                    className="w-full bg-white border border-gray-300 text-gray-700 font-bold py-3.5 rounded-control flex items-center justify-center gap-3 transition-all hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {pending === 'google' ? <Loader2 className="w-5 h-5 animate-spin" /> : <GoogleMark />}
                    <span>{verb} باستخدام Google</span>
                </button>
            )}

            {showApple && (
                <button
                    type="button"
                    onClick={() => void start('apple')}
                    disabled={pending !== null}
                    className="w-full bg-black text-white font-bold py-3.5 rounded-control flex items-center justify-center gap-3 transition-all hover:bg-gray-900 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    {pending === 'apple' ? <Loader2 className="w-5 h-5 animate-spin" /> : <AppleMark />}
                    <span>{verb} باستخدام Apple</span>
                </button>
            )}
        </div>
    );
};
