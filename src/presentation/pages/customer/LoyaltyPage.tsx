import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift, Sparkles } from 'lucide-react';
import type { LoyaltyProfile, LoyaltyTier } from '@domain/entities';
import { fetchLoyaltyProfile } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { useAuth } from '../../context/AuthContext';
import { Card, EmptyState, Notice, Skeleton, primaryButtonClass } from '../../components/ui';
import { usePageMeta } from '../../hooks/usePageMeta';

const TIER_LABELS: Record<LoyaltyTier, string> = {
    bronze: 'برونزي',
    silver: 'فضي',
    gold: 'ذهبي',
};

export const LoyaltyPage: React.FC = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<LoyaltyProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    usePageMeta({ title: 'نقاط الجمال | Tips Beauty', noindex: true });

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        fetchLoyaltyProfile(user.id)
            .then(data => { if (!cancelled) setProfile(data); })
            .catch(err => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل نقاطك، حاولي مرة أخرى.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [user]);

    if (loading) {
        return <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8" aria-busy="true"><Skeleton className="h-40 rounded-card" /></div>;
    }

    if (error || !profile) {
        return <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8"><Notice kind="error">{error ?? 'تعذر تحميل نقاطك.'}</Notice></div>;
    }

    return (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-fadeIn">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-800">نقاط الجمال</h1>

            <Card className="p-6 sm:p-8 text-center space-y-2">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue">
                    <Sparkles className="w-7 h-7" />
                </div>
                <p className="text-sm text-gray-500">رصيدك الحالي</p>
                <p className="text-4xl font-black text-brand-blue">{profile.beautyPoints.toLocaleString('ar-EG')} <span className="text-base font-bold">نقطة</span></p>
                <p className="text-xs text-gray-500">
                    المستوى: <span className="font-bold text-gray-800">{TIER_LABELS[profile.loyaltyTier] ?? profile.loyaltyTier}</span>
                    {' · '}
                    إجمالي ما جمعتِه: {profile.lifetimePoints.toLocaleString('ar-EG')} نقطة
                </p>
            </Card>

            {profile.beautyPoints > 0 ? (
                <Card className="p-5 text-sm text-gray-700 leading-relaxed">
                    <p>يمكنك استخدام نقاطك عند إتمام طلبك، في خانة «استخدام النقاط» داخل صفحة الدفع.</p>
                    <Link to="/" className={`${primaryButtonClass} mt-4 w-full`}>تسوقي الآن</Link>
                </Card>
            ) : (
                <EmptyState
                    icon={<Gift className="w-7 h-7" />}
                    title="لا توجد نقاط بعد"
                    body="ستجمعين نقاطاً مع كل طلب، ويمكنك استخدامها في الطلبات القادمة."
                    action={<Link to="/" className={primaryButtonClass}>تسوقي الآن</Link>}
                />
            )}
        </div>
    );
};
