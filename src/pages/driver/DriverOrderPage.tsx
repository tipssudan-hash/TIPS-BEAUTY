import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Phone, MapPin, Banknote, PackageCheck, AlertTriangle, Truck, Loader2, StickyNote } from 'lucide-react';
import { useDriver } from './DriverContext';
import { fetchMyDelivery, updateMyDeliveryStatus, type Delivery } from '../../lib/driverApi';
import { errorMessage } from '../../lib/errors';
import { formatSDG } from '../../lib/format';
import { EmptyState, Notice, Spinner, inputClass } from '../../components/ui';
import { cn } from '../../lib/cn';

// One delivery: whom to call, where to go, what to hand over, how much to collect — and the one
// action that fits the current state, pinned to the bottom of the screen.

const FAILURE_REASONS = ['العميل لا يرد', 'العنوان غير صحيح', 'العميل رفض الاستلام', 'العميل طلب التأجيل'];

export const DriverOrderPage: React.FC = () => {
    const { id } = useParams();
    const { deliveries, refresh } = useDriver();
    const [fallback, setFallback] = useState<Delivery | null | undefined>(undefined);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [failing, setFailing] = useState(false);
    const [reason, setReason] = useState(FAILURE_REASONS[0]);
    const [note, setNote] = useState('');

    const fromFeed = deliveries.find((d) => d.id === id);
    useEffect(() => {
        if (fromFeed || !id) return;
        let cancelled = false;
        fetchMyDelivery(id).then((d) => { if (!cancelled) setFallback(d); }).catch(() => { if (!cancelled) setFallback(null); });
        return () => { cancelled = true; };
    }, [id, fromFeed]);
    const delivery = fromFeed ?? fallback;

    if (delivery === undefined) return <Spinner />;
    if (!delivery) return <EmptyState icon={<Truck className="w-7 h-7" />} title="هذا الطلب ليس مسنداً إليك" action={<Link to="/driver" className="text-brand-blue font-bold text-sm hover:underline">العودة إلى توصيلاتي</Link>} />;

    const act = async (status: 'shipped' | 'delivered' | 'delivery_failed') => {
        if (status === 'delivered' && !window.confirm('تأكيد تسليم الطلب للعميل؟')) return;
        setBusy(true);
        setError(null);
        try {
            await updateMyDeliveryStatus(delivery.id, status, status === 'delivery_failed' ? reason : undefined, note.trim() || undefined);
            setFailing(false);
            setNote('');
            await refresh();
            if (fallback) setFallback(await fetchMyDelivery(delivery.id));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحديث حالة الطلب.'));
        } finally {
            setBusy(false);
        }
    };

    const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([delivery.address, delivery.city, delivery.state].filter(Boolean).join('، '))}`;
    const canPickUp = delivery.status === 'confirmed' || delivery.status === 'preparing';
    const onTheRoad = delivery.status === 'shipped';
    const closed = delivery.status === 'delivered' || delivery.status === 'delivery_failed';
    const bigButton = 'flex min-h-14 w-full items-center justify-center gap-2 rounded-xl text-base font-bold transition-colors disabled:opacity-50';

    return (
        <div className="pb-32 space-y-4">
            <Link to="/driver" className="inline-flex items-center gap-1 text-sm font-bold text-brand-blue"><ArrowRight className="w-4 h-4" /> توصيلاتي</Link>

            <section className="rounded-card border border-gray-200 bg-white p-4">
                <p className="text-xs text-gray-500">{delivery.orderNumber}{delivery.warehouseName ? ` · من ${delivery.warehouseName}` : ''}</p>
                <h1 className="mt-1 text-xl font-bold text-gray-900">{delivery.customerName}</h1>
                <p className="mt-2 flex items-start gap-2 text-sm text-gray-700"><MapPin className="mt-0.5 w-4 h-4 shrink-0 text-brand-blue" /> <span>{delivery.address}{delivery.city ? `، ${delivery.city}` : ''}{delivery.state ? `، ${delivery.state}` : ''}</span></p>
                {delivery.notes && <p className="mt-2 flex items-start gap-2 text-sm text-gray-700"><StickyNote className="mt-0.5 w-4 h-4 shrink-0 text-brand-blue" /> <span>{delivery.notes}</span></p>}
                <div className="mt-4 grid grid-cols-2 gap-2">
                    <a href={`tel:${delivery.phone}`} className={cn(bigButton, 'bg-brand-blue text-white')}><Phone className="w-5 h-5" /> اتصال بالعميل</a>
                    <a href={mapsUrl} target="_blank" rel="noopener" className={cn(bigButton, 'border border-gray-300 bg-white text-gray-800')}><MapPin className="w-5 h-5" /> فتح الخريطة</a>
                </div>
            </section>

            {delivery.codAmount != null && (
                <section className="rounded-card border border-status-attention-ground bg-status-attention-ground p-4 text-status-attention-ink">
                    <p className="flex items-center gap-2 text-sm font-bold"><Banknote className="w-5 h-5" /> يُحصَّل نقداً عند التسليم</p>
                    <p className="mt-1 text-2xl font-bold" dir="ltr">{formatSDG(delivery.codAmount)}</p>
                </section>
            )}
            {delivery.codAmount == null && delivery.paymentMethod !== 'COD' && (
                <p className="rounded-card border border-status-success-ground bg-status-success-ground p-3 text-sm font-bold text-status-success-ink">مدفوع مسبقاً — لا تحصيل</p>
            )}

            <section className="rounded-card border border-gray-200 bg-white p-4">
                <h2 className="mb-2 text-sm font-bold text-gray-700">المنتجات ({delivery.itemCount})</h2>
                <ul className="divide-y divide-gray-100 text-sm">
                    {delivery.items.map((item, i) => (
                        <li key={i} className="flex items-center justify-between py-2">
                            <span className="text-gray-800">{item.name_ar}{item.variant_name ? <span className="text-gray-500"> — {item.variant_name}</span> : null}</span>
                            <span className="font-bold text-gray-900">×{item.quantity}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {error && <Notice kind="error">{error}</Notice>}

            {failing && onTheRoad && (
                <section className="rounded-card border border-gray-200 bg-white p-4 space-y-3">
                    <h2 className="text-sm font-bold text-gray-800">سبب تعذر التسليم</h2>
                    <div className="grid gap-2">
                        {FAILURE_REASONS.map((r) => (
                            <label key={r} className={cn('flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm', reason === r ? 'border-brand-blue bg-brand-blue-soft font-bold text-brand-blue' : 'border-gray-200')}>
                                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-brand-blue" /> {r}
                            </label>
                        ))}
                    </div>
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظة إضافية (اختياري)" className={inputClass} aria-label="ملاحظة" />
                </section>
            )}

            <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur-md p-4 pb-safe">
                <div className="max-w-2xl mx-auto space-y-2">
                    {canPickUp && (
                        <button type="button" onClick={() => void act('shipped')} disabled={busy} className={cn(bigButton, 'bg-brand-blue text-white')}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />} استلمت الطلب — بدء التوصيل</button>
                    )}
                    {onTheRoad && !failing && (
                        <>
                            <button type="button" onClick={() => void act('delivered')} disabled={busy} className={cn(bigButton, 'bg-status-success-ink text-white')}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <PackageCheck className="w-5 h-5" />} تم التسليم</button>
                            <button type="button" onClick={() => setFailing(true)} disabled={busy} className={cn(bigButton, 'border border-gray-300 bg-white text-status-danger-ink')}><AlertTriangle className="w-5 h-5" /> تعذر التسليم</button>
                        </>
                    )}
                    {onTheRoad && failing && (
                        <>
                            <button type="button" onClick={() => void act('delivery_failed')} disabled={busy} className={cn(bigButton, 'bg-status-danger-ink text-white')}>{busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <AlertTriangle className="w-5 h-5" />} تأكيد تعذر التسليم</button>
                            <button type="button" onClick={() => setFailing(false)} disabled={busy} className={cn(bigButton, 'border border-gray-300 bg-white text-gray-700')}>رجوع</button>
                        </>
                    )}
                    {closed && <p className="text-center text-sm font-bold text-gray-600">{delivery.status === 'delivered' ? 'تم تسليم هذا الطلب' : 'سُجّل تعذر التسليم؛ الإدارة ستعيد جدولته'}</p>}
                </div>
            </div>
        </div>
    );
};
