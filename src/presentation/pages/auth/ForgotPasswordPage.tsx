import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { resetPasswordErrorMessage } from '@application/errors';
import { supabase } from '@infrastructure/supabase';
import { Mail, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { Notice, primaryButtonClass } from '../../components/ui';

export const ForgotPasswordPage: React.FC = () => {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [sent, setSent] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const targetEmail = email.trim();
        if (!targetEmail) return;

        setLoading(true);
        setError(null);

        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(targetEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
            });

            if (resetError) throw resetError;
            setSent(true);
        } catch (err) {
            setError(resetPasswordErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setLoading(false);
        }
    };

    if (sent) {
        return (
            <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
                <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
                    <CheckCircle2 className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                    <h1 className="text-2xl font-bold text-gray-800 mb-2">تم إرسال الرابط</h1>
                    <p className="text-gray-600 mb-6 text-sm leading-relaxed">
                        أرسلنا رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني. يرجى فتح البريد واتباع التعليمات لتعيين كلمة مرور جديدة.
                    </p>
                    <p className="text-xs text-gray-500 font-mono bg-gray-50 py-2.5 px-4 rounded-xl mb-6 border border-gray-100">
                        {email}
                    </p>
                    <div className="space-y-3">
                        <Link to="/login" className={`block w-full text-center ${primaryButtonClass}`}>
                            العودة لتسجيل الدخول
                        </Link>
                        <button
                            type="button"
                            onClick={() => setSent(false)}
                            className="text-xs text-brand-blue font-bold hover:underline"
                        >
                            إعادة إرسال الرابط أو تغيير البريد الإلكتروني
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-gray-800">استعادة كلمة المرور</h1>
                        <p className="text-gray-500 mt-2 text-sm">
                            أدخلي بريدك الإلكتروني وسنرسل لكِ رابطاً لتعيين كلمة مرور جديدة
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && <Notice kind="error">{error}</Notice>}

                        <label className="space-y-2 block">
                            <span className="text-sm font-bold text-gray-700">البريد الإلكتروني</span>
                            <div className="relative">
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all text-sm"
                                    required
                                    autoFocus
                                />
                                <Mail className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            </div>
                        </label>

                        <button
                            type="submit"
                            disabled={loading || !email.trim()}
                            className={`w-full ${primaryButtonClass} flex items-center justify-center gap-2`}
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إرسال رابط الاستعادة'}
                        </button>
                    </form>

                    <div className="mt-8 text-center text-sm text-gray-500 border-t pt-6 flex items-center justify-between">
                        <Link to="/login" className="text-brand-blue font-bold hover:underline flex items-center gap-1">
                            <ArrowRight className="w-4 h-4" />
                            العودة لتسجيل الدخول
                        </Link>
                        <Link to="/signup" className="text-gray-500 hover:text-gray-700 font-medium">
                            حساب جديد
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
};
