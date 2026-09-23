import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingBag, DollarSign, PackageCheck, Clock, Plus, AlertTriangle, MapPin } from 'lucide-react';
import { fetchBusinessReport, type BusinessReport } from '../lib/adminApi';
import { formatNumber, formatSDG } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { Card, Notice, Spinner } from '../components/ui';

const DAYS = 30;

const KPI_STYLES = {
    blue: { blob: 'bg-blue-50', icon: 'bg-blue-50 text-blue-600 border-blue-100' },
    emerald: { blob: 'bg-emerald-50', icon: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    amber: { blob: 'bg-amber-50', icon: 'bg-amber-50 text-amber-600 border-amber-100' },
    purple: { blob: 'bg-purple-50', icon: 'bg-purple-50 text-purple-600 border-purple-100' },
} as const;

export const AdminDashboard: React.FC = () => {
    const [report, setReport] = useState<BusinessReport | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const end = new Date();
        const start = new Date(end.getTime() - DAYS * 24 * 60 * 60 * 1000);
        fetchBusinessReport(start, end)
            .then(setReport)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل التقرير.')));
    }, []);

    const kpiCards = report ? [
        { label: 'الإيرادات (غير الملغاة)', value: formatSDG(report.revenue), icon: DollarSign, color: 'blue' as const },
        { label: 'الإيرادات المدفوعة', value: formatSDG(report.paid_revenue), icon: PackageCheck, color: 'emerald' as const },
        { label: 'عدد الطلبات', value: formatNumber(report.orders), icon: ShoppingBag, color: 'purple' as const },
        { label: 'مدفوعات بانتظار المراجعة', value: formatNumber(report.pending_payments), icon: Clock, color: 'amber' as const },
    ] : [];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">نظرة عامة على العمل</h1>
                    <p className="text-slate-500 font-medium mt-1">آخر {DAYS} يوماً</p>
                </div>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            {!report && !error && <Spinner />}

            {report && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {kpiCards.map((card) => (
                            <Card key={card.label} className="p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                                <div className={`absolute top-0 right-0 w-24 h-24 ${KPI_STYLES[card.color].blob} rounded-full -mr-12 -mt-12 opacity-50 group-hover:scale-110 transition-transform`}></div>
                                <div className="relative">
                                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 border ${KPI_STYLES[card.color].icon}`}>
                                        <card.icon className="w-6 h-6" />
                                    </div>
                                    <p className="text-sm font-bold text-slate-500 mb-1">{card.label}</p>
                                    <h3 className="text-2xl font-black text-slate-900">{card.value}</h3>
                                </div>
                            </Card>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                        <Card className="p-8">
                            <h3 className="text-xl font-black text-slate-900 mb-6">إجراءات سريعة</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <Link to="/orders?status=new" className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-blue-50 hover:border-blue-100 hover:text-brand-blue transition-all group">
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><ShoppingBag className="w-6 h-6" /></div>
                                    <span className="font-bold text-sm">الطلبات الجديدة</span>
                                </Link>
                                <Link to="/products/new" className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-emerald-50 hover:border-emerald-100 hover:text-emerald-600 transition-all group">
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Plus className="w-6 h-6" /></div>
                                    <span className="font-bold text-sm">إضافة منتج</span>
                                </Link>
                                <Link to="/orders?payment=proof_submitted" className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-amber-50 hover:border-amber-100 hover:text-amber-600 transition-all group">
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><Clock className="w-6 h-6" /></div>
                                    <span className="font-bold text-sm">مراجعة المدفوعات</span>
                                </Link>
                                <Link to="/orders?status=delivered" className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-50 border border-slate-100 text-slate-700 hover:bg-purple-50 hover:border-purple-100 hover:text-purple-600 transition-all group">
                                    <div className="p-3 bg-white rounded-xl shadow-sm"><PackageCheck className="w-6 h-6" /></div>
                                    <span className="font-bold text-sm">تم التوصيل ({formatNumber(report.delivered_orders)})</span>
                                </Link>
                            </div>
                        </Card>

                        <Card className="p-8">
                            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><MapPin className="w-5 h-5 text-brand-blue" /> الطلبات حسب المحلية</h3>
                            {report.by_city.length === 0 ? (
                                <p className="text-sm text-slate-400 font-bold">لا توجد طلبات في هذه الفترة.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {report.by_city.slice(0, 8).map((row) => (
                                        <li key={row.city} className="flex items-center justify-between text-sm">
                                            <span className="font-bold text-slate-800">{row.city}</span>
                                            <span className="text-slate-500">{formatNumber(row.orders)} طلب · <span className="font-black text-slate-900">{formatSDG(row.revenue)}</span></span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>

                        <Card className="p-8">
                            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> مخزون منخفض</h3>
                            {report.low_stock.length === 0 ? (
                                <p className="text-sm text-slate-400 font-bold">لا توجد منتجات تحت حد إعادة الطلب.</p>
                            ) : (
                                <ul className="space-y-3">
                                    {report.low_stock.map((row) => (
                                        <li key={`${row.product_id}-${row.warehouse}`} className="flex items-center justify-between text-sm gap-3">
                                            <span className="min-w-0">
                                                <span className="font-bold text-slate-800 block truncate">{row.product_name}</span>
                                                <span className="text-xs text-slate-400">{row.warehouse}</span>
                                            </span>
                                            <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-black ${row.quantity === 0 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                                {formatNumber(row.quantity)} / {formatNumber(row.reorder_level)}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </Card>
                    </div>
                </>
            )}
        </div>
    );
};
