import { useCallback, useEffect, useState, type FC } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, KeyRound, Loader2 } from 'lucide-react';
import { supabase } from '@infrastructure/supabase';
import { normalizeSudanPhone, formatSudanPhone, isValidSudanPhone, SUDAN_DIALLING_CODE } from '@infrastructure/auth/phone';
import { resolvePostLoginPath } from '@infrastructure/auth/postLogin';
import { otpErrorMessage } from '@application/errors';
import { Notice, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui';
import { CaptchaGate } from './CaptchaGate';

// Phone sign-in: the lowest-friction door, and the one that works for a customer with no email.
//
// Supabase generates and verifies the code; delivery is our send-otp hook (WhatsApp first, SMS
// fallback). The same call covers sign-up and sign-in — a number that has never been seen creates the
// account — which is exactly why it is the shortest path to a first order.

const RESEND_SECONDS = 60;

type Props = { redirectAfter?: string };

export const PhoneLoginForm: FC<Props> = ({ redirectAfter = '/' }) => {
    const navigate = useNavigate();
    const [phone, setPhone] = useState('');
    const [code, setCode] = useState('');
    const [stage, setStage] = useState<'phone' | 'code'>('phone');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [cooldown, setCooldown] = useState(0);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);

    useEffect(() => {
        if (cooldown <= 0) return;
        const timer = window.setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
        return () => window.clearTimeout(timer);
    }, [cooldown]);

    // Stable identity so CaptchaGate's effect does not re-render the widget on every keystroke.
    const onToken = useCallback((token: string | null) => setCaptchaToken(token), []);

    const sendCode = async () => {
        const normalized = normalizeSudanPhone(phone);
        if (!normalized) {
            setError('أدخلي رقم هاتف سوداني صحيح، مثل 0912345678');
            return;
        }
        setPending(true);
        setError(null);
        try {
            const { error: sendError } = await supabase.auth.signInWithOtp({
                phone: normalized,
                options: captchaToken ? { captchaToken } : undefined,
            });
            if (sendError) throw sendError;
            setStage('code');
            setCooldown(RESEND_SECONDS);
        } catch (err) {
            setError(otpErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setPending(false);
        }
    };

    const verify = async () => {
        const normalized = normalizeSudanPhone(phone);
        if (!normalized) return;
        setPending(true);
        setError(null);
        try {
            const { data, error: verifyError } = await supabase.auth.verifyOtp({
                phone: normalized,
                token: code.trim(),
                type: 'sms',
            });
            if (verifyError) throw verifyError;
            if (!data.user) throw new Error('verification_failed');
            navigate(await resolvePostLoginPath(data.user.id, redirectAfter), { replace: true });
        } catch (err) {
            setError(otpErrorMessage(err instanceof Error ? err.message : ''));
        } finally {
            setPending(false);
        }
    };

    if (stage === 'code') {
        return (
            <div className="space-y-6">
                {error && <Notice kind="error">{error}</Notice>}

                <p className="text-sm text-gray-500">
                    أرسلنا رمز التحقق إلى <span className="font-bold text-gray-700">{formatSudanPhone(phone)}</span>
                </p>

                <label className="space-y-2 block">
                    <span className="text-sm font-bold text-gray-700">رمز التحقق</span>
                    <div className="relative">
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={6}
                            value={code}
                            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                            className={`${inputClass} tracking-[0.5em] text-center`}
                            dir="ltr"
                            required
                        />
                        <KeyRound className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                    </div>
                </label>

                <button
                    type="button"
                    onClick={() => void verify()}
                    disabled={pending || code.length < 6}
                    className={`${primaryButtonClass} w-full`}
                >
                    {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'تأكيد الرمز'}
                </button>

                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <button
                        type="button"
                        onClick={() => void sendCode()}
                        disabled={pending || cooldown > 0}
                        className="text-brand-blue font-bold disabled:text-gray-400"
                    >
                        {/* A visible countdown, because the server enforces the same cooldown and a
                            silent refusal would read as a broken button. */}
                        {cooldown > 0 ? `إعادة الإرسال بعد ${cooldown} ثانية` : 'إعادة إرسال الرمز'}
                    </button>
                    <button
                        type="button"
                        onClick={() => { setStage('phone'); setCode(''); setError(null); }}
                        disabled={pending}
                        className={secondaryButtonClass}
                    >
                        تغيير الرقم
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form
            onSubmit={(event) => { event.preventDefault(); void sendCode(); }}
            className="space-y-6"
        >
            {error && <Notice kind="error">{error}</Notice>}

            <label className="space-y-2 block">
                <span className="text-sm font-bold text-gray-700">رقم الهاتف</span>
                <div className="relative">
                    <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="0912345678"
                        value={phone}
                        onChange={(event) => setPhone(event.target.value)}
                        className={inputClass}
                        dir="ltr"
                        required
                    />
                    <Phone className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                </div>
                <span className="text-xs text-gray-400">
                    نرسل رمز التحقق عبر واتساب أو رسالة نصية. الأرقام السودانية فقط ({SUDAN_DIALLING_CODE}).
                </span>
            </label>

            <CaptchaGate onToken={onToken} />

            <button
                type="submit"
                disabled={pending || !isValidSudanPhone(phone)}
                className={`${primaryButtonClass} w-full`}
            >
                {pending ? <Loader2 className="w-5 h-5 animate-spin" /> : 'إرسال رمز التحقق'}
            </button>
        </form>
    );
};
