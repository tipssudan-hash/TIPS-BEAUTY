import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '@infrastructure/supabase';
import { EmptyState, Notice, primaryButtonClass } from '../ui';

// Ordering needs one verified contact channel — email OR phone (grilled 2026-09-23). A customer who
// signed up with phone OTP has no email to confirm, and blocking her here would make phone sign-up
// pointless. Supabase enforces email confirmation at sign-in when "Confirm email" is on; this guard
// keeps the rule visible in the app itself and offers the resend.
export const VerifiedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, hasVerifiedContact } = useAuth();
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!user || hasVerifiedContact) return <>{children}</>;

    const resend = async () => {
        setError(null);
        const { error: err } = await supabase.auth.resend({ type: 'signup', email: user.email ?? '' });
        if (err) setError('تعذر إرسال رسالة التأكيد، حاولي مرة أخرى بعد قليل.');
        else setSent(true);
    };

    return (
        <div className="max-w-xl mx-auto p-4 md:p-8 space-y-4">
            {sent && <Notice kind="success">أرسلنا رسالة التأكيد إلى {user.email}. افتحيها ثم عودي لإتمام الطلب.</Notice>}
            {error && <Notice kind="error">{error}</Notice>}
            <EmptyState
                icon={<MailCheck className="w-7 h-7" />}
                title="أكّدي بريدك الإلكتروني أولاً"
                body="لإتمام الطلب نحتاج إلى تأكيد بريدك. تحققي من صندوق الوارد أو أعيدي إرسال رسالة التأكيد."
                action={<button type="button" onClick={() => void resend()} disabled={sent} className={primaryButtonClass}>إعادة إرسال رسالة التأكيد</button>}
            />
        </div>
    );
};
