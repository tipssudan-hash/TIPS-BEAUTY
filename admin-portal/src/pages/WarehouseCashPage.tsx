import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, AlertTriangle, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
    adjustDriverCash,
    confirmRemittance,
    fetchActiveWarehouses,
    fetchDriverCashLedger,
    fetchSettlementSummary,
    fetchWarehouseRemittances,
    type DriverCashLedgerEntry,
    type SettlementSummary,
    type WarehouseOption,
    type WarehouseRemittance,
} from '../lib/adminApi';
import { errorMessage } from '../lib/errors';
import { csvFileName, downloadCsv, toCsv, type CsvColumn } from '../lib/csv';
import { formatNumber, formatSDG, formatDateTime } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass, type StatusTone } from '../components/ui';

const POLL_INTERVAL_MS = 30_000;
const NO_WAREHOUSE = '__none__';

const LEDGER_TYPE_LABELS: Record<string, string> = {
    cod_collected: 'تحصيل COD',
    remittance_confirmed: 'تسوية مؤكدة',
    adjustment: 'تعديل إداري',
};

const STATUS_FILTERS = [
    { value: '', label: 'كل الحالات' },
    { value: 'submitted', label: 'بانتظار التأكيد' },
    { value: 'confirmed', label: 'مؤكدة' },
    { value: 'rejected', label: 'مرفوضة' },
];

const STATUS_BADGES: Record<string, { label: string; tone: StatusTone }> = {
    submitted: { label: 'بانتظار التأكيد', tone: 'attention' },
    confirmed: { label: 'مؤكدة', tone: 'success' },
    rejected: { label: 'مرفوضة', tone: 'danger' },
};

type DecisionDialog = { remittance: WarehouseRemittance; action: 'confirmed' | 'rejected'; note: string };

const daysFromToday = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export const WarehouseCashPage: React.FC = () => {
    const { isAdmin, managedWarehouses } = useAuth();
    const [adminWarehouses, setAdminWarehouses] = useState<WarehouseOption[]>([]);
    const [remittances, setRemittances] = useState<WarehouseRemittance[]>([]);
    const [summary, setSummary] = useState<SettlementSummary | null>(null);
    const [statusFilter, setStatusFilter] = useState('submitted');
    const [warehouseFilter, setWarehouseFilter] = useState('');
    const [driverFilter, setDriverFilter] = useState('');
    const [startDate, setStartDate] = useState(() => daysFromToday(-30));
    const [endDate, setEndDate] = useState(() => daysFromToday(0));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [dialog, setDialog] = useState<DecisionDialog | null>(null);
    const [busy, setBusy] = useState(false);
    const busyRef = useRef(false);
    const [ledgerDriverId, setLedgerDriverId] = useState<string | null>(null);
    const [ledgerEntries, setLedgerEntries] = useState<DriverCashLedgerEntry[]>([]);
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledgerExporting, setLedgerExporting] = useState(false);

    const exportLedger = async () => {
        if (!ledgerDriverId) return;
        setLedgerExporting(true);
        try {
            const entries = await fetchDriverCashLedger(ledgerDriverId, 5000);
            const columns: CsvColumn<DriverCashLedgerEntry>[] = [
                { header: 'التاريخ', value: (e) => e.created_at },
                { header: 'يوم العمل', value: (e) => e.business_date },
                { header: 'النوع', value: (e) => LEDGER_TYPE_LABELS[e.entry_type] ?? e.entry_type },
                { header: 'رقم الطلب', value: (e) => e.order_id },
                { header: 'رقم التوريد', value: (e) => e.remittance_id },
                { header: 'المبلغ', value: (e) => e.amount },
                { header: 'ملاحظة', value: (e) => e.note },
            ];
            downloadCsv(csvFileName('driver-cash-ledger'), toCsv(entries, columns));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تصدير دفتر النقد.'));
        } finally {
            setLedgerExporting(false);
        }
    };
    const [adjustDraft, setAdjustDraft] = useState<{ amount: string; note: string } | null>(null);
    const [adjusting, setAdjusting] = useState(false);

    const warehouseOptions: { id: string; name: string }[] = useMemo(() => (isAdmin ? adminWarehouses : managedWarehouses), [isAdmin, adminWarehouses, managedWarehouses]);
    const warehouseNames = useMemo(() => new Map(warehouseOptions.map((w) => [w.id, w.name])), [warehouseOptions]);

    const selectedWarehouseId = warehouseFilter && warehouseFilter !== NO_WAREHOUSE ? warehouseFilter : null;
    const remittanceWarehouse = warehouseFilter === NO_WAREHOUSE ? null : warehouseFilter || undefined;

    useEffect(() => {
        if (!isAdmin) return;
        fetchActiveWarehouses()
            .then(setAdminWarehouses)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل المستودعات.')));
    }, [isAdmin]);

    const refresh = useCallback(async () => {
        try {
            const [rows, data] = await Promise.all([
                fetchWarehouseRemittances({ status: statusFilter || undefined, warehouseId: remittanceWarehouse, driverId: driverFilter || undefined }),
                fetchSettlementSummary(startDate, endDate, selectedWarehouseId),
            ]);
            setRemittances(rows);
            setSummary(data);
            setError(null);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل التسويات.'));
        } finally {
            setLoading(false);
        }
    }, [statusFilter, remittanceWarehouse, driverFilter, startDate, endDate, selectedWarehouseId]);

    useEffect(() => {
        void refresh();
        const onTick = () => {
            if (document.visibilityState === 'visible') void refresh();
        };
        const timer = window.setInterval(onTick, POLL_INTERVAL_MS);
        document.addEventListener('visibilitychange', onTick);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onTick);
        };
    }, [refresh]);

    const driverNames = useMemo(() => new Map((summary?.driver_performance ?? []).map((d) => [d.driver_id, d.driver_name])), [summary]);
    const outstandingByDriver = useMemo(() => new Map((summary?.driver_performance ?? []).map((d) => [d.driver_id, d.outstanding_cod])), [summary]);
    const driverName = (id: string) => driverNames.get(id) || id.slice(0, 8);
    const warehouseLabel = (id: string | null) => (id === null ? 'بلا مستودع' : warehouseNames.get(id) ?? '—');

    const exceedsExpected = (remittance: WarehouseRemittance) => {
        const expected = outstandingByDriver.get(remittance.driver_id);
        return expected !== undefined && remittance.amount > expected;
    };

    const openDecision = (remittance: WarehouseRemittance, action: 'confirmed' | 'rejected') => {
        setError(null);
        setSuccess(null);
        setDialog({ remittance, action, note: '' });
    };

    const submitDecision = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dialog || busyRef.current) return;
        const note = dialog.note.trim();
        if (dialog.action === 'rejected' && !note) {
            setError('ملاحظة الرفض إلزامية.');
            return;
        }
        if (dialog.action === 'confirmed' && isAdmin && exceedsExpected(dialog.remittance) && !note) {
            setError('المبلغ يتجاوز النقد المتوقع من المندوب؛ أضيفي ملاحظة لتأكيده.');
            return;
        }
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            await confirmRemittance(dialog.remittance.id, dialog.action, note || undefined);
            setSuccess(dialog.action === 'confirmed' ? 'تم تأكيد التسوية.' : 'تم رفض التسوية.');
            setDialog(null);
            await refresh();
        } catch (err) {
            setError(errorMessage(err, 'تعذر تنفيذ الإجراء على هذه التسوية.'));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    };

    const loadLedger = useCallback(async (driverId: string) => {
        setLedgerLoading(true);
        try {
            setLedgerEntries(await fetchDriverCashLedger(driverId));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل دفتر المندوب.'));
        } finally {
            setLedgerLoading(false);
        }
    }, []);

    useEffect(() => {
        if (ledgerDriverId) void loadLedger(ledgerDriverId);
    }, [ledgerDriverId, loadLedger]);

    const toggleLedger = (driverId: string) => {
        setAdjustDraft(null);
        setLedgerDriverId((current) => (current === driverId ? null : driverId));
    };

    const submitAdjust = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjustDraft || !ledgerDriverId || adjusting) return;
        const amount = Number(adjustDraft.amount);
        const note = adjustDraft.note.trim();
        if (!Number.isFinite(amount) || amount === 0) {
            setError('أدخلي مبلغاً غير صفري.');
            return;
        }
        if (!note) {
            setError('ملاحظة التعديل إلزامية.');
            return;
        }
        setAdjusting(true);
        setError(null);
        try {
            await adjustDriverCash(ledgerDriverId, amount, note);
            setAdjustDraft(null);
            setSuccess('تم تعديل دفتر المندوب.');
            await Promise.all([loadLedger(ledgerDriverId), refresh()]);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تعديل الدفتر.'));
        } finally {
            setAdjusting(false);
        }
    };

    const dialogExceeds = dialog ? exceedsExpected(dialog.remittance) : false;
    const dialogExpected = dialog ? outstandingByDriver.get(dialog.remittance.driver_id) : undefined;

    return (
        <div className="space-y-8">
            <PageHeader
                title="تسويات النقد"
                subtitle="تأكيد النقد المسلَّم من المندوبين، ومقارنته بالنقد المتوقع من الطلبات المسلَّمة."
                icon={<Banknote className="w-8 h-8 text-brand-blue" />}
            />

            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            {dialog && (
                <Card className="p-6">
                    <form onSubmit={submitDecision} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">
                                {dialog.action === 'confirmed' ? 'تأكيد استلام النقد' : 'رفض التسوية'} — {driverName(dialog.remittance.driver_id)}
                            </h3>
                            <button type="button" onClick={() => setDialog(null)} disabled={busy} className="p-2 text-slate-400 hover:text-slate-600 disabled:opacity-50" aria-label="إغلاق">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <p className="text-sm font-bold text-slate-500">
                            المبلغ المُرسل: <span className="text-slate-900">{formatSDG(dialog.remittance.amount)}</span>
                            {dialogExpected !== undefined && (
                                <> · النقد المتوقع: <span className="text-slate-900">{formatSDG(dialogExpected)}</span></>
                            )}
                        </p>
                        {dialog.action === 'confirmed' && dialogExceeds && (
                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-xs font-bold text-amber-800">
                                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                <span>المبلغ يتجاوز النقد المتوقع من هذا المندوب.{isAdmin ? ' أضيفي ملاحظة لتأكيده.' : ''}</span>
                            </div>
                        )}
                        <Field label={dialog.action === 'rejected' ? 'سبب الرفض' : 'ملاحظة'} required={dialog.action === 'rejected' || (isAdmin && dialogExceeds)}>
                            <textarea
                                value={dialog.note}
                                onChange={(e) => setDialog({ ...dialog, note: e.target.value })}
                                rows={2}
                                className={inputClass}
                                required={dialog.action === 'rejected' || (isAdmin && dialogExceeds)}
                            />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDialog(null)} disabled={busy} className={secondaryButtonClass}>إلغاء</button>
                            <button
                                type="submit"
                                disabled={busy || (dialog.action === 'rejected' && !dialog.note.trim())}
                                className={`px-6 py-3 rounded-2xl font-black text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${dialog.action === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                {busy ? 'جاري التنفيذ...' : dialog.action === 'confirmed' ? 'تأكيد الاستلام' : 'رفض التسوية'}
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {summary && warehouseFilter !== NO_WAREHOUSE && (
                <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-4 bg-slate-50 border-slate-100">
                            <p className="text-xs font-bold text-slate-400 mb-1">بانتظار التأكيد</p>
                            <p className="text-xl font-black text-amber-700">{formatSDG(summary.cash_remittances.pending_confirmation)}</p>
                        </Card>
                        <Card className="p-4 bg-slate-50 border-slate-100">
                            <p className="text-xs font-bold text-slate-400 mb-1">مؤكد</p>
                            <p className="text-xl font-black text-emerald-700">{formatSDG(summary.cash_remittances.total_confirmed)}</p>
                        </Card>
                        <Card className="p-4 bg-slate-50 border-slate-100">
                            <p className="text-xs font-bold text-slate-400 mb-1">مرفوض</p>
                            <p className="text-xl font-black text-red-600">{formatSDG(summary.cash_remittances.rejected)}</p>
                        </Card>
                        <Card className="p-4 bg-slate-50 border-slate-100">
                            <p className="text-xs font-bold text-slate-400 mb-1">COD المحصل (مسلَّم)</p>
                            <p className="text-xl font-black text-slate-900">{formatSDG(summary.cod_collected)}</p>
                        </Card>
                    </div>
                    {summary.driver_performance.length > 0 && (
                        <Card className="overflow-hidden">
                            <Table headers={['المندوب', 'مُسلَّم', 'فاشل', 'COD المحصل', 'المُرسل', 'المؤكد', 'النقد المتوقع', 'الدفتر']}>
                                {summary.driver_performance.map((d) => (
                                    <tr key={d.driver_id} className="hover:bg-slate-50/50">
                                        <td className="px-6 py-3 text-sm font-black text-slate-900">{d.driver_name || d.driver_id.slice(0, 8)}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-600">{formatNumber(d.delivered)}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-600">{formatNumber(d.failed)}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-600">{formatSDG(d.cod_collected)}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-600">{formatSDG(d.cash_submitted)}</td>
                                        <td className="px-6 py-3 text-sm font-bold text-slate-600">{formatSDG(d.cash_confirmed)}</td>
                                        <td className="px-6 py-3 text-sm font-black text-slate-900">{formatSDG(d.outstanding_cod)}</td>
                                        <td className="px-6 py-3">
                                            <button type="button" onClick={() => toggleLedger(d.driver_id)} className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                                                {ledgerDriverId === d.driver_id ? 'إخفاء' : 'عرض الدفتر'}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </Table>
                        </Card>
                    )}
                </div>
            )}

            {ledgerDriverId && (
                <Card className="overflow-hidden">
                    <div className="p-5 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3 bg-slate-50/30">
                        <div>
                            <h3 className="font-black text-slate-900">دفتر النقد — {driverName(ledgerDriverId)}</h3>
                            <p className="text-xs font-bold text-slate-500 mt-1">
                                الرصيد المتوقع: <span className="text-slate-900">{formatSDG(outstandingByDriver.get(ledgerDriverId) ?? 0)}</span>
                            </p>
                        </div>
                        {isAdmin && !adjustDraft && (
                            <button type="button" onClick={() => setAdjustDraft({ amount: '', note: '' })} className={`${smallButtonClass} bg-amber-50 text-amber-800 hover:bg-amber-100`}>
                                تعديل الدفتر
                            </button>
                        )}
                    </div>

                    {isAdmin && adjustDraft && (
                        <form onSubmit={submitAdjust} className="p-5 border-b border-slate-50 grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                            <Field label="المبلغ (موجب يزيد الرصيد، سالب يخفضه)" required>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={adjustDraft.amount}
                                    onChange={(e) => setAdjustDraft({ ...adjustDraft, amount: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                    required
                                />
                            </Field>
                            <Field label="ملاحظة التعديل" required>
                                <input
                                    value={adjustDraft.note}
                                    onChange={(e) => setAdjustDraft({ ...adjustDraft, note: e.target.value })}
                                    className={inputClass}
                                    required
                                />
                            </Field>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setAdjustDraft(null)} disabled={adjusting} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={adjusting || !adjustDraft.note.trim()} className={primaryButtonClass}>
                                    {adjusting ? 'جاري الحفظ...' : 'حفظ التعديل'}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="flex justify-end">
                        <button type="button" disabled={!ledgerDriverId || ledgerExporting} onClick={() => void exportLedger()} className={`${smallButtonClass} bg-slate-900 text-white`}>{ledgerExporting ? 'جاري التصدير...' : 'تصدير دفتر النقد CSV'}</button>
                    </div>
                    {ledgerLoading ? <Spinner /> : (
                        <Table
                            headers={['التاريخ', 'يوم العمل', 'النوع', 'المرجع', 'المبلغ', 'ملاحظة']}
                            empty={ledgerEntries.length === 0}
                            emptyText="لا توجد قيود لهذا المندوب."
                        >
                            {ledgerEntries.map((entry) => (
                                <tr key={entry.id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-3 text-xs font-bold text-slate-500">{formatDateTime(entry.created_at)}</td>
                                    <td className="px-6 py-3 text-xs font-bold text-slate-500" dir="ltr">{entry.business_date}</td>
                                    <td className="px-6 py-3 text-sm font-bold text-slate-700">{LEDGER_TYPE_LABELS[entry.entry_type] ?? entry.entry_type}</td>
                                    <td className="px-6 py-3 text-xs font-mono text-slate-500" dir="ltr">
                                        {entry.order_id ? `طلب ${entry.order_id.slice(0, 8)}` : entry.remittance_id ? `تسوية ${entry.remittance_id.slice(0, 8)}` : '—'}
                                    </td>
                                    <td className={`px-6 py-3 text-sm font-black ${entry.amount < 0 ? 'text-red-600' : 'text-slate-900'}`}>{formatSDG(entry.amount)}</td>
                                    <td className="px-6 py-3 text-xs text-slate-500 max-w-xs">{entry.note ?? '—'}</td>
                                </tr>
                            ))}
                        </Table>
                    )}
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 grid grid-cols-1 md:grid-cols-5 gap-3 bg-slate-50/30">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={inputClass} aria-label="الحالة">
                        {STATUS_FILTERS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                    <select value={warehouseFilter} onChange={(e) => setWarehouseFilter(e.target.value)} className={inputClass} aria-label="المستودع">
                        <option value="">كل المستودعات</option>
                        {isAdmin && <option value={NO_WAREHOUSE}>بلا مستودع</option>}
                        {warehouseOptions.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <select value={driverFilter} onChange={(e) => setDriverFilter(e.target.value)} className={inputClass} aria-label="المندوب">
                        <option value="">كل المندوبين</option>
                        {(summary?.driver_performance ?? []).map((d) => <option key={d.driver_id} value={d.driver_id}>{d.driver_name || d.driver_id.slice(0, 8)}</option>)}
                    </select>
                    <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} aria-label="من تاريخ" dir="ltr" />
                    <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} aria-label="إلى تاريخ" dir="ltr" />
                </div>

                {loading ? <Spinner /> : (
                    <Table
                        headers={['التاريخ', 'المندوب', 'المستودع', 'المبلغ المُرسل', 'النقد المتوقع', 'الحالة', 'ملاحظات', 'الإجراءات']}
                        empty={remittances.length === 0}
                        emptyText="لا توجد تسويات مطابقة للفلاتر."
                    >
                        {remittances.map((r) => {
                            const badge = STATUS_BADGES[r.status] ?? { label: r.status, tone: 'neutral' as StatusTone };
                            const expected = outstandingByDriver.get(r.driver_id);
                            const pending = r.status === 'submitted';
                            return (
                                <tr key={r.id} className="hover:bg-slate-50/50">
                                    <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateTime(r.submitted_at)}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{driverName(r.driver_id)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{warehouseLabel(r.warehouse_id)}</td>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{formatSDG(r.amount)}</td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">
                                        {expected === undefined ? '—' : formatSDG(expected)}
                                        {pending && expected !== undefined && r.amount > expected && (
                                            <span className="block text-[10px] font-black text-amber-700 mt-0.5">يتجاوز المتوقع</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4"><StatusPill tone={badge.tone}>{badge.label}</StatusPill></td>
                                    <td className="px-6 py-4 text-xs text-slate-500 max-w-xs">
                                        {r.driver_notes && <p>المندوب: {r.driver_notes}</p>}
                                        {r.supervisor_notes && <p>المراجعة: {r.supervisor_notes}</p>}
                                        {!r.driver_notes && !r.supervisor_notes && '—'}
                                    </td>
                                    <td className="px-6 py-4">
                                        {pending && !isAdmin ? (
                                            <span className="text-[11px] font-bold text-amber-800">بانتظار تأكيد المحاسب أو المدير</span>
                                        ) : pending ? (
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => openDecision(r, 'confirmed')}
                                                    className={`${smallButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
                                                >
                                                    تأكيد
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => openDecision(r, 'rejected')}
                                                    className={`${smallButtonClass} bg-red-50 text-red-600 hover:bg-red-100`}
                                                >
                                                    رفض
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400">—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </Table>
                )}
            </Card>
        </div>
    );
};
