import React, { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { EmptyState, Notice, primaryButtonClass } from '../ui';

// Ordering needs a verified email (PRODUCT.md). Supabase enforces it at sign-in when "Confirm email"
// is on; this guard keeps the rule visible in the app itself and offers the resend.
export const VerifiedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user } = useAuth();
    const [sent, setSent] = useState(false);
    const [error, setError] = useState<string | null>(null);

    if (!user || user.email_confirmed_at) return <>{children}</>;

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
