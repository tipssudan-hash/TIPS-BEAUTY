import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import type { ProfitByProduct, ProfitReport } from '../types';
import { fetchWarehouses } from '../lib/catalogApi';
import { fetchProfitReport, isoDate } from '../lib/purchasesApi';
import { errorMessage } from '../lib/errors';
import { csvFileName, downloadCsv, toCsv, type CsvColumn } from '../lib/csv';
import { formatNumber, formatSDG } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, Table, inputClass, primaryButtonClass } from '../components/ui';

function firstDayOfMonth(): string {
    const now = new Date();
    return isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
}

function percent(value: number | null): string {
    return value == null ? '—' : `${value.toFixed(1)}%`;
}

interface ReportQuery { start: string; end: string; warehouseId: string }

export const ProfitReportPage: React.FC = () => {
    const [start, setStart] = useState(firstDayOfMonth);
    const [end, setEnd] = useState(() => isoDate(new Date()));
    const [warehouseId, setWarehouseId] = useState('');
    const [applied, setApplied] = useState<ReportQuery>(() => ({ start: firstDayOfMonth(), end: isoDate(new Date()), warehouseId: '' }));
    const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
    const [report, setReport] = useState<ProfitReport | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchWarehouses()
            .then((list) => setWarehouses(list.map((w) => ({ id: w.id, name: w.name }))))
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل المستودعات.')));
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchProfitReport(applied.start, applied.end, applied.warehouseId || null)
            .then((result) => { if (!cancelled) setReport(result); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل تقرير الأرباح.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [applied]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (start > end) { setError('تاريخ البداية يجب أن يسبق تاريخ النهاية.'); return; }
        setApplied({ start, end, warehouseId });
    };

    const exportCsv = () => {
        if (!report) return;
        const columns: CsvColumn<ProfitByProduct>[] = [
            { header: 'المنتج', value: (r) => r.product_name },
            { header: 'الكمية', value: (r) => r.quantity },
            { header: 'الإيراد', value: (r) => r.revenue },
            { header: 'تكلفة البضاعة', value: (r) => r.cogs },
            { header: 'الربح الإجمالي', value: (r) => r.gross_profit },
            { header: 'الهامش %', value: (r) => r.margin_pct },
        ];
        downloadCsv(csvFileName('profit-report'), toCsv(report.by_product, columns));
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="تقرير الأرباح"
                subtitle="الإيراد وتكلفة البضاعة المباعة والربح الإجمالي. التكلفة من متوسط التكلفة وقت البيع."
                icon={<TrendingUp className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" disabled={!report || report.by_product.length === 0} onClick={exportCsv} className={primaryButtonClass}>تصدير CSV</button>}
            />

            <Card className="p-6">
                <form onSubmit={submit} className="grid md:grid-cols-4 gap-4 items-end">
                    <Field label="من"><input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass} dir="ltr" required /></Field>
                    <Field label="إلى"><input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass} dir="ltr" required /></Field>
                    <Field label="المستودع">
                        <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={inputClass}>
                            <option value="">كل المستودعات</option>
                            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </Field>
                    <button type="submit" disabled={loading} className={primaryButtonClass}>عرض التقرير</button>
                </form>
            </Card>

            {error && <Notice kind="error">{error}</Notice>}

            {loading ? <Spinner label="جاري حساب التقرير..." /> : report && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                        <Card className="p-6"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">الإيراد</p><h4 className="text-2xl font-black text-slate-900">{formatSDG(report.revenue)}</h4></Card>
                        <Card className="p-6"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">تكلفة البضاعة المباعة</p><h4 className="text-2xl font-black text-slate-900">{formatSDG(report.cogs)}</h4></Card>
                        <Card className="p-6"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">الربح الإجمالي</p><h4 className={`text-2xl font-black ${report.gross_profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatSDG(report.gross_profit)}</h4></Card>
                        <Card className="p-6"><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">هامش الربح</p><h4 className="text-2xl font-black text-slate-900">{percent(report.margin_pct)}</h4></Card>
                    </div>

                    {report.missing_cost_lines > 0 && (
                        <p className="p-4 rounded-2xl bg-amber-50 text-amber-800 text-sm font-bold border border-amber-100">
                            {formatNumber(report.missing_cost_lines)} بنداً بلا تكلفة مسجّلة؛ قد يكون الربح الإجمالي أعلى من الحقيقة.
                        </p>
                    )}

                    {report.estimated_cost_lines > 0 && (
                        <p className="p-4 rounded-2xl bg-slate-50 text-slate-700 text-sm font-bold border border-slate-100">
                            {formatNumber(report.estimated_cost_lines)} بنداً من طلبات سبقت تسجيل التكلفة؛ قُدّرت تكلفتها بمتوسط التكلفة الحالي.
                        </p>
                    )}

                    {report.cogs_reversed > 0 && (
                        <p className="p-4 rounded-2xl bg-slate-50 text-slate-700 text-sm font-bold border border-slate-100">
                            خُصم {formatSDG(report.cogs_reversed)} من تكلفة البضاعة المباعة مقابل مرتجعات أُعيدت إلى المخزون.
                        </p>
                    )}

                    <Card className="overflow-hidden">
                        <Table headers={['المنتج', 'الكمية', 'الإيراد', 'التكلفة', 'الربح', 'الهامش']} empty={report.by_product.length === 0} emptyText="لا توجد مبيعات في هذه الفترة">
                            {report.by_product.map((row) => (
                                <tr key={row.product_id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{row.product_name}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatNumber(row.quantity)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatSDG(row.revenue)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{formatSDG(row.cogs)}</td>
                                    <td className={`px-6 py-4 text-sm font-black ${row.gross_profit < 0 ? 'text-red-600' : 'text-emerald-700'}`}>{formatSDG(row.gross_profit)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{percent(row.margin_pct)}</td>
                                </tr>
                            ))}
                        </Table>
                    </Card>
                </>
            )}
        </div>
    );
};
