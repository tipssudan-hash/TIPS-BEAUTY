import React, { useEffect, useState } from 'react';
import { TrendingUp, Loader2, RefreshCw, Package, Truck, Banknote, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { fetchWarehouseSettlement, type WarehouseSettlementSummary } from '../../lib/adminApi';
import { formatSDG, formatDate } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Card, Notice, PageHeader } from '../../components/ui';

function isoDate(d: Date) {
    return d.toISOString().split('T')[0];
}

const KpiCard: React.FC<{ label: string; value: string; sub?: string; icon: React.ReactNode; accent: string }> = ({ label, value, sub, icon, accent }) => (
    <div className={`relative overflow-hidden rounded-2xl p-5 ${accent} border`}>
        <div className="flex items-start justify-between">
            <div>
                <p className="text-xs font-bold text-current opacity-70 mb-1">{label}</p>
                <p className="text-2xl font-black">{value}</p>
                {sub && <p className="text-xs font-bold opacity-60 mt-0.5">{sub}</p>}
            </div>
            <div className="opacity-30 mt-0.5">{icon}</div>
        </div>
    </div>
);

export const WarehousePerformancePage: React.FC = () => {
    const [start, setStart] = useState(() => isoDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
    const [end, setEnd] = useState(() => isoDate(new Date()));
    const [summary, setSummary] = useState<WarehouseSettlementSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchWarehouseSettlement(start, end);
            setSummary(data);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل بيانات الأداء.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const deliveryRate = summary && summary.total_orders > 0
        ? Math.round((summary.delivered_orders / summary.total_orders) * 100)
        : 0;

    return (
        <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
            <PageHeader
                title="أداء المخازن"
                subtitle="ملخص الإيرادات والتوصيل والعهد النقدية"
                icon={<TrendingUp className="w-6 h-6 text-emerald-500" />}
            />

            <Card className="p-5">
                <div className="flex flex-wrap items-end gap-4">
                    <label className="block">
                        <span className="text-xs font-bold text-slate-500 mb-1 block">من</span>
                        <input
                            type="date"
                            value={start}
                            max={end}
                            onChange={(e) => setStart(e.target.value)}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </label>
                    <label className="block">
                        <span className="text-xs font-bold text-slate-500 mb-1 block">إلى</span>
                        <input
                            type="date"
                            value={end}
                            min={start}
                            onChange={(e) => setEnd(e.target.value)}
                            className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </label>
                    <button
                        onClick={() => void load()}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-sm font-black rounded-xl hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        تحديث
                    </button>
                </div>
            </Card>

            {error && <Notice kind="error">{error}</Notice>}

            {loading && !summary && (
                <div className="flex items-center justify-center py-24 text-slate-400">
                    <Loader2 className="w-8 h-8 animate-spin" />
                </div>
            )}

            {summary && (
                <>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KpiCard
                            label="الطلبات المُسلَّمة"
                            value={`${summary.delivered_orders}`}
                            sub={`معدل التسليم ${deliveryRate}%`}
                            icon={<Package className="w-8 h-8" />}
                            accent="bg-emerald-50 text-emerald-800 border-emerald-100"
                        />
                        <KpiCard
                            label="إجمالي الإيرادات"
                            value={formatSDG(summary.total_revenue)}
                            sub={`رسوم توصيل ${formatSDG(summary.shipping_fees_collected)}`}
                            icon={<Banknote className="w-8 h-8" />}
                            accent="bg-blue-50 text-blue-800 border-blue-100"
                        />
                        <KpiCard
                            label="تحصيل عند الاستلام (COD)"
                            value={formatSDG(summary.cod_collected)}
                            sub="مجموع الدفعات النقدية"
                            icon={<Truck className="w-8 h-8" />}
                            accent="bg-amber-50 text-amber-800 border-amber-100"
                        />
                        <KpiCard
                            label="دفع إلكتروني مؤكد"
                            value={formatSDG(summary.paid_confirmed)}
                            sub={`بانتظار التأكيد ${formatSDG(summary.pending_payment)}`}
                            icon={<CheckCircle2 className="w-8 h-8" />}
                            accent="bg-purple-50 text-purple-800 border-purple-100"
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        <Card className="p-6">
                            <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                                <Banknote className="w-5 h-5 text-emerald-600" /> العهد النقدية
                            </h2>
                            <dl className="space-y-3 text-sm">
                                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
                                    <dt className="font-bold text-slate-600">إجمالي المقدمة</dt>
                                    <dd className="font-black text-slate-900">{formatSDG(summary.cash_remittances.total_submitted)}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50">
                                    <dt className="font-bold text-emerald-700 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> مؤكدة</dt>
                                    <dd className="font-black text-emerald-800">{formatSDG(summary.cash_remittances.total_confirmed)}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-amber-50">
                                    <dt className="font-bold text-amber-700 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> بانتظار التأكيد</dt>
                                    <dd className="font-black text-amber-800">{formatSDG(summary.cash_remittances.pending_confirmation)}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-red-50">
                                    <dt className="font-bold text-red-700 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> مرفوضة</dt>
                                    <dd className="font-black text-red-800">{formatSDG(summary.cash_remittances.rejected)}</dd>
                                </div>
                            </dl>
                        </Card>

                        <Card className="p-6">
                            <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" /> إحصاء الطلبات
                            </h2>
                            <dl className="space-y-3 text-sm">
                                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-50">
                                    <dt className="font-bold text-slate-600">إجمالي الطلبات</dt>
                                    <dd className="font-black text-slate-900">{summary.total_orders}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-emerald-50">
                                    <dt className="font-bold text-emerald-700">مُسلَّمة</dt>
                                    <dd className="font-black text-emerald-800">{summary.delivered_orders}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-red-50">
                                    <dt className="font-bold text-red-700">تعذر التسليم</dt>
                                    <dd className="font-black text-red-800">{summary.failed_orders}</dd>
                                </div>
                                <div className="flex justify-between items-center p-3 rounded-xl bg-slate-100">
                                    <dt className="font-bold text-slate-600">ملغاة</dt>
                                    <dd className="font-black text-slate-800">{summary.cancelled_orders}</dd>
                                </div>
                            </dl>
                        </Card>
                    </div>

                    {summary.driver_performance && summary.driver_performance.length > 0 && (
                        <Card className="overflow-hidden">
                            <h2 className="px-6 py-4 font-black text-slate-900 border-b border-slate-100 flex items-center gap-2">
                                <Truck className="w-5 h-5 text-blue-600" /> أداء المندوبين
                            </h2>
                            <div className="overflow-x-auto">
                                <table className="w-full text-right text-sm">
                                    <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        <tr>
                                            <th className="px-5 py-3">المندوب</th>
                                            <th className="px-5 py-3 text-center">مُسلَّم</th>
                                            <th className="px-5 py-3 text-center">تعذر</th>
                                            <th className="px-5 py-3">COD محصّل</th>
                                            <th className="px-5 py-3">نقد مقدَّم</th>
                                            <th className="px-5 py-3">نقد مؤكد</th>
                                            <th className="px-5 py-3">متبقٍ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {summary.driver_performance.map((d) => {
                                            const pending = d.cash_submitted - d.cash_confirmed;
                                            return (
                                                <tr key={d.driver_id} className="hover:bg-slate-50/50">
                                                    <td className="px-5 py-4 font-bold text-slate-900">{d.driver_name}</td>
                                                    <td className="px-5 py-4 text-center font-bold text-emerald-600">{d.delivered}</td>
                                                    <td className="px-5 py-4 text-center font-bold text-red-500">{d.failed}</td>
                                                    <td className="px-5 py-4 font-bold">{formatSDG(d.cod_collected)}</td>
                                                    <td className="px-5 py-4 font-bold">{formatSDG(d.cash_submitted)}</td>
                                                    <td className="px-5 py-4 font-bold text-emerald-600">{formatSDG(d.cash_confirmed)}</td>
                                                    <td className={`px-5 py-4 font-black ${pending > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                                        {formatSDG(pending)}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            <p className="px-5 py-3 text-[11px] text-slate-400 font-medium border-t border-slate-50">
                                الفترة: {formatDate(start)} — {formatDate(end)}
                            </p>
                        </Card>
                    )}
                </>
            )}
        </div>
    );
};
