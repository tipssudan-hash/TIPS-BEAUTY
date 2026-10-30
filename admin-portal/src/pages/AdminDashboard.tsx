import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ShoppingBag, DollarSign, PackageCheck, Clock, Plus, AlertTriangle, MapPin } from 'lucide-react';
import { fetchBusinessReport, type BusinessReport } from '../lib/adminApi';
import { formatNumber, formatSDG } from '../lib/format';
import { errorMessage } from '../lib/errors';
import { Card, Notice, Spinner, inputClass } from '../components/ui';

type RangeKey = 'today' | '7' | '30' | '90' | 'custom';

const RANGE_OPTIONS: { key: RangeKey; label: string; days: number | null }[] = [
    { key: 'today', label: 'اليوم', days: 1 },
    { key: '7', label: '7 أيام', days: 7 },
    { key: '30', label: '30 يوماً', days: 30 },
    { key: '90', label: '90 يوماً', days: 90 },
    { key: 'custom', label: 'مخصص', days: null },
];

const KPI_STYLES = {
    blue: { blob: 'bg-blue-50', icon: 'bg-blue-50 text-blue-600 border-blue-100' },
    emerald: { blob: 'bg-emerald-50', icon: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
    amber: { blob: 'bg-amber-50', icon: 'bg-amber-50 text-amber-600 border-amber-100' },
    purple: { blob: 'bg-purple-50', icon: 'bg-purple-50 text-purple-600 border-purple-100' },
} as const;

function pad(n: number): string {
    return String(n).padStart(2, '0');
}

function toDateInput(date: Date): string {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateInput(value: string): Date {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(date: Date, days: number): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function isValidDateInput(value: string | null): value is string {
    return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseDateInput(value).getTime());
}

function resolveDashboardRange(rangeParam: string | null, fromParam: string | null, toParam: string | null, today = new Date()) {
    const key: RangeKey = RANGE_OPTIONS.some((o) => o.key === rangeParam) ? (rangeParam as RangeKey) : '30';
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    let from: Date;
    let to: Date;
    if (key === 'custom') {
        const fallbackTo = todayStart;
        const fallbackFrom = addDays(todayStart, -29);
        to = isValidDateInput(toParam) ? parseDateInput(toParam) : fallbackTo;
        from = isValidDateInput(fromParam) ? parseDateInput(fromParam) : fallbackFrom;
        if (from > to) [from, to] = [to, from];
    } else {
        const days = RANGE_OPTIONS.find((o) => o.key === key)?.days ?? 30;
        to = todayStart;
        from = addDays(todayStart, -(days - 1));
    }
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(days - 1));
    return { key, from, to, previousFrom, previousTo, days };
}

function changeLabel(current: number, previous: number): { text: string; tone: 'up' | 'down' | 'flat' } {
    if (previous === 0) return current === 0 ? { text: 'بلا تغيير', tone: 'flat' } : { text: 'جديد مقارنةً بالفترة السابقة', tone: 'up' };
    const pct = Math.round(((current - previous) / Math.abs(previous)) * 100);
    if (pct === 0) return { text: 'بلا تغيير', tone: 'flat' };
    return { text: `${pct > 0 ? '+' : ''}${pct}% مقارنةً بالفترة السابقة`, tone: pct > 0 ? 'up' : 'down' };
}

const TONE_CLASS = { up: 'text-emerald-600', down: 'text-red-600', flat: 'text-slate-400' } as const;

export const AdminDashboard: React.FC = () => {
    const [params, setParams] = useSearchParams();
    const range = useMemo(
        () => resolveDashboardRange(params.get('range'), params.get('from'), params.get('to')),
        [params],
    );
    const fromText = toDateInput(range.from);
    const toText = toDateInput(range.to);
    const previousFromText = toDateInput(range.previousFrom);
    const previousToText = toDateInput(range.previousTo);

    const [report, setReport] = useState<BusinessReport | null>(null);
    const [previous, setPrevious] = useState<BusinessReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            fetchBusinessReport(parseDateInput(fromText), parseDateInput(toText)),
            fetchBusinessReport(parseDateInput(previousFromText), parseDateInput(previousToText)),
        ])
            .then(([current, prior]) => {
                if (cancelled) return;
                setReport(current);
                setPrevious(prior);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذر تحميل التقرير.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [fromText, toText, previousFromText, previousToText]);

    const selectRange = (key: RangeKey) => {
        const next = new URLSearchParams(params);
        next.set('range', key);
        if (key !== 'custom') {
            next.delete('from');
            next.delete('to');
        } else {
            next.set('from', fromText);
            next.set('to', toText);
        }
        setParams(next, { replace: true });
    };

    const setCustomDate = (name: 'from' | 'to', value: string) => {
        if (!isValidDateInput(value)) return;
        const next = new URLSearchParams(params);
        next.set('range', 'custom');
        next.set(name, value);
        setParams(next, { replace: true });
    };

    const kpiCards = report && previous ? [
        { label: 'الإيرادات (غير الملغاة)', value: formatSDG(report.revenue), current: report.revenue, prior: previous.revenue, icon: DollarSign, color: 'blue' as const },
        { label: 'الإيرادات المدفوعة', value: formatSDG(report.paid_revenue), current: report.paid_revenue, prior: previous.paid_revenue, icon: PackageCheck, color: 'emerald' as const },
        { label: 'عدد الطلبات', value: formatNumber(report.orders), current: report.orders, prior: previous.orders, icon: ShoppingBag, color: 'purple' as const },
        { label: 'مدفوعات بانتظار المراجعة', value: formatNumber(report.pending_payments), current: report.pending_payments, prior: previous.pending_payments, icon: Clock, color: 'amber' as const },
    ] : [];

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">نظرة عامة على العمل</h1>
                    <p className="text-slate-500 font-medium mt-1" dir="ltr">{fromText} → {toText}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2" role="group" aria-label="نطاق التاريخ">
                    {RANGE_OPTIONS.map((option) => (
                        <button
                            key={option.key}
                            type="button"
                            onClick={() => selectRange(option.key)}
                            aria-pressed={range.key === option.key}
                            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${range.key === option.key ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}
                        >
                            {option.label}
                        </button>
                    ))}
                    {range.key === 'custom' && (
                        <>
                            <input type="date" aria-label="من" value={fromText} onChange={(e) => setCustomDate('from', e.target.value)} className={`${inputClass} w-auto py-2 text-sm`} dir="ltr" />
                            <input type="date" aria-label="إلى" value={toText} onChange={(e) => setCustomDate('to', e.target.value)} className={`${inputClass} w-auto py-2 text-sm`} dir="ltr" />
                        </>
                    )}
                </div>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            {loading && !report && !error && <Spinner />}

            {report && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {kpiCards.map((card) => {
                            const change = changeLabel(card.current, card.prior);
                            return (
                                <Card key={card.label} className="p-6 hover:shadow-md transition-shadow relative overflow-hidden group">
                                    <div className={`absolute top-0 right-0 w-24 h-24 ${KPI_STYLES[card.color].blob} rounded-full -mr-12 -mt-12 opacity-50 group-hover:scale-110 transition-transform`}></div>
                                    <div className="relative">
                                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 border ${KPI_STYLES[card.color].icon}`}>
                                            <card.icon className="w-6 h-6" />
                                        </div>
                                        <p className="text-sm font-bold text-slate-500 mb-1">{card.label}</p>
                                        <h3 className="text-2xl font-black text-slate-900">{card.value}</h3>
                                        <p className={`mt-2 text-xs font-black ${TONE_CLASS[change.tone]}`}>{change.text}</p>
                                    </div>
                                </Card>
                            );
                        })}
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
