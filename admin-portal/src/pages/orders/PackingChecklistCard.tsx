import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Minus, Plus, PackageCheck } from 'lucide-react';
import { fetchOrderItemChecks, markOrderPacked, setOrderItemCheck, type AdminOrder } from '../../lib/adminApi';
import { formatDateTime } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Card, Notice } from '../../components/ui';

interface PackingChecklistCardProps {
    order: AdminOrder;
    busy: boolean;
    run: (action: () => Promise<void>) => Promise<void>;
}

// line_no is the 1-based position of the item in orders.items, matching get_my_deliveries' WITH ORDINALITY.
export const PackingChecklistCard: React.FC<PackingChecklistCardProps> = ({ order, busy, run }) => {
    const [checked, setChecked] = useState<Record<number, number>>({});
    const [loadError, setLoadError] = useState<string | null>(null);
    const [checkError, setCheckError] = useState<string | null>(null);
    const [pendingLine, setPendingLine] = useState<number | null>(null);
    const packed = order.packed_at !== null;
    const editable = !packed && (order.status === 'confirmed' || order.status === 'preparing');

    const reloadChecks = useCallback(async () => {
        try {
            const rows = await fetchOrderItemChecks(order.id, 'packing');
            setChecked(Object.fromEntries(rows.map((row) => [row.line_no, row.checked_qty])));
            setLoadError(null);
        } catch (err) {
            setLoadError(errorMessage(err, 'تعذر تحميل قائمة التعبئة.'));
        }
    }, [order.id]);

    useEffect(() => { void reloadChecks(); }, [reloadChecks, order.status, order.packed_at]);

    const lines = order.items.map((item, index) => ({ lineNo: index + 1, item, quantity: Number(item.quantity) }));
    const allChecked = lines.every((line) => (checked[line.lineNo] ?? 0) >= line.quantity);

    const setQty = async (lineNo: number, quantity: number, qty: number) => {
        const next = Math.min(quantity, Math.max(0, qty));
        setPendingLine(lineNo);
        setCheckError(null);
        try {
            await setOrderItemCheck(order.id, lineNo, next);
            await reloadChecks();
        } catch (err) {
            setCheckError(errorMessage(err));
        } finally {
            setPendingLine(null);
        }
    };

    return (
        <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between gap-3">
                <h2 className="font-black text-slate-900 flex items-center gap-2"><PackageCheck className="w-5 h-5 text-brand-blue" /> قائمة التعبئة</h2>
                {packed && (
                    <span className="text-xs font-black text-emerald-700 flex items-center gap-1">
                        <CheckCircle2 className="w-4 h-4" /> تم التجهيز {formatDateTime(order.packed_at)}
                    </span>
                )}
            </div>
            <div className="p-6 space-y-4">
                {loadError && <Notice kind="error">{loadError}</Notice>}
                {checkError && <Notice kind="error">{checkError}</Notice>}
                <ul className="divide-y divide-slate-50">
                    {lines.map(({ lineNo, item, quantity }) => {
                        const count = checked[lineNo] ?? 0;
                        const complete = count >= quantity;
                        const pending = pendingLine === lineNo;
                        return (
                            <li key={`${item.id}-${lineNo}`} className="flex items-center justify-between gap-3 py-3 text-sm">
                                <div className="min-w-0">
                                    <p className="font-bold text-slate-900 truncate">{item.name_ar ?? 'منتج'}</p>
                                    {item.variant_name ? <p className="text-xs font-bold text-slate-500">الخيار: {item.variant_name}</p> : null}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        type="button"
                                        aria-label={`إنقاص ${item.name_ar ?? 'المنتج'}`}
                                        disabled={!editable || busy || pending || count <= 0}
                                        onClick={() => void setQty(lineNo, quantity, count - 1)}
                                        className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 disabled:opacity-40"
                                    >
                                        <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className={`min-w-[64px] text-center font-black ${complete ? 'text-emerald-700' : 'text-slate-700'}`}>
                                        {pending ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `${count} / ${quantity}`}
                                    </span>
                                    <button
                                        type="button"
                                        aria-label={`زيادة ${item.name_ar ?? 'المنتج'}`}
                                        disabled={!editable || busy || pending || complete}
                                        onClick={() => void setQty(lineNo, quantity, count + 1)}
                                        className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center hover:bg-slate-200 disabled:opacity-40"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </li>
                        );
                    })}
                </ul>
                {!packed && (
                    <button
                        type="button"
                        disabled={!editable || busy || !allChecked || pendingLine !== null}
                        onClick={() => void run(() => markOrderPacked(order.id))}
                        className="w-full py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black hover:bg-emerald-700 disabled:opacity-50"
                    >
                        تم التجهيز
                    </button>
                )}
                {!packed && !allChecked && editable && <p className="text-[11px] text-slate-400 text-center">يُفعَّل زر «تم التجهيز» بعد فحص كل البنود بكمياتها كاملة.</p>}
            </div>
        </Card>
    );
};
