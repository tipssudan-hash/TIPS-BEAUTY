import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { Mail, Lock, User, Phone, Loader2, MailCheck } from 'lucide-react';

function signupErrorMessage(message: string): string {
    if (/already registered|already exists/i.test(message)) return 'هذا البريد الإلكتروني مسجل بالفعل';
    if (/password/i.test(message)) return 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (/rate limit/i.test(message)) return 'تم تجاوز عدد المحاولات، حاولي لاحقاً';
    return 'فشل إنشاء الحساب، حاولي مرة أخرى.';
}

export const SignupPage: React.FC = () => {
    const navigate = useNavigate();
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
                    emailRedirectTo: `${window.location.origin}/login`,
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
                    <p className="text-gray-600 mb-6">تم إنشاء الحساب، افتحي بريدك الإلكتروني وأكدي الحساب قبل تسجيل الدخول</p>
                    <p className="text-xs text-gray-400 mb-6">{formData.email}</p>
                    <Link to="/login" className="inline-block bg-brand-blue text-white font-bold py-3 px-8 rounded-xl">
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

                    <form onSubmit={handleSignup} className="space-y-4">
                        {error && (
                            <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">
                                {error}
                            </div>
                        )}

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
