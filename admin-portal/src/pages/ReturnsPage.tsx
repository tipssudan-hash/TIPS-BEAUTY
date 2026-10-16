import React, { useEffect, useMemo, useState } from 'react';
import { Undo2, CheckCircle2, X, Loader2, Package, Wallet, ShieldAlert } from 'lucide-react';
import type { OrderReturn, ReturnStatus } from '../types';
import { fetchOrderReturns, reviewOrderReturn } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatSDG } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const STATUS_LABELS: Record<ReturnStatus, string> = {
    requested: 'قيد المراجعة',
    approved: 'معتمد',
    rejected: 'مرفوض',
    received: 'تم الاستلام',
    refunded: 'تم الاسترداد',
    closed: 'مغلق',
};

const STATUS_TONE: Record<ReturnStatus, 'success' | 'attention' | 'danger' | 'neutral'> = {
    requested: 'attention',
    approved: 'success',
    rejected: 'danger',
    received: 'attention',
    refunded: 'success',
    closed: 'neutral',
};

type ReviewModal = {
    ret: OrderReturn;
    nextStatus: ReturnStatus;
    note: string;
    restock: boolean;
    refundAmount: string;
    refundReference: string;
};

export const ReturnsPage: React.FC = () => {
    const [returns, setReturns] = useState<OrderReturn[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | ReturnStatus>('all');
    const [modal, setModal] = useState<ReviewModal | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setReturns(await fetchOrderReturns());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل طلبات الإرجاع.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const visible = useMemo(() => returns.filter((r) => filter === 'all' || r.status === filter), [returns, filter]);

    const openModal = (ret: OrderReturn, nextStatus: ReturnStatus, restock = false) => {
        setModal({
            ret,
            nextStatus,
            note: '',
            restock,
            refundAmount: ret.order_total != null ? String(ret.order_total) : '',
            refundReference: '',
        });
    };

    const submitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modal) return;

        if (modal.nextStatus === 'rejected' && modal.note.trim().length < 3) {
            setError('يرجى كتابة سبب الرفض لحفظ حقوق العميل.');
            return;
        }

        // Anti-scam: Refund validation
        let parsedRefundAmount: number | undefined = undefined;
        if (modal.nextStatus === 'refunded') {
            if (modal.ret.order_payment_status !== 'paid') {
                setError('لا يمكن إتمام الاسترداد المالي لأن الطلب غير مسجل كمدفوع ومؤكد في النظام (منعاً للاحتيال).');
                return;
            }
            parsedRefundAmount = Number(modal.refundAmount);
            if (!parsedRefundAmount || parsedRefundAmount <= 0) {
                setError('يرجى إدخال مبلغ استرداد صحيح أكبر من الصفر.');
                return;
            }
            if (modal.ret.order_total != null && parsedRefundAmount > modal.ret.order_total) {
                setError('مبلغ الاسترداد لا يمكن أن يتجاوز إجمالي قيمة الطلب.');
                return;
            }
            if (!modal.refundReference.trim()) {
                setError('يرجى إدخال الرقم المرجعي لإشعار التحويل البنكي لحفظ السجل المالي.');
                return;
            }
        }

        setSubmitting(true);
        setError(null);
        try {
            await reviewOrderReturn(
                modal.ret.id,
                modal.nextStatus,
                modal.note,
                modal.restock,
                parsedRefundAmount,
                modal.refundReference.trim() || undefined,
            );
            setModal(null);
            setSuccessMessage(modal.nextStatus === 'refunded' ? 'تم تأكيد الاسترداد المالي وتحديث مالية الطلب وتوثيق العملية بنجاح.' : 'تم تحديث حالة طلب الإرجاع بنجاح.');
            setTimeout(() => setSuccessMessage(null), 5000);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المرتجعات"
                subtitle="إدارة طلبات المرتجعات: اعتماد أو رفض الطلبات، تسجيل استلام البضائع بالمستودع، وحماية الاسترداد المالي الموثق."
                icon={<Undo2 className="w-8 h-8 text-brand-blue" />}
            />

            {error && <Notice kind="error">{error}</Notice>}
            {successMessage && <Notice kind="success">{successMessage}</Notice>}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex gap-2 flex-wrap bg-slate-50/30">
                    {([['all', 'الكل'], ['requested', 'قيد المراجعة'], ['approved', 'معتمد'], ['received', 'تم الاستلام'], ['refunded', 'تم الاسترداد'], ['rejected', 'مرفوض'], ['closed', 'مغلق']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setFilter(value)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
                    ))}
                </div>
                <Table headers={['الطلب والدفع', 'العميلة', 'المنتجات', 'السبب', 'النوع', 'الحالة', 'التاريخ', 'الإجراء']} empty={visible.length === 0} emptyText="لا توجد طلبات إرجاع.">
                    {visible.map((r) => {
                        const isOrderPaid = r.order_payment_status === 'paid';
                        return (
                            <tr key={r.id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4">
                                    <span className="text-sm font-black text-brand-blue block" dir="ltr">{r.order_number ?? r.order_id}</span>
                                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-black ${isOrderPaid ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-amber-100 text-amber-800 border border-amber-200'}`}>
                                            {isOrderPaid ? 'مدفوع ✓' : `دفع: ${r.order_payment_status || 'غير مؤكد'}`}
                                        </span>
                                        {r.order_total != null && (
                                            <span className="text-[11px] font-bold text-slate-500">{formatSDG(r.order_total)}</span>
                                        )}
                                    </div>
                                    {r.refund_amount != null && r.refund_amount > 0 && (
                                        <span className="text-[10px] text-blue-600 font-bold block mt-0.5">
                                            المسترد: {formatSDG(r.refund_amount)}
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                    {r.customer_name || '—'}
                                    {r.phone && <span className="block text-slate-400" dir="ltr">{r.phone}</span>}
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-700 max-w-xs">
                                    {r.items.map((i) => `${i.name_ar ?? 'منتج'} ×${i.quantity}`).join('، ')}
                                </td>
                                <td className="px-6 py-4 text-xs text-slate-600 max-w-xs whitespace-pre-wrap">{r.reason}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-700">{r.requested_resolution === 'refund' ? 'استرداد' : 'استبدال'}</td>
                                <td className="px-6 py-4"><StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABELS[r.status]}</StatusPill></td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{formatDateTime(r.created_at)}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1.5">
                                        {r.status === 'requested' && (
                                            <>
                                                <button type="button" onClick={() => openModal(r, 'approved')} className={`${smallButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>موافقة</button>
                                                <button type="button" onClick={() => openModal(r, 'rejected')} className={`${smallButtonClass} bg-red-50 text-red-600 hover:bg-red-100`}>رفض</button>
                                            </>
                                        )}
                                        {r.status === 'approved' && (
                                            <button type="button" onClick={() => openModal(r, 'received', true)} className={`${smallButtonClass} bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1`}>
                                                <Package className="w-3.5 h-3.5" /> تسجيل الاستلام
                                            </button>
                                        )}
                                        {r.status === 'received' && r.requested_resolution === 'refund' && (
                                            <button
                                                type="button"
                                                onClick={() => openModal(r, 'refunded')}
                                                className={`${smallButtonClass} ${isOrderPaid ? 'bg-blue-50 text-brand-blue hover:bg-blue-100' : 'bg-slate-100 text-slate-400 cursor-not-allowed'} flex items-center gap-1`}
                                                title={!isOrderPaid ? 'الطلب غير مؤكد الدفع في النظام' : undefined}
                                            >
                                                <Wallet className="w-3.5 h-3.5" /> تأكيد الاسترداد
                                            </button>
                                        )}
                                        {r.status === 'received' && r.requested_resolution === 'exchange' && (
                                            <button type="button" onClick={() => openModal(r, 'closed')} className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}>إغلاق</button>
                                        )}
                                        {r.refund_reference && (
                                            <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100" title={`مرجع الاسترداد: ${r.refund_reference}`}>
                                                مرجع: {r.refund_reference}
                                            </span>
                                        )}
                                        {r.admin_note && r.status !== 'requested' && <span className="text-[10px] text-slate-400" title={r.admin_note}>ملاحظة</span>}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Card>

            {modal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in">
                        <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
                            <h3 className="font-black text-lg">{STATUS_LABELS[modal.nextStatus]} — طلب {modal.ret.order_number ?? modal.ret.order_id}</h3>
                            <button type="button" onClick={() => setModal(null)} className="text-white/80 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <form onSubmit={submitReview} className="p-6 space-y-4">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600">
                                <span className="font-bold text-slate-800 block mb-1">المنتجات المراد معالجتها:</span>
                                {modal.ret.items.map((i) => `${i.name_ar ?? 'منتج'} ×${i.quantity}`).join('، ')}
                            </div>

                            {/* Anti-scam safety box when refunding */}
                            {modal.nextStatus === 'refunded' && (
                                <>
                                    {modal.ret.order_payment_status !== 'paid' ? (
                                        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2.5">
                                            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-black text-sm">تحذير أمان: لا يمكن استرداد طلب غير مدفوع!</p>
                                                <p className="mt-1 leading-relaxed">
                                                    حالة دفع هذا الطلب في النظام هي <strong>"{modal.ret.order_payment_status || 'معلق/غير معروف'}"</strong> وليست <strong>"مدفوع"</strong>.
                                                    منعاً للاحتيال وخروج أموال دون تحصيل مسبق، يُحظر نظامياً إصدار استرداد مالي لهذا الطلب.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-2 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs">
                                            <div className="flex items-center justify-between">
                                                <span className="text-slate-600 font-bold">حالة الدفع الأصلية:</span>
                                                <span className="font-black text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">مدفوع ومؤكد في النظام ✓</span>
                                            </div>
                                            {modal.ret.order_total != null && (
                                                <div className="flex items-center justify-between">
                                                    <span className="text-slate-600 font-bold">إجمالي فاتورة الطلب:</span>
                                                    <span className="font-black text-slate-900">{formatSDG(modal.ret.order_total)}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <Field label="المبلغ المسترد للعميل (ج.س)" required hint="القيمة المالية التي تم تحويلها وإرجاعها للعميل">
                                        <input
                                            type="number"
                                            min="1"
                                            step="any"
                                            disabled={modal.ret.order_payment_status !== 'paid'}
                                            value={modal.refundAmount}
                                            onChange={(e) => setModal({ ...modal, refundAmount: e.target.value })}
                                            className={inputClass}
                                            placeholder="أدخل المبلغ المسترد"
                                            required
                                        />
                                    </Field>

                                    <Field
                                        label="الرقم المرجعي للإشعار البنكي (بنكك / فوري / كاش)"
                                        required
                                        hint="الرقم المرجعي للتحويل الصادر من حساب المتجر لحساب العميل للتوثيق المحاسبي"
                                    >
                                        <input
                                            type="text"
                                            disabled={modal.ret.order_payment_status !== 'paid'}
                                            value={modal.refundReference}
                                            onChange={(e) => setModal({ ...modal, refundReference: e.target.value })}
                                            className={inputClass}
                                            placeholder="مثال: FT26101788934"
                                            required
                                        />
                                    </Field>
                                </>
                            )}

                            <Field
                                label="ملاحظة الإدارة"
                                required={modal.nextStatus === 'rejected'}
                                hint={modal.nextStatus === 'rejected' ? 'سبب الرفض — يظهر للعميلة في الإشعار الداخلي' : 'ملاحظات تدقيق اختيارية'}
                            >
                                <textarea
                                    value={modal.note}
                                    onChange={(e) => setModal({ ...modal, note: e.target.value })}
                                    className={inputClass}
                                    rows={3}
                                    required={modal.nextStatus === 'rejected'}
                                    placeholder={modal.nextStatus === 'rejected' ? 'اكتب سبب الرفض بوضوح...' : 'أدخل أي ملاحظات تدقيق إضافية...'}
                                />
                            </Field>

                            {modal.nextStatus === 'received' && (
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                                    <input type="checkbox" checked={modal.restock} onChange={(e) => setModal({ ...modal, restock: e.target.checked })} />
                                    إعادة المنتجات المستلمة تلقائياً إلى مخزون المستودع الأصلي
                                </label>
                            )}

                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setModal(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button
                                    type="submit"
                                    disabled={submitting || (modal.nextStatus === 'refunded' && modal.ret.order_payment_status !== 'paid')}
                                    className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    تأكيد
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
