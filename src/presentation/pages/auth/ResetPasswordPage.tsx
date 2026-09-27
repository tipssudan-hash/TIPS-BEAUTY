import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { resetPasswordErrorMessage } from '@application/errors';
import { supabase } from '@infrastructure/supabase';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Notice, Spinner, primaryButtonClass } from '../../components/ui';

export const ResetPasswordPage: React.FC = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [checkingSession, setCheckingSession] = useState(true);
    const [hasSession, setHasSession] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    useEffect(() => {
        let isMounted = true;

        // supabase-js parses the hash-fragment token asynchronously — getSession() may return null
        // before that finishes. We rely on onAuthStateChange to catch the PASSWORD_RECOVERY event,
        // and only give up after a generous timeout so there is no flash of the "link expired" UI.
        const checkAuth = async () => {
            const { data } = await supabase.auth.getSession();
            if (!isMounted) return;
            if (data.session) {
                setHasSession(true);
                setCheckingSession(false);
            }
            // If no session yet, don't set checkingSession=false — the onAuthStateChange listener
            // or the timeout below will handle it.
        };

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (!isMounted) return;
            if (event === 'PASSWORD_RECOVERY' || session) {
                setHasSession(true);
                setCheckingSession(false);
            }
        });

        void checkAuth();

        // If neither getSession nor onAuthStateChange resolves within 10s, the link is truly invalid.
        const timeout = window.setTimeout(() => {
            if (isMounted) setCheckingSession(false);
        }, 10_000);

        return () => {
            isMounted = false;
            subscription.unsubscribe();
            window.clearTimeout(timeout);
        };
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
            return;
        }

        if (password !== confirmPassword) {
            setError('كلمتا المرور غير متطابقتين.');
            return;
        }

        setLoading(true);

        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: password,
            });

            if (updateError) throw updateError;
            setSuccess(true);
        } catch (err) {
            setError(resetPasswordErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setLoading(false);
        }
    };

    if (checkingSession) {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <Spinner label="جاري التحقق من الرابط..." />
            </div>
        );
    }

    if (!hasSession && !success) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <ShieldAlert className="w-14 h-14 text-amber-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-gray-800 mb-2">الرابط غير صالح أو منتهي</h1>
                    <p className="text-gray-600 mb-6 text-sm">
                        يبدو أن رابط إعادة تعيين كلمة المرور قد انتهت صلاحيته أو تم استخدامه مسبقاً. يرجى طلب رابط جديد.
                    </p>
                    <Link to="/forgot-password" className={`block w-full text-center ${primaryButtonClass}`}>
                        طلب رابط جديد
                    </Link>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">تم تغيير كلمة المرور بنجاح!</h1>
                    <p className="text-gray-600 mb-6 text-sm">
                        يمكنك الآن تسجيل الدخول باستخدام كلمة المرور الجديدة.
                    </p>
                    <button
                        onClick={() => navigate('/login', { replace: true })}
                        className={`w-full ${primaryButtonClass}`}
                    >
                        تسجيل الدخول الآن
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-800">تعيين كلمة مرور جديدة</h1>
                        <p className="text-gray-500 mt-2 text-sm">
                            أدخلي كلمة المرور الجديدة لحسابك وتأكدي من حفظها
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {error && <Notice kind="error">{error}</Notice>}

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">كلمة المرور الجديدة</span>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all text-sm"
                                    required
                                    minLength={6}
                                />
                                <Lock className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
                                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </label>

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">تأكيد كلمة المرور الجديدة</span>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all text-sm"
                                    required
                                    minLength={6}
                                />
                                <Lock className="w-5 h-5 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <button
                            type="submit"
                            disabled={loading || !password || !confirmPassword}
                            className={`w-full ${primaryButtonClass} flex items-center justify-center gap-2 mt-2`}
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'حفظ كلمة المرور الجديدة'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};
