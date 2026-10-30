import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Loader2, Warehouse } from 'lucide-react';
import { fetchFulfillmentBreakdown } from '../../lib/adminApi';
import { errorMessage } from '../../lib/errors';
import { Card, Notice } from '../../components/ui';
import type { FulfillmentBreakdownLine } from '../../types';

interface FulfillmentBreakdownCardProps {
    orderId: string;
}

// Shows which warehouse would supply each line. Other warehouses appear as read-only counts;
// moving stock between warehouses happens on the inventory page.
export const FulfillmentBreakdownCard: React.FC<FulfillmentBreakdownCardProps> = ({ orderId }) => {
    const [lines, setLines] = useState<FulfillmentBreakdownLine[] | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let active = true;
        fetchFulfillmentBreakdown(orderId)
            .then((rows) => { if (active) { setLines(rows); setError(null); } })
            .catch((err) => { if (active) setError(errorMessage(err, 'تعذر تحميل تفصيل التجزئة.')); });
        return () => { active = false; };
    }, [orderId]);

    return (
        <Card className="overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h2 className="font-black text-slate-900">تفصيل التجزئة حسب المستودع</h2>
            </div>
            <div className="p-6 space-y-4">
                {error && <Notice kind="error">{error}</Notice>}
                {!error && lines === null && <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />}
                {lines && lines.length > 0 && (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-3 py-2">المنتج</th>
                                    <th className="px-3 py-2 text-center">المطلوب</th>
                                    <th className="px-3 py-2">المستودع</th>
                                    <th className="px-3 py-2 text-center">المتاح</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {lines.map((line) => {
                                    const short = line.available < line.quantity;
                                    return (
                                        <tr key={`${line.line_no}-${line.warehouse_id}`}>
                                            <td className="px-3 py-3 font-bold text-slate-900">{line.name_ar ?? 'منتج'}</td>
                                            <td className="px-3 py-3 text-center font-bold">{line.quantity}</td>
                                            <td className="px-3 py-3 font-bold text-slate-700">
                                                <span className="inline-flex items-center gap-1">
                                                    <Warehouse className="w-3.5 h-3.5 text-slate-400" />
                                                    {line.warehouse_name}
                                                    {line.is_fulfillment_warehouse && <span className="text-[10px] font-black text-brand-blue">(التجهيز)</span>}
                                                </span>
                                            </td>
                                            <td className={`px-3 py-3 text-center font-black ${short ? 'text-red-600' : 'text-emerald-700'}`}>{line.available}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {lines && lines.length === 0 && <p className="text-sm text-slate-400 font-bold text-center">لا توجد بنود لعرض تفصيلها.</p>}
                <p className="text-xs text-slate-500 font-bold">
                    لنقل الكمية إلى المستودع المجهِّز، استخدم <Link to="/inventory" className="text-brand-blue underline">صفحة المخزون</Link>.
                </p>
            </div>
        </Card>
    );
};
