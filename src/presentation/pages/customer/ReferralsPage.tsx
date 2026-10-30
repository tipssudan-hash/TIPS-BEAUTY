import React, { useEffect, useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import type { LoyaltyProfile } from '@domain/entities';
import { fetchLoyaltyProfile } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { useAuth } from '../../context/AuthContext';
import { Card, Notice, Skeleton, secondaryButtonClass } from '../../components/ui';
import { usePageMeta } from '../../hooks/usePageMeta';

export const ReferralsPage: React.FC = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    usePageMeta({ title: 'دعوة الأصدقاء | Tips Beauty', noindex: true });

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        fetchLoyaltyProfile(user.id)
            .then(data => { if (!cancelled) setProfile(data); })
            .catch(err => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل رمز الإحالة، حاولي مرة أخرى.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user]);

    useEffect(() => {
        if (!copied) return;
        const timer = setTimeout(() => setCopied(false), 2000);
        return () => clearTimeout(timer);
    }, [copied]);

    const code = profile?.referralCode ?? '';
    const shareText = `جربي Tips Beauty واستخدمي رمز الإحالة ${code} عند التسجيل.`;

    const copyCode = async () => {
        try {
            await navigator.clipboard.writeText(code);
            setCopied(true);
        } catch (err) {
            console.error('Copy referral code failed', err);
        }
    };

    const shareCode = async () => {
        try {
            if (navigator.share) {
                await navigator.share({ title: 'Tips Beauty', text: shareText, url: window.location.origin });
            } else {
                await copyCode();
            }
        } catch (err) {
            console.error('Share referral code failed', err);
        }
    };

    if (loading) {
        return <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8" aria-busy="true"><Skeleton className="h-40 rounded-card" /></div>;
    }

    if (error || !profile) {
        return <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8"><Notice kind="error">{error ?? 'تعذر تحميل رمز الإحالة.'}</Notice></div>;
    }

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">دعوة الأصدقاء</h1>

            <Card className="p-6 sm:p-8 space-y-4">
                <p className="text-sm text-gray-700 leading-relaxed">
                    شاركي رمزك مع صديقاتك. عند تسجيلهن بالرمز تحصلين على نقاط جمال إضافية تستخدمينها في طلباتك.
                </p>
                {code ? (
                    <>
                        <div className="flex items-center justify-between gap-3 rounded-control border border-dashed border-brand-blue bg-brand-blue-soft px-4 py-4">
                            <span className="font-mono text-xl font-black tracking-widest text-brand-blue" dir="ltr">{code}</span>
                            <button type="button" onClick={() => void copyCode()} className="flex items-center gap-1.5 text-sm font-bold text-brand-blue hover:underline" aria-label="نسخ رمز الإحالة">
                                {copied ? <><Check className="w-4 h-4" /> تم النسخ</> : <><Copy className="w-4 h-4" /> نسخ</>}
                            </button>
                        </div>
                        <button type="button" onClick={() => void shareCode()} className={`${secondaryButtonClass} w-full flex items-center justify-center gap-2`}>
                            <Share2 className="w-4 h-4" /> مشاركة الرمز
                        </button>
                    </>
                ) : (
                    <p className="text-sm text-gray-500">رمز الإحالة غير متاح حالياً.</p>
                )}
            </Card>
        </div>
    );
};
