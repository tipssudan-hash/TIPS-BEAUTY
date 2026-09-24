import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signupErrorMessage } from '@application/errors';
import { supabase } from '@infrastructure/supabase';
import { Mail, Lock, User, Phone, Loader2, MailCheck } from 'lucide-react';
import { Notice } from '../../components/ui';
import { SocialAuthButtons } from '../../components/auth/SocialAuthButtons';
import { useAuth } from '../../context/AuthContext';

export const SignupPage: React.FC = () => {
    const navigate = useNavigate();
    const { authFlags } = useAuth();
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        fullName: '',
        phone: ''
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error: authError } = await supabase.auth.signUp({
                email: formData.email,
                password: formData.password,
                options: {
                    emailRedirectTo: `${window.location.origin}/auth/callback`,
                    data: {
                        full_name: formData.fullName,
                        phone: formData.phone
                    }
                }
            });

            if (authError) throw authError;

            if (data.session) {
                navigate('/');
            } else {
                setAwaitingConfirmation(true);
            }
        } catch (err) {
            setError(signupErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    if (awaitingConfirmation) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <MailCheck className="w-14 h-14 text-green-600 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-gray-800 mb-2">تم إنشاء الحساب</h1>
                    <p className="text-gray-600 mb-6">تم إرسال رابط التأكيد إلى بريدك الإلكتروني. يرجى فتح البريد الإلكتروني وتأكيد الحساب لتسجيل الدخول.</p>
                    <p className="text-xs text-gray-400 mb-6 bg-gray-50 py-2 rounded-lg">{formData.email}</p>
                    <Link to="/login" className="inline-block bg-brand-blue text-white font-bold py-3 px-8 rounded-xl hover:bg-blue-700 transition-colors">
                        الذهاب لتسجيل الدخول
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-800">انضمي لعائلة تيبس</h1>
                        <p className="text-gray-500 mt-2">أنشئي حسابك واستمتعي بتجربة تسوق مميزة</p>
                    </div>

                    <SocialAuthButtons intent="signup" />

                    {(authFlags.google || authFlags.apple) && (
                        <div className="flex items-center gap-3 my-6" aria-hidden="true">
                            <span className="h-px bg-gray-200 flex-1" />
                            <span className="text-xs text-gray-400">أو</span>
                            <span className="h-px bg-gray-200 flex-1" />
                        </div>
                    )}

                    <form onSubmit={handleSignup} className="space-y-4">
                        {error && <Notice kind="error">{error}</Notice>}

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">الاسم الكامل</span>
                            <div className="relative">
                                <input
                                    name="fullName"
                                    value={formData.fullName}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                    required
                                />
                                <User className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">البريد الإلكتروني</span>
                            <div className="relative">
                                <input
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                    required
                                />
                                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">رقم الهاتف</span>
                            <div className="relative">
                                <input
                                    type="tel"
                                    name="phone"
                                    value={formData.phone}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                />
                                <Phone className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">كلمة المرور</span>
                            <div className="relative">
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all"
                                    required
                                    minLength={6}
                                />
                                <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-brand-blue hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed mt-4"
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إنشاء حساب'}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm text-gray-500">
                        لديك حساب بالفعل؟{' '}
                        <Link to="/login" className="text-brand-blue font-bold hover:underline">
                            سجلي الدخول
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
