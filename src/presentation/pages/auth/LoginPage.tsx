import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { loginErrorMessage } from '@application/errors';
import { supabase } from '@infrastructure/supabase';
import { Mail, Lock, Loader2, Phone, AtSign } from 'lucide-react';
import { Notice } from '../../components/ui';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { PhoneLoginForm } from '../../components/auth/PhoneLoginForm';
import { resolvePostLoginPath } from '@infrastructure/auth/postLogin';
import { useAuth } from '../../context/AuthContext';

export const LoginPage: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { authFlags } = useAuth();
    const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>(authFlags.phone ? 'phone' : 'email');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/';

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
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
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">
                <div className="p-8">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-black text-gray-800">تواصل مع جمالك</h1>
                        <p className="text-gray-500 mt-1.5 text-sm">سجلي الدخول لمتابعة طلباتك ومنتجاتك المفضلة</p>
                    </div>

                    {/* Method Tabs (Phone vs Email) */}
                    {authFlags.phone && (
                        <div className="flex bg-slate-100 p-1 rounded-xl mb-6 gap-1">
                            <button
                                type="button"
                                onClick={() => { setLoginMethod('phone'); setError(null); }}
                                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${loginMethod === 'phone' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                <Phone className="w-3.5 h-3.5" />
                                برقم الهاتف
                            </button>
                            <button
                                type="button"
                                onClick={() => { setLoginMethod('email'); setError(null); }}
                                className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-black flex items-center justify-center gap-1.5 transition-all ${loginMethod === 'email' ? 'bg-white text-brand-blue shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
                            >
                                <AtSign className="w-3.5 h-3.5" />
                                بالبريد الإلكتروني
                            </button>
                        </div>
                    )}

                    {/* Active Form */}
                    {loginMethod === 'phone' && authFlags.phone ? (
                        <div className="mb-6">
                            <PhoneLoginForm redirectAfter={from} intent="login" />
                        </div>
                    ) : (
                        <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
                            {error && <Notice kind="error">{error}</Notice>}

                            <label className="space-y-1.5 block">
                                <span className="text-sm font-bold text-gray-700">البريد الإلكتروني</span>
                                <div className="relative">
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                        placeholder="yourname@example.com"
                                        dir="ltr"
                                        required
                                    />
                                    <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                                </div>
                            </label>

                            <label className="space-y-1.5 block">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-bold text-gray-700">كلمة المرور</span>
                                    <Link
                                        to="/forgot-password"
                                        className="text-xs text-brand-blue font-bold hover:underline"
                                    >
                                        نسيت كلمة المرور؟
                                    </Link>
                                </div>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                        dir="ltr"
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
                    )}

                    {/* Social Auth Divider & Buttons */}
                    {(authFlags.google || authFlags.apple) && (
                        <>
                            <div className="flex items-center gap-3 my-6" aria-hidden="true">
                                <span className="h-px bg-gray-200 flex-1" />
                                <span className="text-xs text-gray-400">أو</span>
                                <span className="h-px bg-gray-200 flex-1" />
                            </div>
                            <SocialAuthButtons redirectAfter={from} />
                        </>
                    )}

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
