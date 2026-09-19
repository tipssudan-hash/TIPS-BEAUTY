import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Order, OrderStatusEntry, PaymentMethod } from '../../types';
import { fetchMyOrder, fetchOrderHistory, fetchPaymentMethods, cancelMyOrder, uploadPaymentProof, submitPaymentProof, errorMessage } from '../../lib/api';
import { discountedPrice, formatSDG, formatDateTime } from '../../lib/pricing';
import { useAuth } from '../../context/AuthContext';
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_METHOD_LABELS, StatusBadge } from './MyOrdersPage';

const MAX_PROOF_BYTES = 5 * 1024 * 1024;

type LocationState = { justOrdered?: boolean; orderNumber?: string; proofWarning?: string } | null;

export const OrderDetailPage: React.FC = () => {
    const { id } = useParams();
    const { user } = useAuth();
    const location = useLocation();
    const state = (location.state ?? null) as LocationState;

    const [order, setOrder] = useState<Order | null>(null);
    const [history, setHistory] = useState<OrderStatusEntry[]>([]);
    const [methods, setMethods] = useState<PaymentMethod[]>([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [cancelling, setCancelling] = useState(false);
    const [reference, setReference] = useState('');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [proofError, setProofError] = useState<string | null>(null);
    const [proofSubmitting, setProofSubmitting] = useState(false);
    const [notice, setNotice] = useState<string | null>(state?.proofWarning ?? null);

    const load = useCallback(async () => {
        if (!id) return;
        setError(null);
        try {
            const [o, h] = await Promise.all([fetchMyOrder(id), fetchOrderHistory(id)]);
            if (!o) { setNotFound(true); return; }
            setOrder(o);
            setHistory(h);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل الطلب.'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        fetchPaymentMethods().then(setMethods).catch(err => console.error('payment methods', err));
    }, []);

    const method = order ? methods.find(m => m.code === order.paymentMethod) ?? null : null;
    const needsProof = !!order && !!method?.requiresProof && order.paymentStatus === 'pending' && order.status !== 'cancelled';

    const handleCancel = async () => {
        if (!order || !window.confirm('هل تريدين إلغاء هذا الطلب؟')) return;
        setCancelling(true);
        setError(null);
        try {
            await cancelMyOrder(order.id);
            await load();
            setNotice('تم إلغاء الطلب.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر إلغاء الطلب.'));
        } finally {
            setCancelling(false);
        }
    };

    const handleProofChange = (file: File | null) => {
        setProofError(null);
        if (!file) { setProofFile(null); return; }
        if (!file.type.startsWith('image/')) { setProofError('يرجى اختيار صورة للإيصال.'); setProofFile(null); return; }
        if (file.size > MAX_PROOF_BYTES) { setProofError('حجم الصورة يجب ألا يتجاوز 5 ميجابايت.'); setProofFile(null); return; }
        setProofFile(file);
    };

    const handleProofSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!order || !user || !method) return;
        if (!reference.trim()) { setProofError('يرجى إدخال رقم العملية.'); return; }
        if (!proofFile) { setProofError('يرجى إرفاق صورة الإيصال.'); return; }
        setProofSubmitting(true);
        setProofError(null);
        try {
            const path = await uploadPaymentProof(user.id, order.id, proofFile);
            await submitPaymentProof(order.id, method.code, order.total, reference.trim(), path);
            setReference('');
            setProofFile(null);
            await load();
            setNotice('تم إرسال إثبات الدفع وسيتم مراجعته قريباً.');
        } catch (err) {
            setProofError(errorMessage(err, 'تعذر إرسال إثبات الدفع.'));
        } finally {
            setProofSubmitting(false);
        }
    };

    if (loading) {
        return <div className="min-h-[50vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-brand-blue" /></div>;
    }

    if (notFound || !order) {
        return (
            <div className="p-8 text-center">
                <h1 className="text-2xl font-bold mb-4">الطلب غير موجود</h1>
                <Link to="/orders" className="text-brand-blue underline">العودة إلى طلباتي</Link>
            </div>
        );
    }

    const hasSnapshot = order.items.some(i => i.line_total != null);
    const subtotal = hasSnapshot ? order.items.reduce((s, i) => s + Number(i.line_total ?? 0), 0) : null;
    const address = [order.shippingAddress, order.city, order.state].filter(Boolean).join('، ');
    const inputClass = 'w-full bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-blue';

    return (
        <div className="max-w-4xl mx-auto p-4 space-y-6">
            <Link to="/orders" className="text-brand-blue text-sm hover:underline inline-block">← العودة إلى طلباتي</Link>

            {state?.justOrdered && (
                <div className="bg-green-50 border border-green-100 text-green-800 rounded-2xl p-5 flex items-start gap-3">
                    <CheckCircle2 className="w-6 h-6 shrink-0" />
                    <div>
                        <p className="font-bold">تم استلام طلبك بنجاح!</p>
                        <p className="text-sm mt-1">رقم الطلب: <span className="font-bold">{state.orderNumber ?? order.orderNumber}</span>. سنتواصل معك لتأكيده قريباً.</p>
                    </div>
                </div>
            )}

            {notice && <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-xl p-4 text-sm">{notice}</div>}
            {error && <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl p-4 text-sm">{error}</div>}

            <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800">طلب {order.orderNumber}</h1>
                        <p className="text-xs text-gray-500 mt-1">{formatDateTime(order.createdAt)}</p>
                    </div>
                    <StatusBadge status={order.status} />
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 border-b border-gray-100">
                                <th className="text-right py-2 font-semibold">المنتج</th>
                                <th className="text-center py-2 font-semibold">الكمية</th>
                                <th className="text-left py-2 font-semibold">الإجمالي</th>
                            </tr>
                        </thead>
                        <tbody>
                            {order.items.map((item, idx) => {
                                const unit = item.unit_price != null ? discountedPrice(Number(item.unit_price), item.discount_percentage) : null;
                                const line = item.line_total != null ? Number(item.line_total) : unit != null ? unit * item.quantity : null;
                                return (
                                    <tr key={`${item.id}-${idx}`} className="border-b border-gray-50">
                                        <td className="py-3">
                                            <p className="font-bold text-gray-800">{item.name_ar ?? 'منتج'}</p>
                                            {unit != null && <p className="text-xs text-gray-500">{formatSDG(unit)} للقطعة</p>}
                                        </td>
                                        <td className="py-3 text-center">{item.quantity}</td>
                                        <td className="py-3 text-left font-medium">{line != null ? formatSDG(line) : '—'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                <div className="space-y-2 border-t border-gray-100 pt-4 mt-4 text-sm">
                    {subtotal != null && (
                        <div className="flex justify-between text-gray-600"><span>المجموع الفرعي</span><span>{formatSDG(subtotal)}</span></div>
                    )}
                    {order.discountAmount > 0 && (
                        <div className="flex justify-between text-gray-600"><span>الخصم</span><span>- {formatSDG(order.discountAmount)}</span></div>
                    )}
                    <div className="flex justify-between text-gray-600"><span>رسوم التوصيل</span><span>{formatSDG(order.shippingFee)}</span></div>
                    <div className="flex justify-between font-bold text-lg text-gray-800 pt-2"><span>الإجمالي النهائي</span><span className="text-brand-blue">{formatSDG(order.total)}</span></div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-6 text-sm space-y-2">
                    <h2 className="font-bold text-gray-800 mb-3">التوصيل والدفع</h2>
                    <p><span className="text-gray-500">العنوان:</span> <span className="text-gray-800">{address}</span></p>
                    <p><span className="text-gray-500">طريقة الدفع:</span> <span className="text-gray-800">{method?.nameAr ?? PAYMENT_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}</span></p>
                    <p><span className="text-gray-500">حالة الدفع:</span> <span className="text-gray-800">{PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</span></p>
                    {order.paymentReference && <p><span className="text-gray-500">رقم العملية:</span> <span className="text-gray-800">{order.paymentReference}</span></p>}

                    {order.status === 'new' && (
                        <button
                            type="button"
                            onClick={handleCancel}
                            disabled={cancelling}
                            className="mt-4 w-full border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 font-bold py-2.5 rounded-xl transition-colors"
                        >
                            {cancelling ? 'جاري الإلغاء...' : 'إلغاء الطلب'}
                        </button>
                    )}
                </div>

                <div className="bg-white rounded-2xl shadow-sm border border-brand-blue-soft p-6">
                    <h2 className="font-bold text-gray-800 mb-3">مسار الطلب</h2>
                    {history.length === 0 ? (
                        <p className="text-sm text-gray-500">{ORDER_STATUS_LABELS[order.status]}</p>
                    ) : (
                        <ol className="space-y-3 text-sm">
                            {history.map(entry => (
                                <li key={entry.id} className="flex gap-3">
                                    <span className="w-2 h-2 mt-2 rounded-full bg-brand-blue shrink-0" />
                                    <div>
                                        <p className="font-bold text-gray-800">{ORDER_STATUS_LABELS[entry.status] ?? entry.status}</p>
                                        <p className="text-xs text-gray-500">{formatDateTime(entry.createdAt)}</p>
                                        {entry.note && <p className="text-xs text-gray-600 mt-0.5">{entry.note}</p>}
                                    </div>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>

            {needsProof && (
                <form onSubmit={handleProofSubmit} className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 space-y-3">
                    <h2 className="font-bold text-gray-800">إرفاق إثبات الدفع</h2>
                    <p className="text-xs text-gray-500">حوّلي المبلغ {formatSDG(order.total)} ثم أدخلي رقم العملية وصورة الإيصال ليتم تأكيد طلبك.</p>
                    {Object.entries(method?.accountDetails ?? {}).length > 0 && (
                        <div className="text-xs bg-gray-50 rounded-lg p-2 border border-gray-100 space-y-1">
                            {Object.entries(method!.accountDetails).map(([k, v]) => <p key={k} className="text-gray-600"><span className="font-semibold">{k}:</span> {String(v)}</p>)}
                        </div>
                    )}
                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">رقم العملية</label>
                        <input required value={reference} onChange={e => setReference(e.target.value)} className={inputClass} />
                    </div>
                    <div>
                        <label className="text-sm font-bold text-gray-700 block mb-1">صورة الإيصال (حتى 5 ميجابايت)</label>
                        <input required type="file" accept="image/*" onChange={e => handleProofChange(e.target.files?.[0] ?? null)} className="w-full text-sm text-gray-600 file:ml-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-brand-blue-soft file:text-brand-blue file:font-bold" />
                    </div>
                    {proofError && <p className="text-xs text-red-600">{proofError}</p>}
                    <button type="submit" disabled={proofSubmitting} className="w-full bg-brand-blue hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-3 rounded-xl transition-all">
                        {proofSubmitting ? 'جاري الإرسال...' : 'إرسال إثبات الدفع'}
                    </button>
                </form>
            )}
        </div>
    );
};
