import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, CheckCircle2, XCircle, Truck, MapPin, CreditCard, Clock, Warehouse } from 'lucide-react';
import {
    fetchActiveWarehouses, fetchDrivers, fetchOrder, fetchOrderHistory, fetchPaymentProof, markOrderViewed,
    reviewPaymentProof, signedProofUrl, updateOrderOperation,
    type AdminOrder, type DriverOption, type OrderHistoryEntry, type PaymentProof, type WarehouseOption,
} from '../../lib/adminApi';
import {
    ALLOWED_TRANSITIONS, errorMessage, formatDateTime, formatSDG, orderStatusDot, orderStatusLabel, orderStatusStyle,
    paymentMethodLabel, paymentStatusLabel, paymentStatusStyle, type OrderStatus,
} from '../../lib/format';

const PROOF_STATUS_LABELS: Record<string, string> = { pending: 'بانتظار المراجعة', verified: 'تم التحقق', rejected: 'مرفوض' };

export const OrderDetailPage: React.FC = () => {
    const { id } = useParams();
    const [order, setOrder] = useState<AdminOrder | null>(null);
    const [history, setHistory] = useState<OrderHistoryEntry[]>([]);
    const [proof, setProof] = useState<PaymentProof | null>(null);
    const [proofUrl, setProofUrl] = useState<string | null>(null);
    const [drivers, setDrivers] = useState<DriverOption[]>([]);
    const [warehouses, setWarehouses] = useState<WarehouseOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const [note, setNote] = useState('');
    const [reviewNote, setReviewNote] = useState('');
    const [driverId, setDriverId] = useState('');
    const [warehouseId, setWarehouseId] = useState('');

    const load = useCallback(async () => {
        if (!id) return;
        setError(null);
        try {
            const [orderData, historyData, proofData] = await Promise.all([fetchOrder(id), fetchOrderHistory(id), fetchPaymentProof(id)]);
            if (!orderData) { setNotFound(true); return; }
            setOrder(orderData);
            setHistory(historyData);
            setProof(proofData);
            setDriverId(orderData.driver_id ?? '');
            setWarehouseId(orderData.fulfillment_warehouse_id ?? '');
            setProofUrl(proofData ? await signedProofUrl(proofData.proof_path) : null);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الطلب.'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (!id) return;
        markOrderViewed(id).catch(() => undefined);
        Promise.all([fetchDrivers(), fetchActiveWarehouses()])
            .then(([d, w]) => { setDrivers(d); setWarehouses(w); })
            .catch((err) => console.error('assignment options', err));
    }, [id]);

    const run = async (action: () => Promise<void>) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            setNote('');
            await load();
        } catch (err) {
            setError(errorMessage(err));
            if (/آخر/.test(errorMessage(err))) await load();
        } finally {
            setBusy(false);
        }
    };

    const changeStatus = (status: OrderStatus) => {
        if (!order) return;
        if (status === 'cancelled' && !window.confirm('هل تريد إلغاء هذا الطلب؟ سيتم إرجاع المخزون والنقاط المستخدمة.')) return;
        void run(() => updateOrderOperation({ orderId: order.id, expectedStatus: order.status, status, note }));
    };

    const saveAssignment = () => {
        if (!order) return;
        void run(() => updateOrderOperation({
            orderId: order.id,
            expectedStatus: order.status,
            driverId: driverId || null,
            warehouseId: warehouseId || null,
            note,
        }));
    };

    const reviewProof = (status: 'verified' | 'rejected') => {
        if (!proof) return;
        void run(() => reviewPaymentProof(proof.id, status, reviewNote));
    };

    const eligibleDrivers = useMemo(
        () => drivers.filter((d) => ['active', 'busy'].includes(d.status) && (!warehouseId || !d.warehouse_id || d.warehouse_id === warehouseId)),
        [drivers, warehouseId],
    );

    const subtotal = useMemo(() => {
        if (!order) return 0;
        const fromSnapshot = order.items.reduce((sum, i) => sum + Number(i.line_total ?? 0), 0);
        return fromSnapshot > 0 ? fromSnapshot : order.total - order.shipping_fee + order.discount_amount + order.points_discount;
    }, [order]);

    if (loading) {
        return <div className="flex items-center justify-center py-32 text-slate-400"><Loader2 className="w-8 h-8 animate-spin" /></div>;
    }
    if (notFound || !order) {
        return (
            <div className="text-center py-32">
                <p className="font-black text-xl text-slate-700 mb-4">الطلب غير موجود</p>
                <Link to="/orders" className="text-brand-blue font-bold underline">العودة إلى الطلبات</Link>
            </div>
        );
    }

    const transitions = ALLOWED_TRANSITIONS[order.status as OrderStatus] ?? [];
    const assignmentLocked = !['new', 'confirmed', 'preparing', 'delivery_failed'].includes(order.status);
    const discount = order.discount_amount + order.points_discount;
    const canReviewProof = proof?.status === 'pending';

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <Link to="/orders" className="inline-flex items-center gap-1 text-sm font-bold text-slate-500 hover:text-brand-blue mb-2">
                        <ArrowRight className="w-4 h-4" /> كل الطلبات
                    </Link>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">{order.order_number ?? order.id.slice(0, 8)}</h1>
                    <p className="text-slate-500 font-medium mt-1">{formatDateTime(order.created_at)}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-black border ${orderStatusStyle(order.status)}`}>{orderStatusLabel(order.status)}</span>
                    <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${paymentStatusStyle(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</span>
                </div>
            </div>

            {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl px-6 py-4 text-sm font-bold">{error}</div>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
                        <h2 className="px-6 py-4 font-black text-slate-900 border-b border-slate-100">المنتجات</h2>
                        <table className="w-full text-right">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-3">المنتج</th>
                                    <th className="px-6 py-3 text-center">الكمية</th>
                                    <th className="px-6 py-3">سعر الوحدة</th>
                                    <th className="px-6 py-3 text-left">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-sm">
                                {order.items.map((item, idx) => {
                                    const unit = item.unit_price != null ? item.unit_price * (1 - (item.discount_percentage ?? 0) / 100) : null;
                                    return (
                                        <tr key={`${item.id}-${idx}`}>
                                            <td className="px-6 py-4 font-bold text-slate-900">
                                                {item.name_ar ?? 'منتج'}
                                                {item.discount_percentage ? <span className="mr-2 text-[10px] text-red-500 font-black">خصم {item.discount_percentage}%</span> : null}
                                            </td>
                                            <td className="px-6 py-4 text-center font-bold">{item.quantity}</td>
                                            <td className="px-6 py-4 text-slate-600">{unit != null ? formatSDG(unit) : '—'}</td>
                                            <td className="px-6 py-4 text-left font-black text-slate-900">{item.line_total != null ? formatSDG(item.line_total) : '—'}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            <tfoot className="text-sm bg-slate-50/50">
                                <tr><td colSpan={3} className="px-6 py-2 text-slate-500 font-bold">المجموع الفرعي</td><td className="px-6 py-2 text-left font-bold">{formatSDG(subtotal)}</td></tr>
                                {discount > 0 && <tr><td colSpan={3} className="px-6 py-2 text-slate-500 font-bold">الخصم</td><td className="px-6 py-2 text-left font-bold text-red-600">- {formatSDG(discount)}</td></tr>}
                                <tr><td colSpan={3} className="px-6 py-2 text-slate-500 font-bold">رسوم التوصيل</td><td className="px-6 py-2 text-left font-bold">{formatSDG(order.shipping_fee)}</td></tr>
                                <tr className="border-t border-slate-200"><td colSpan={3} className="px-6 py-3 font-black text-slate-900">الإجمالي النهائي</td><td className="px-6 py-3 text-left font-black text-brand-blue text-lg">{formatSDG(order.total)}</td></tr>
                            </tfoot>
                        </table>
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Clock className="w-5 h-5 text-brand-blue" /> تغيير الحالة</h2>
                        <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            placeholder="ملاحظة اختيارية تُسجل مع التغيير"
                            rows={2}
                            className="w-full mb-4 p-3 bg-slate-50 border border-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-blue"
                        />
                        {transitions.length === 0 ? (
                            <p className="text-sm text-slate-400 font-bold">لا توجد إجراءات متاحة لهذه الحالة.</p>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {transitions.map((next) => (
                                    <button
                                        key={next}
                                        disabled={busy}
                                        onClick={() => changeStatus(next)}
                                        className={`px-4 py-2 rounded-xl text-sm font-black border transition-colors disabled:opacity-50 ${next === 'cancelled' ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-100' : 'bg-brand-blue text-white border-brand-blue hover:bg-blue-700'}`}
                                    >
                                        {next === 'cancelled' ? 'إلغاء الطلب' : `→ ${orderStatusLabel(next)}`}
                                    </button>
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
                        <h2 className="font-black text-slate-900 mb-4">سجل الحالات</h2>
                        <ol className="space-y-3">
                            {history.map((entry) => (
                                <li key={entry.id} className="flex gap-3 text-sm">
                                    <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${orderStatusDot(entry.status)}`} />
                                    <div>
                                        <p className="font-bold text-slate-900">{orderStatusLabel(entry.status)} <span className="text-slate-400 font-medium text-xs">— {formatDateTime(entry.created_at)}</span></p>
                                        {entry.note && <p className="text-slate-500 text-xs mt-0.5">{entry.note}</p>}
                                    </div>
                                </li>
                            ))}
                            {history.length === 0 && <li className="text-sm text-slate-400">لا يوجد سجل بعد.</li>}
                        </ol>
                    </section>
                </div>

                <div className="space-y-8">
                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-sm">
                        <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><MapPin className="w-5 h-5 text-brand-blue" /> العميل والتوصيل</h2>
                        <p className="font-bold text-slate-900">{order.customer_name}</p>
                        <p className="text-slate-600" dir="ltr">{order.phone}</p>
                        <p className="text-slate-600 mt-3">{[order.shipping_address, order.city, order.state].filter(Boolean).join('، ')}</p>
                        {order.notes && <p className="mt-3 text-slate-500 text-xs bg-slate-50 rounded-xl p-3">{order.notes}</p>}
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-sm">
                        <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><CreditCard className="w-5 h-5 text-brand-blue" /> الدفع</h2>
                        <dl className="space-y-2">
                            <div className="flex justify-between"><dt className="text-slate-500">الطريقة</dt><dd className="font-bold">{paymentMethodLabel(order.payment_method)}</dd></div>
                            <div className="flex justify-between"><dt className="text-slate-500">الحالة</dt><dd className={`px-2 py-0.5 rounded text-xs font-black ${paymentStatusStyle(order.payment_status)}`}>{paymentStatusLabel(order.payment_status)}</dd></div>
                            {order.payment_reference && <div className="flex justify-between"><dt className="text-slate-500">الرقم المرجعي</dt><dd className="font-bold" dir="ltr">{order.payment_reference}</dd></div>}
                        </dl>

                        {proof && (
                            <div className="mt-5 border-t border-slate-100 pt-5">
                                <p className="font-black text-slate-900 mb-3">إثبات الدفع <span className="text-xs font-bold text-slate-400">({PROOF_STATUS_LABELS[proof.status] ?? proof.status})</span></p>
                                {proofUrl ? (
                                    <a href={proofUrl} target="_blank" rel="noreferrer" className="block mb-3">
                                        <img src={proofUrl} alt="إثبات الدفع" className="w-full max-h-72 object-contain rounded-xl border border-slate-100 bg-slate-50" />
                                    </a>
                                ) : (
                                    <p className="text-xs text-slate-400 mb-3">تعذر عرض الصورة.</p>
                                )}
                                <dl className="space-y-1 text-xs">
                                    <div className="flex justify-between"><dt className="text-slate-500">الرقم المرجعي</dt><dd className="font-bold" dir="ltr">{proof.transaction_reference}</dd></div>
                                    <div className="flex justify-between"><dt className="text-slate-500">المبلغ</dt><dd className="font-bold">{formatSDG(proof.amount)}</dd></div>
                                    <div className="flex justify-between"><dt className="text-slate-500">تاريخ الإرسال</dt><dd className="font-bold">{formatDateTime(proof.submitted_at)}</dd></div>
                                    {proof.review_note && <div className="flex justify-between"><dt className="text-slate-500">ملاحظة المراجعة</dt><dd className="font-bold">{proof.review_note}</dd></div>}
                                </dl>
                                {canReviewProof && (
                                    <div className="mt-4 space-y-2">
                                        <input
                                            value={reviewNote}
                                            onChange={(e) => setReviewNote(e.target.value)}
                                            placeholder="ملاحظة (اختياري)"
                                            className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-brand-blue"
                                        />
                                        <div className="flex gap-2">
                                            <button disabled={busy} onClick={() => reviewProof('verified')} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 disabled:opacity-50">
                                                <CheckCircle2 className="w-4 h-4" /> تأكيد الدفع
                                            </button>
                                            <button disabled={busy} onClick={() => reviewProof('rejected')} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-red-50 text-red-600 border border-red-100 text-xs font-black hover:bg-red-100 disabled:opacity-50">
                                                <XCircle className="w-4 h-4" /> رفض
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 text-sm">
                        <h2 className="font-black text-slate-900 mb-4 flex items-center gap-2"><Truck className="w-5 h-5 text-brand-blue" /> التجهيز والتوصيل</h2>
                        <label className="block mb-3">
                            <span className="text-xs font-bold text-slate-500 flex items-center gap-1 mb-1"><Warehouse className="w-3 h-3" /> المخزن</span>
                            <select
                                value={warehouseId}
                                disabled={assignmentLocked || busy}
                                onChange={(e) => setWarehouseId(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-60"
                            >
                                <option value="">— غير محدد —</option>
                                {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name} ({w.city})</option>)}
                            </select>
                        </label>
                        <label className="block mb-4">
                            <span className="text-xs font-bold text-slate-500 mb-1 block">المندوب</span>
                            <select
                                value={driverId}
                                disabled={assignmentLocked || busy}
                                onChange={(e) => setDriverId(e.target.value)}
                                className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:ring-2 focus:ring-brand-blue disabled:opacity-60"
                            >
                                <option value="">— غير محدد —</option>
                                {eligibleDrivers.map((d) => <option key={d.id} value={d.id}>{d.name} · {d.status === 'busy' ? 'مشغول' : 'متاح'}</option>)}
                            </select>
                            {eligibleDrivers.length === 0 && <span className="text-[11px] text-amber-600 font-bold mt-1 block">لا يوجد مندوب متاح لهذا المخزن (يجب أن تكون حالة المندوب "نشط" أو "مشغول").</span>}
                        </label>
                        <button
                            disabled={assignmentLocked || busy}
                            onClick={saveAssignment}
                            className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-black hover:bg-slate-800 disabled:opacity-50"
                        >
                            حفظ التعيين
                        </button>
                        {assignmentLocked && <p className="text-[11px] text-slate-400 mt-2">لا يمكن تغيير التعيين بعد بدء التوصيل.</p>}
                    </section>
                </div>
            </div>
        </div>
    );
};
