import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, Notice, Spinner, primaryButtonClass } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { resolvePostLoginPath } from '../../lib/auth/postLogin';
import { socialAuthErrorMessage } from '../../lib/errors';

// Where the provider returns web customers after Google or Apple sign-in. supabase-js exchanges the
// code in the URL for a session on its own; this page waits for that to land, then routes the
// customer on — Drivers to their own shell, everyone else back where they started.
//
// Native builds never reach here: they get an id_token from the platform SDK instead of a redirect.
export const AuthCallbackPage: React.FC = () => {
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const next = params.get('next') || '/';

        // The provider reports refusals in the query string rather than by failing the redirect.
        const providerError = params.get('error_description') || params.get('error');
        if (providerError) {
            setError(socialAuthErrorMessage(providerError));
            return;
        }

        const finish = async () => {
            const { data, error: sessionError } = await supabase.auth.getSession();
            if (cancelled) return;
            if (sessionError) {
                setError(socialAuthErrorMessage(sessionError.message));
                return;
            }
            if (!data.session) return; // still exchanging; the auth listener below will call again
            navigate(await resolvePostLoginPath(data.session.user.id, next), { replace: true });
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session) void finish();
        });
        void finish();

        // A session that never arrives would otherwise spin forever.
        const timeout = window.setTimeout(() => {
            if (!cancelled) setError(socialAuthErrorMessage(''));
        }, 15_000);

        return () => {
            cancelled = true;
            subscription.unsubscribe();
            window.clearTimeout(timeout);
        };
    }, [navigate, params]);

    if (error) {
        return (
            <div className="max-w-md mx-auto p-4 md:p-8 space-y-4">
                <Notice kind="error">{error}</Notice>
                <EmptyState
                    icon={<ShieldAlert className="w-7 h-7" />}
                    title="تعذر إكمال تسجيل الدخول"
                    body="يمكنك المحاولة مرة أخرى أو تسجيل الدخول بالبريد الإلكتروني وكلمة المرور."
                    action={<Link to="/login" className={primaryButtonClass}>العودة لتسجيل الدخول</Link>}
                />
            </div>
        );
    }

    return (
        <div className="min-h-[60vh] flex items-center justify-center">
            <Spinner label="جاري إكمال تسجيل الدخول..." />
        </div>
    );
};
