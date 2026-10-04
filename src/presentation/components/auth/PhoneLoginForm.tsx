import React, { useState, type FC } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Phone, Lock, Loader2, User, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@infrastructure/supabase';
import { normalizeSudanPhone, isValidSudanPhone } from '@infrastructure/auth/phone';
import { resolvePostLoginPath } from '@infrastructure/auth/postLogin';
import { loginErrorMessage, signupErrorMessage } from '@application/errors';
import { Notice, inputClass, primaryButtonClass } from '../ui';

type Props = {
    redirectAfter?: string;
    intent?: 'login' | 'signup';
};

export const PhoneLoginForm: FC<Props> = ({ redirectAfter = '/', intent = 'login' }) => {
    const navigate = useNavigate();
    const [fullName, setFullName] = useState('');
    const [phone, setPhone] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const normalized = normalizeSudanPhone(phone);
        if (!normalized || !isValidSudanPhone(phone)) {
            setError('يرجى إدخال رقم هاتف سوداني صحيح، مثل 0912345678 أو 0123456789.');
            return;
        }

        if (password.length < 6) {
            setError('كلمة المرور يجب أن تكون 6 خانات على الأقل.');
            return;
        }

        if (intent === 'signup') {
            if (!fullName.trim()) {
                setError('يرجى إدخال الاسم الكامل.');
                return;
            }
            if (password !== confirmPassword) {
                setError('كلمة المرور وتأكيد كلمة المرور غير متطابقتين.');
                return;
            }
        }

        setPending(true);

        try {
            if (intent === 'signup') {
                const { data, error: signupError } = await supabase.auth.signUp({
                    phone: normalized,
                    password,
                    options: {
                        data: {
                            full_name: fullName.trim(),
                        },
                    },
                });

                if (signupError) throw signupError;

                if (data.session && data.user) {
                    navigate(await resolvePostLoginPath(data.user.id, redirectAfter), { replace: true });
                } else if (data.user) {
                    // In case auto-confirm is enabled, attempt immediate sign-in
                    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                        phone: normalized,
                        password,
                    });
                    if (signInError) throw signInError;
                    if (signInData.user) {
                        navigate(await resolvePostLoginPath(signInData.user.id, redirectAfter), { replace: true });
                    }
                }
            } else {
                const { data, error: loginError } = await supabase.auth.signInWithPassword({
                    phone: normalized,
                    password,
                });

                if (loginError) throw loginError;
                if (data.user) {
                    navigate(await resolvePostLoginPath(data.user.id, redirectAfter), { replace: true });
                }
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : '';
            setError(intent === 'signup' ? signupErrorMessage(msg) : loginErrorMessage(msg));
        } finally {
            setPending(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Notice kind="error">{error}</Notice>}

            {intent === 'signup' && (
                <label className="space-y-1.5 block">
                    <span className="text-sm font-bold text-gray-700">الاسم الكامل</span>
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="الاسم الثلاثي أو المستعار"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            className={inputClass}
                            required
                        />
                        <User className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    </div>
                </label>
            )}

            <label className="space-y-1.5 block">
                <span className="text-sm font-bold text-gray-700">رقم الهاتف</span>
                <div className="relative">
                    <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0912345678"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={inputClass}
                        dir="ltr"
                        required
                    />
                    <Phone className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                </div>
            </label>

            <label className="space-y-1.5 block">
                <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-gray-700">كلمة المرور</span>
                    {intent === 'login' && (
                        <Link
                            to="/forgot-password"
                            className="text-xs text-brand-blue font-bold hover:underline"
                        >
                            نسيت كلمة المرور؟
                        </Link>
                    )}
                </div>
                <div className="relative">
                    <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={inputClass}
                        dir="ltr"
                        required
                        minLength={6}
                    />
                    <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                    >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                    <Lock className="w-5 h-5 text-gray-300 absolute left-10 top-1/2 -translate-y-1/2" aria-hidden="true" />
                </div>
            </label>

            {intent === 'signup' && (
                <label className="space-y-1.5 block">
                    <span className="text-sm font-bold text-gray-700">تأكيد كلمة المرور</span>
                    <div className="relative">
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="••••••••"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={inputClass}
                            dir="ltr"
                            required
                            minLength={6}
                        />
                        <Lock className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    </div>
                </label>
            )}

            <button
                type="submit"
                disabled={pending}
                className={`${primaryButtonClass} w-full mt-2`}
            >
                {pending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                ) : intent === 'signup' ? (
                    'إنشاء الحساب بالهاتف'
                ) : (
                    'تسجيل الدخول بالهاتف'
                )}
            </button>
        </form>
    );
};

