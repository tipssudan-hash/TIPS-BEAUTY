import React, { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search, ShoppingBag, Loader2 } from 'lucide-react';
import { fetchOrders, subscribeToOrders, type OrderListRow } from '../../lib/adminApi';
import {
    ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, errorMessage, formatDateTime, formatSDG,
    orderStatusLabel, orderStatusStyle, paymentMethodLabel, paymentStatusLabel, paymentStatusStyle,
} from '../../lib/format';

const PAGE_SIZE = 20;

export const OrderListPage: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const status = searchParams.get('status') ?? '';
    const paymentStatus = searchParams.get('payment') ?? '';
    const page = Math.max(0, Number(searchParams.get('page') ?? '0') || 0);

    const [searchInput, setSearchInput] = useState(searchParams.get('q') ?? '');
    const [search, setSearch] = useState(searchInput);
    const [orders, setOrders] = useState<OrderListRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
            const result = await fetchOrders({ status, paymentStatus, search, page, pageSize: PAGE_SIZE });
            setOrders(result.rows);
            setTotal(result.total);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الطلبات.'));
        } finally {
            setLoading(false);
        }
    }, [status, paymentStatus, search, page]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => subscribeToOrders(() => { void load(true); }), [load]);

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
            </div>

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
            </div>

            {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl px-6 py-4 text-sm font-bold flex items-center justify-between">
                    <span>{error}</span>
                    <button onClick={() => void load()} className="underline">إعادة المحاولة</button>
                </div>
            )}

            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
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
                                return (
                                    <tr key={order.id} className={`hover:bg-slate-50/50 transition-colors ${unseen ? 'bg-blue-50/40' : ''}`}>
                                        <td className="px-6 py-5">
                                            <Link to={`/orders/${order.id}`} className="flex items-center gap-3 group">
                                                <span className="relative w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600">
                                                    <ShoppingBag className="w-4 h-4" />
                                                    {unseen && <span aria-label="طلب غير مقروء" className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-brand-blue ring-2 ring-white" />}
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
                                            <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black border ${orderStatusStyle(order.status)}`}>
                                                {orderStatusLabel(order.status)}
                                            </span>
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
            </div>
        </div>
    );
};
