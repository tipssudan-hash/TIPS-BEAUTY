import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag, Loader2, ArrowLeft, AlertTriangle, ClipboardList } from 'lucide-react';
import { fetchOrders, fetchOrdersNeedingAction, subscribeToOrders, updateOrderOperation, countFulfillmentReviewOrders, type OrderListRow } from '../../lib/adminApi';
import {
    NEEDS_ACTION_REASON_LABELS, NEEDS_ACTION_REASON_STYLES, ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, formatDateTime, formatSDG, orderStatusLabel, orderStatusStyle,
    paymentMethodLabel, paymentStatusLabel, paymentStatusStyle, primaryForwardTransition, type OrderStatus,
} from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { csvFileName, downloadCsv, toCsv, type CsvColumn } from '../../lib/csv';
import { fetchAllPages } from '../../lib/pagination';
import { Card, Notice } from '../../components/ui';
import type { OrderNeedsAction } from '../../types';

const PAGE_SIZE = 20;

export const OrderListPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const status = searchParams.get('status') ?? '';
    const paymentStatus = searchParams.get('payment') ?? '';
    const page = Math.max(0, Number(searchParams.get('page') ?? '0') || 0);
    const actionView = searchParams.get('view') === 'action';

    const fulfillmentReview = searchParams.get('fulfillment_review') === '1';
    const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
    const [search, setSearch] = useState(searchInput);
    const [orders, setOrders] = useState<OrderListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [actionRows, setActionRows] = useState<OrderNeedsAction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [advancingId, setAdvancingId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const exportCsv = async () => {
        setExporting(true);
        setError(null);
        try {
            const rows = await fetchAllPages((offset, limit) => fetchOrders({
                status: status || undefined,
                paymentStatus: paymentStatus || undefined,
                needsFulfillmentReview: fulfillmentReview || undefined,
                search,
                page: offset / limit,
                pageSize: limit,
            }));
            const columns: CsvColumn<OrderListRow>[] = [
                { header: 'رقم الطلب', value: (o) => o.order_number ?? o.id },
                { header: 'العميلة', value: (o) => o.customer_name },
                { header: 'الهاتف', value: (o) => o.phone },
                { header: 'الإجمالي', value: (o) => o.total },
                { header: 'حالة الطلب', value: (o) => orderStatusLabel(o.status) },
                { header: 'طريقة الدفع', value: (o) => paymentMethodLabel(o.payment_method) },
                { header: 'حالة الدفع', value: (o) => paymentStatusLabel(o.payment_status) },
                { header: 'التاريخ', value: (o) => o.created_at },
            ];
            downloadCsv(csvFileName('orders'), toCsv(rows, columns));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تصدير الطلبات.'));
        } finally {
            setExporting(false);
        }
    };
    const [reviewCount, setReviewCount] = useState(0);

    useEffect(() => {
        const timer = setTimeout(() => setSearch(searchInput.trim()), 350);
        return () => clearTimeout(timer);
    }, [searchInput]);

    const updateParams = useCallback((patch: Record<string, string>) => {
        const next = new URLSearchParams(searchParams);
        Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
        setSearchParams(next, { replace: true });
    }, [searchParams, setSearchParams]);

    useEffect(() => {
        if ((searchParams.get('q') ?? '') !== search) updateParams({ q: search, page: '' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        setError(null);
        try {
            const [rows, rc] = await Promise.all([
                fetchOrdersNeedingAction(),
                countFulfillmentReviewOrders(),
            ]);
            setActionRows(rows);
            setReviewCount(rc);
            if (!actionView) {
                const result = await fetchOrders({ status, paymentStatus, needsFulfillmentReview: fulfillmentReview || undefined, search, page, pageSize: PAGE_SIZE });
                setOrders(result.rows);
                setTotal(result.total);
            }
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الطلبات.'));
        } finally {
            setLoading(false);
        }
    }, [actionView, status, paymentStatus, fulfillmentReview, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => subscribeToOrders(() => { void load(true); }), [load]);

    const advance = async (order: OrderListRow) => {
        const next = primaryForwardTransition(order.status as OrderStatus);
        if (!next) return;
        setAdvancingId(order.id);
        setError(null);
        try {
            await updateOrderOperation({ orderId: order.id, expectedStatus: order.status, status: next });
            await load(true);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setAdvancingId(null);
        }
    };

    const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const firstIndex = total === 0 ? 0 : page * PAGE_SIZE + 1;
    const lastIndex = Math.min(total, (page + 1) * PAGE_SIZE);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">إدارة الطلبات</h1>
                    <p className="text-slate-500 font-medium mt-1">متابعة الطلبات، الدفع، والتوصيل</p>
                </div>
                {reviewCount > 0 && !actionView && (
                    <button
                        type="button"
                        onClick={() => updateParams({ fulfillment_review: fulfillmentReview ? '' : '1', page: '' })}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-bold transition-colors ${fulfillmentReview ? 'bg-amber-100 border-amber-300 text-amber-800' : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'}`}
                    >
                        <AlertTriangle className="w-4 h-4" />
                        {reviewCount} {reviewCount === 1 ? 'طلب يحتاج' : 'طلبات تحتاج'} مراجعة التوصيل
                        {fulfillmentReview && <span className="text-xs opacity-70">(إلغاء الفلتر)</span>}
                    </button>
                )}
            </div>

            <div role="tablist" aria-label="عرض الطلبات" className="flex flex-wrap gap-2">
                <button
                    type="button"
                    role="tab"
                    aria-selected={!actionView}
                    onClick={() => updateParams({ view: '', page: '' })}
                    className={`px-4 py-2 rounded-xl text-sm font-black border transition-colors ${!actionView ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    كل الطلبات
                </button>
                <button
                    type="button"
                    role="tab"
                    aria-selected={actionView}
                    onClick={() => updateParams({ view: 'action', page: '' })}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black border transition-colors ${actionView ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                    يحتاج إجراء
                    {actionRows.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${actionView ? 'bg-white text-slate-900' : 'bg-amber-500 text-white'}`}>
                            {new Set(actionRows.map((row) => row.order_id)).size}
                        </span>
                    )}
                </button>
            </div>

            {!actionView && (
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex flex-wrap gap-3">
                <div className="flex-1 min-w-[260px] relative">
                    <Search className="w-5 h-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="البحث برقم الطلب، اسم العميل، أو الهاتف..."
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl focus:ring-2 focus:ring-brand-blue outline-none transition-all font-medium text-sm"
                    />
                </div>
                <select
                    value={status}
                    onChange={(e) => updateParams({ status: e.target.value, page: '' })}
                    className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue"
                >
                    <option value="">كل الحالات</option>
                    {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <select
                    value={paymentStatus}
                    onChange={(e) => updateParams({ payment: e.target.value, page: '' })}
                    className="bg-slate-50 border border-slate-100 rounded-xl px-4 py-2.5 font-bold text-sm text-slate-700 outline-none focus:ring-2 focus:ring-brand-blue"
                >
                    <option value="">كل حالات الدفع</option>
                    {Object.entries(PAYMENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <button type="button" disabled={exporting} onClick={() => void exportCsv()} className="bg-slate-900 text-white rounded-xl px-4 py-2.5 font-black text-sm disabled:opacity-50">{exporting ? 'جاري التصدير...' : 'تصدير CSV'}</button>
            </div>
            )}

            {error && (
                <Notice kind="error">
                    <span className="flex-1">{error}</span>
                    <button onClick={() => void load()} className="underline shrink-0">إعادة المحاولة</button>
                </Notice>
            )}

            {actionView ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-right border-collapse">
                            <thead>
                                <tr className="bg-slate-900 border-b border-slate-800">
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">الطلب</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">السبب</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-center">الحالة</th>
                                    <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-left">منذ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {loading ? (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-20 text-center text-slate-400">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                        </td>
                                    </tr>
                                ) : actionRows.length > 0 ? actionRows.map((row) => (
                                    <tr key={`${row.order_id}-${row.reason}`} className="hover:bg-slate-50/50 transition-colors">
                                        <td className="px-6 py-5">
                                            <Link to={`/orders/${row.order_id}`} className="font-bold text-slate-900 text-sm hover:text-brand-blue">
                                                {row.order_number ?? row.order_id.slice(0, 8)}
                                            </Link>
                                        </td>
                                        <td className="px-6 py-5">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${NEEDS_ACTION_REASON_STYLES[row.reason]}`}>
                                                {NEEDS_ACTION_REASON_LABELS[row.reason] ?? row.reason}
                                            </span>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${orderStatusStyle(row.status)}`}>{orderStatusLabel(row.status)}</span>
                                        </td>
                                        <td className="px-6 py-5 text-left text-xs font-bold text-slate-500">{formatDateTime(row.since)}</td>
                                    </tr>
                                )) : (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-20 text-center">
                                            <div className="flex flex-col items-center opacity-20">
                                                <ClipboardList className="w-12 h-12 mb-3" />
                                                <p className="font-black text-lg">لا توجد طلبات تحتاج إجراء الآن</p>
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : (
            <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right border-collapse">
                        <thead>
                            <tr className="bg-slate-900 border-b border-slate-800">
                                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">الطلب</th>
                                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">العميل</th>
                                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-center">الحالة</th>
                                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-center">الدفع</th>
                                <th className="px-6 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-left">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center text-slate-400">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </td>
                                </tr>
                            ) : orders.length > 0 ? orders.map((order) => {
                                const unseen = order.status === 'new' && !order.viewed_at;
                                const nextStatus = primaryForwardTransition(order.status as OrderStatus);
                                const busy = advancingId === order.id;
                                return (
                                    <tr key={order.id} className={`hover:bg-slate-50/50 transition-colors ${unseen ? 'bg-blue-50/40' : order.needs_fulfillment_review ? 'bg-amber-50/40' : ''}`}>
                                        <td className="px-6 py-5">
                                            <Link to={`/orders/${order.id}`} className="flex items-center gap-3 group">
                                                <span className="relative w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                                                    <ShoppingBag className="w-4 h-4" />
                                                    {unseen && <span aria-label="طلب لم يُطّلع عليه" className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-blue ring-2 ring-white" />}
                                                    {order.needs_fulfillment_review && <span aria-label="يحتاج مراجعة التوصيل" className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-amber-400 ring-2 ring-white" />}
                                                </span>
                                                <span>
                                                    <p className="font-bold text-slate-900 text-sm group-hover:text-brand-blue">{order.order_number ?? order.id.slice(0, 8)}</p>
                                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">{formatDateTime(order.created_at)}</p>
                                                </span>
                                            </Link>
                                        </td>
                                        <td className="px-6 py-5">
                                            <p className="font-bold text-slate-900 text-sm">{order.customer_name}</p>
                                            <p className="text-xs text-slate-500 font-medium" dir="ltr">{order.phone}</p>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${orderStatusStyle(order.status)}`}>
                                                    {orderStatusLabel(order.status)}
                                                </span>
                                                {nextStatus && (
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() => void advance(order)}
                                                        aria-label={`نقل الطلب ${order.order_number ?? ''} إلى ${orderStatusLabel(nextStatus)}`}
                                                        className="inline-flex items-center gap-1 text-[10px] font-black text-brand-blue hover:underline disabled:opacity-50"
                                                    >
                                                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowLeft className="w-3 h-3" />}
                                                        {orderStatusLabel(nextStatus)}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-center">
                                            <div className="flex flex-col items-center">
                                                <span className={`px-2 py-0.5 rounded text-[9px] font-black ${paymentStatusStyle(order.payment_status)}`}>
                                                    {paymentStatusLabel(order.payment_status)}
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-bold mt-1">{paymentMethodLabel(order.payment_method)}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-left font-black text-slate-900">{formatSDG(order.total)}</td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={5} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center opacity-20">
                                            <ShoppingBag className="w-12 h-12 mb-3 grayscale" />
                                            <p className="font-black text-lg">لا توجد طلبات للعرض</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
                <div className="bg-slate-50/50 px-6 py-4 flex items-center justify-between border-t border-slate-100">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                        عرض {firstIndex}–{lastIndex} من {total} طلب
                    </p>
                    <div className="flex gap-2">
                        <button
                            disabled={page <= 0 || loading}
                            onClick={() => updateParams({ page: String(page - 1) })}
                            className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                            السابق
                        </button>
                        <button
                            disabled={page + 1 >= pageCount || loading}
                            onClick={() => updateParams({ page: String(page + 1) })}
                            className="px-4 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                        >
                            التالي
                        </button>
                    </div>
                </div>
            </Card>
            )}
        </div>
    );
};
