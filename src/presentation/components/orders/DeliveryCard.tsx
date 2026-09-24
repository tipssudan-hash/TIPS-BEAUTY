import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Phone, Truck, MapPin } from 'lucide-react';
import { fetchMyDelivery, type DeliveryView } from '@infrastructure/repositories';
import { formatRelative } from '@application/services/format';
import { Skeleton } from '../ui';

const DeliveryMap = lazy(() => import('./DeliveryMap'));

// Shown on the order page only while the order is on the road: who is bringing it, a call action
// (the number itself is never printed — owner decision), and the driver's last position. Polled
// every 15 s through get_my_delivery, which the backend scopes to the customer's own shipped order.

const POLL_MS = 15_000;

export const DeliveryCard: React.FC<{ orderId: string }> = ({ orderId }) => {
    const [view, setView] = useState<DeliveryView | null | undefined>(undefined);
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        let cancelled = false;
        const load = () => fetchMyDelivery(orderId).then((v) => { if (!cancelled) { setView(v); setNow(new Date()); } }).catch((err) => console.error('get_my_delivery', err));
        void load();
        const timer = setInterval(() => { if (document.visibilityState === 'visible') void load(); }, POLL_MS);
        return () => { cancelled = true; clearInterval(timer); };
    }, [orderId]);

    if (view === undefined) return <Skeleton className="h-28" />;
    if (view === null) return null;

    const hasPosition = view.latitude != null && view.longitude != null;
    const stale = view.locationUpdatedAt ? now.getTime() - new Date(view.locationUpdatedAt).getTime() > 3 * 60_000 : false;

    return (
        <section aria-label="التوصيل الجاري" className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-blue-soft text-brand-blue"><Truck className="w-5 h-5" /></span>
                    <div className="min-w-0">
                        <p className="font-bold text-gray-800">المندوب {view.driverName} في الطريق إليك</p>
                        <p className="text-xs text-gray-500">
                            {hasPosition
                                ? `آخر تحديث للموقع ${formatRelative(view.locationUpdatedAt, now)}${stale ? ' — قد يكون الموقع قديماً' : ''}`
                                : 'بانتظار موقع المندوب…'}
                        </p>
                    </div>
                </div>
                <a href={`tel:${view.driverPhone}`} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-control bg-brand-blue px-4 text-sm font-bold text-white hover:bg-blue-700 transition-colors">
                    <Phone className="w-4 h-4" /> اتصال بالمندوب
                </a>
            </div>
            {hasPosition ? (
                <div className="px-5 pb-5">
                    <Suspense fallback={<Skeleton className="h-56" />}>
                        <DeliveryMap latitude={Number(view.latitude)} longitude={Number(view.longitude)} accuracy={view.accuracyMeters} />
                    </Suspense>
                </div>
            ) : (
                <div className="mx-5 mb-5 flex items-center gap-2 rounded-card border border-dashed border-gray-200 p-4 text-sm text-gray-500"><MapPin className="w-4 h-4" /> سيظهر موقع المندوب هنا عند بدء مشاركته.</div>
            )}
        </section>
    );
};
