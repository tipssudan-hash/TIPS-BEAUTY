import React, { useEffect, useState } from 'react';
import { Truck, Loader2, AlertTriangle } from 'lucide-react';
import { fetchDriverAccountSummaries, type DriverAccountSummary } from '../../lib/adminApi';
import { formatSDG } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Card, Notice, PageHeader } from '../../components/ui';

export const DriverAccountsPage: React.FC = () => {
    const [rows, setRows] = useState<DriverAccountSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        fetchDriverAccountSummaries()
            .then(setRows)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل حسابات المندوبين.')))
            .finally(() => setLoading(false));
    }, []);

    const totalPending = rows.reduce((s, r) => s + r.pending_amount, 0);

    return (
        <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
            <PageHeader
                title="حسابات المندوبين"
                subtitle="ملخص أداء وعهد المندوبين خلال آخر 30 يوماً"
                icon={<Truck className="w-6 h-6 text-blue-500" />}
            />

            {totalPending > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-bold">
                        إجمالي المبالغ غير المستلمة: <span className="font-black">{formatSDG(totalPending)}</span>
                    </p>
                </div>
            )}

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-24 text-slate-400">
                        <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                ) : rows.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <Truck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-bold text-sm">لا توجد بيانات للمندوبين</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-5 py-4">المندوب</th>
                                    <th className="px-5 py-4 text-center">طلبات مسلمة</th>
                                    <th className="px-5 py-4">COD محصّل</th>
                                    <th className="px-5 py-4">نقد مقدَّم</th>
                                    <th className="px-5 py-4">نقد مؤكد</th>
                                    <th className="px-5 py-4">متبقٍ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {rows.map((r) => (
                                    <tr key={r.driver_id} className="hover:bg-slate-50/50">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-900">{r.driver_name}</p>
                                            {r.warehouse_name && <p className="text-[11px] text-slate-400">{r.warehouse_name}</p>}
                                        </td>
                                        <td className="px-5 py-4 text-center font-bold text-emerald-600">{r.total_delivered}</td>
                                        <td className="px-5 py-4 font-bold">{formatSDG(r.total_cod)}</td>
                                        <td className="px-5 py-4 font-bold">{formatSDG(r.total_submitted)}</td>
                                        <td className="px-5 py-4 font-bold text-emerald-600">{formatSDG(r.total_confirmed)}</td>
                                        <td className={`px-5 py-4 font-black ${r.pending_amount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                            {formatSDG(r.pending_amount)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td className="px-5 py-3 font-black text-slate-900">الإجمالي</td>
                                    <td className="px-5 py-3 text-center font-black text-emerald-700">{rows.reduce((s, r) => s + r.total_delivered, 0)}</td>
                                    <td className="px-5 py-3 font-black">{formatSDG(rows.reduce((s, r) => s + r.total_cod, 0))}</td>
                                    <td className="px-5 py-3 font-black">{formatSDG(rows.reduce((s, r) => s + r.total_submitted, 0))}</td>
                                    <td className="px-5 py-3 font-black text-emerald-600">{formatSDG(rows.reduce((s, r) => s + r.total_confirmed, 0))}</td>
                                    <td className={`px-5 py-3 font-black ${totalPending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatSDG(totalPending)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};
