import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RotateCcw, X } from 'lucide-react';
import { Order, OrderReturn, OrderStatusEntry, ReturnItem, ReturnResolution } from '@domain/entities';
import { fetchOrderReturns, requestReturn } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { formatDateTime } from '@application/services/format';
import { Card, Notice, StatusPill, inputClass, primaryButtonClass, secondaryButtonClass } from '../ui';

const RETURN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const RETURN_STATUS_LABELS: Record<OrderReturn['status'], string> = {
    requested: 'قيد المراجعة',
    approved: 'تمت الموافقة',
    rejected: 'مرفوض',
    received: 'تم استلام المنتج',
    refunded: 'تم استرداد المبلغ',
    closed: 'مغلق',
};

const RETURN_STATUS_TONE: Record<OrderReturn['status'], 'success' | 'attention' | 'danger' | 'neutral'> = {
    requested: 'attention',
    approved: 'success',
    rejected: 'danger',
    received: 'attention',
    refunded: 'success',
    closed: 'neutral',
};

// Active = still occupies the item against a future request; rejected/closed free it up again.
const isActiveReturn = (r: OrderReturn) => r.status !== 'rejected' && r.status !== 'closed';

export const ReturnSection: React.FC<{ order: Order; history: OrderStatusEntry[] }> = ({ order, history }) => {
    const [returns, setReturns] = useState<OrderReturn[] | undefined>(undefined);
    const [showForm, setShowForm] = useState(false);
    const [selected, setSelected] = useState<Record<string, number>>({});
    const [resolution, setResolution] = useState<ReturnResolution>('refund');
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    // Frozen at mount rather than read live during render (react-hooks/purity) — the window
    // doesn't need to tick down to the second, just stay stable across this page's re-renders.
    const [now] = useState(() => Date.now());

    const load = useCallback(() => fetchOrderReturns(order.id).then(setReturns).catch((err) => console.error('fetchOrderReturns', err)), [order.id]);
    useEffect(() => { void load(); }, [load]);

    const deliveredAt = useMemo(() => {
        const entry = history.filter((h) => h.status === 'delivered').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
        return entry ? new Date(entry.createdAt) : null;
    }, [history]);
    const withinWindow = !!deliveredAt && now - deliveredAt.getTime() <= RETURN_WINDOW_MS;

    const returnedQuantityById = useMemo(() => {
        const map = new Map<string, number>();
        for (const r of returns ?? []) {
            if (!isActiveReturn(r)) continue;
            for (const item of r.items) map.set(item.id, (map.get(item.id) ?? 0) + item.quantity);
        }
        return map;
    }, [returns]);

    const returnableItems = useMemo(() => order.items
        .map((item) => ({ ...item, remaining: item.quantity - (returnedQuantityById.get(item.id) ?? 0) }))
        .filter((item) => item.remaining > 0), [order.items, returnedQuantityById]);

    const canRequest = order.status === 'delivered' && withinWindow && returnableItems.length > 0;

    const toggleItem = (id: string, remaining: number) => {
        setSelected((prev) => {
            const next = { ...prev };
            if (id in next) delete next[id]; else next[id] = Math.min(1, remaining);
            return next;
        });
    };

    const setQuantity = (id: string, qty: number, remaining: number) => {
        setSelected((prev) => ({ ...prev, [id]: Math.max(1, Math.min(qty, remaining)) }));
    };

    const resetForm = () => { setSelected({}); setResolution('refund'); setReason(''); setNote(''); setError(null); };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const items: ReturnItem[] = Object.entries(selected).map(([id, quantity]) => {
            const source = order.items.find((i) => i.id === id);
            return { id, quantity, name_ar: source?.name_ar, variant_name: source?.variant_name };
        });
        if (items.length === 0) { setError('يرجى اختيار منتج واحد على الأقل.'); return; }
        if (reason.trim().length < 5) { setError('يرجى كتابة سبب الإرجاع (5 أحرف على الأقل).'); return; }
        setSubmitting(true);
        setError(null);
        try {
            await requestReturn({ orderId: order.id, items, reason, requestedResolution: resolution, customerNote: note });
            resetForm();
            setShowForm(false);
            setSuccess('تم إرسال طلب الإرجاع بنجاح وسيتم مراجعته قريباً.');
            await load();
        } catch (err) {
            setError(errorMessage(err, 'تعذر إرسال طلب الإرجاع.'));
        } finally {
            setSubmitting(false);
        }
    };

    if (returns === undefined) return null;

    return (
        <Card className="p-6 space-y-4">
            <div className="flex items-center justify-between gap-3">
                <h2 className="font-bold text-gray-800">الإرجاع</h2>
                {canRequest && !showForm && (
                    <button type="button" onClick={() => setShowForm(true)} className={`${secondaryButtonClass} flex items-center gap-2 text-sm py-2 px-4`}>
                        <RotateCcw className="w-4 h-4" /> طلب إرجاع
                    </button>
                )}
            </div>

            {success && <Notice kind="success">{success}</Notice>}

            {returns.length > 0 && (
                <ul className="space-y-3">
                    {returns.map((r) => (
                        <li key={r.id} className="rounded-card border border-gray-100 bg-gray-50/60 p-4 text-sm space-y-1.5">
                            <div className="flex items-center justify-between gap-3">
                                <StatusPill tone={RETURN_STATUS_TONE[r.status]}>{RETURN_STATUS_LABELS[r.status]}</StatusPill>
                                <span className="text-xs text-gray-500">{formatDateTime(r.createdAt)}</span>
                            </div>
                            <p className="text-gray-700">
                                {r.items.map((i) => i.name_ar ?? 'منتج').join('، ')} — {r.requestedResolution === 'refund' ? 'استرداد المبلغ' : 'استبدال'}
                            </p>
                            <p className="text-xs text-gray-500">{r.reason}</p>
                            {r.status === 'rejected' && r.adminNote && <p className="text-xs text-red-600">سبب الرفض: {r.adminNote}</p>}
                        </li>
                    ))}
                </ul>
            )}

            {!canRequest && returns.length === 0 && order.status === 'delivered' && !withinWindow && (
                <p className="text-xs text-gray-500">انتهت مهلة طلب الإرجاع (7 أيام من تاريخ التوصيل).</p>
            )}

            {showForm && (
                <form onSubmit={handleSubmit} className="space-y-3 border-t border-gray-100 pt-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-bold text-gray-700">اختاري المنتجات المراد إرجاعها</p>
                        <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
                    </div>
                    <ul className="space-y-2">
                        {returnableItems.map((item) => (
                            <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                                <label className="flex items-center gap-2 flex-1 min-w-0">
                                    <input type="checkbox" checked={item.id in selected} onChange={() => toggleItem(item.id, item.remaining)} className="shrink-0" />
                                    <span className="truncate">{item.name_ar ?? 'منتج'}{item.variant_name ? ` (${item.variant_name})` : ''}</span>
                                </label>
                                {item.id in selected && item.remaining > 1 && (
                                    <input
                                        type="number" min={1} max={item.remaining} value={selected[item.id]}
                                        onChange={(e) => setQuantity(item.id, Number(e.target.value), item.remaining)}
                                        className="w-16 shrink-0 bg-gray-50 border border-gray-200 rounded-control p-1.5 text-center outline-none focus:ring-2 focus:ring-brand-blue"
                                    />
                                )}
                            </li>
                        ))}
                    </ul>

                    <div className="flex gap-4 text-sm">
                        <label className="flex items-center gap-1.5"><input type="radio" name="resolution" checked={resolution === 'refund'} onChange={() => setResolution('refund')} /> استرداد المبلغ</label>
                        <label className="flex items-center gap-1.5"><input type="radio" name="resolution" checked={resolution === 'exchange'} onChange={() => setResolution('exchange')} /> استبدال</label>
                    </div>

                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">سبب الإرجاع</label>
                        <textarea required minLength={5} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">ملاحظات إضافية (اختياري)</label>
                        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputClass} />
                    </div>

                    {error && <Notice kind="error">{error}</Notice>}

                    <button type="submit" disabled={submitting} className={`${primaryButtonClass} w-full`}>
                        {submitting ? 'جاري الإرسال...' : 'إرسال طلب الإرجاع'}
                    </button>
                </form>
            )}
        </Card>
    );
};
