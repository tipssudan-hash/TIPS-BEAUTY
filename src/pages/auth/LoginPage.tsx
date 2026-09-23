import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginErrorMessage } from '../../lib/errors';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, Loader2 } from 'lucide-react';
import { Notice } from '../../components/ui';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { PhoneLoginForm } from '../../components/auth/PhoneLoginForm';
import { resolvePostLoginPath } from '../../lib/auth/postLogin';
import { useAuth } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { authFlags } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // With phone sign-in available, email+password is the legacy path: kept fully accessible, but one
    // tap away rather than the first thing a new customer is asked for.
    const [showPasswordForm, setShowPasswordForm] = useState(false);

    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            navigate(await resolvePostLoginPath(data.user.id, from), { replace: true });
        } catch (err) {
            setError(loginErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-800">تواصل مع جمالك</h1>
                        <p className="text-gray-500 mt-2">سجلي الدخول لمتابعة طلباتك ومنتجاتك المفضلة</p>
                    </div>

                    {authFlags.phone && (
                        <div className="mb-6">
                            <PhoneLoginForm redirectAfter={from} />
                        </div>
                    )}

                    {authFlags.phone && (authFlags.google || authFlags.apple || authFlags.password) && (
                        <div className="flex items-center gap-3 my-6" aria-hidden="true">
                            <span className="h-px bg-gray-200 flex-1" />
                            <span className="text-xs text-gray-400">أو</span>
                            <span className="h-px bg-gray-200 flex-1" />
                        </div>
                    )}

                    <SocialAuthButtons redirectAfter={from} />

                    {(authFlags.google || authFlags.apple) && (showPasswordForm || !authFlags.phone) && (
                        <div className="flex items-center gap-3 my-6" aria-hidden="true">
                            <span className="h-px bg-gray-200 flex-1" />
                            <span className="text-xs text-gray-400">أو</span>
                            <span className="h-px bg-gray-200 flex-1" />
                        </div>
                    )}

                    {authFlags.phone && !showPasswordForm && (
                        <button
                            type="button"
                            onClick={() => setShowPasswordForm(true)}
                            className="w-full mt-6 text-sm font-bold text-brand-blue hover:underline"
                        >
                            تسجيل الدخول بالبريد الإلكتروني وكلمة المرور
                        </button>
                    )}

                    <form
                        onSubmit={handleLogin}
                        className={`space-y-6 ${authFlags.phone && !showPasswordForm ? 'hidden' : ''}`}
                    >
                        {error && <Notice kind="error">{error}</Notice>}

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">البريد الإلكتروني</span>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                    required
                                />
                                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">كلمة المرور</span>
                            <div className="relative">
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                    required
                                />
                                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-brand-blue hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تسجيل الدخول'}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm text-gray-500">
                        لا تمتلكين حساباً؟{' '}
                        <Link to="/signup" className="text-brand-blue font-bold hover:underline">
                            سجلي الآن
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
