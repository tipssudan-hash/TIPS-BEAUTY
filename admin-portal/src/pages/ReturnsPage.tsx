import React, { useEffect, useMemo, useState } from 'react';
import { Undo2, CheckCircle2, X, Loader2, Package, Wallet } from 'lucide-react';
import type { OrderReturn, ReturnStatus } from '../types';
import { fetchOrderReturns, reviewOrderReturn } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime } from '../lib/format';
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

type ReviewModal = { ret: OrderReturn; nextStatus: ReturnStatus; note: string; restock: boolean };

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

    const submitReview = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!modal) return;
        if (modal.nextStatus === 'rejected' && modal.note.trim().length < 3) {
            setError('يرجى كتابة سبب الرفض.');
            return;
        }
        setSubmitting(true);
        setError(null);
        try {
            await reviewOrderReturn(modal.ret.id, modal.nextStatus, modal.note, modal.restock);
            setModal(null);
            setSuccessMessage('تم تحديث حالة طلب الإرجاع بنجاح.');
            setTimeout(() => setSuccessMessage(null), 4000);
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
            <PageHeader title="المرتجعات" subtitle="طلبات إرجاع المنتجات: الموافقة أو الرفض، تسجيل الاستلام وإعادة المخزون، وتأكيد الاسترداد." icon={<Undo2 className="w-8 h-8 text-brand-blue" />} />

            {error && <Notice kind="error">{error}</Notice>}
            {successMessage && <Notice kind="success">{successMessage}</Notice>}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex gap-2 flex-wrap bg-slate-50/30">
                    {([['all', 'الكل'], ['requested', 'قيد المراجعة'], ['approved', 'معتمد'], ['received', 'تم الاستلام'], ['refunded', 'تم الاسترداد'], ['rejected', 'مرفوض'], ['closed', 'مغلق']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setFilter(value)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
                    ))}
                </div>
                <Table headers={['الطلب', 'العميلة', 'المنتجات', 'السبب', 'النوع', 'الحالة', 'التاريخ', 'الإجراء']} empty={visible.length === 0} emptyText="لا توجد طلبات إرجاع.">
                    {visible.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-sm font-black text-brand-blue" dir="ltr">{r.order_number ?? r.order_id}</td>
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
                                            <button type="button" onClick={() => setModal({ ret: r, nextStatus: 'approved', note: '', restock: false })} className={`${smallButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}>موافقة</button>
                                            <button type="button" onClick={() => setModal({ ret: r, nextStatus: 'rejected', note: '', restock: false })} className={`${smallButtonClass} bg-red-50 text-red-600 hover:bg-red-100`}>رفض</button>
                                        </>
                                    )}
                                    {r.status === 'approved' && (
                                        <button type="button" onClick={() => setModal({ ret: r, nextStatus: 'received', note: '', restock: true })} className={`${smallButtonClass} bg-amber-50 text-amber-700 hover:bg-amber-100 flex items-center gap-1`}>
                                            <Package className="w-3.5 h-3.5" /> تسجيل الاستلام
                                        </button>
                                    )}
                                    {r.status === 'received' && r.requested_resolution === 'refund' && (
                                        <button type="button" onClick={() => setModal({ ret: r, nextStatus: 'refunded', note: '', restock: false })} className={`${smallButtonClass} bg-blue-50 text-brand-blue hover:bg-blue-100 flex items-center gap-1`}>
                                            <Wallet className="w-3.5 h-3.5" /> تأكيد الاسترداد
                                        </button>
                                    )}
                                    {r.status === 'received' && r.requested_resolution === 'exchange' && (
                                        <button type="button" onClick={() => setModal({ ret: r, nextStatus: 'closed', note: '', restock: false })} className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200`}>إغلاق</button>
                                    )}
                                    {r.admin_note && r.status !== 'requested' && <span className="text-[10px] text-slate-400" title={r.admin_note}>ملاحظة</span>}
                                </div>
                            </td>
                        </tr>
                    ))}
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
                                {modal.ret.items.map((i) => `${i.name_ar ?? 'منتج'} ×${i.quantity}`).join('، ')}
                            </div>
                            <Field label="ملاحظة الإدارة" required={modal.nextStatus === 'rejected'} hint={modal.nextStatus === 'rejected' ? 'سبب الرفض — يظهر للعميلة' : 'اختياري'}>
                                <textarea value={modal.note} onChange={(e) => setModal({ ...modal, note: e.target.value })} className={inputClass} rows={3} required={modal.nextStatus === 'rejected'} />
                            </Field>
                            {modal.nextStatus === 'received' && (
                                <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
                                    <input type="checkbox" checked={modal.restock} onChange={(e) => setModal({ ...modal, restock: e.target.checked })} />
                                    إعادة المنتجات إلى مخزون الطلب الأصلي
                                </label>
                            )}
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setModal(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={submitting} className="bg-slate-900 hover:bg-slate-800 text-white font-black px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50">
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
