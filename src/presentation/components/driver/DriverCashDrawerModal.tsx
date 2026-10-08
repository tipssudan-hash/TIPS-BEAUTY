import React, { useEffect, useState } from 'react';
import { X, Banknote, Clock, Send, Check } from 'lucide-react';
import { fetchDriverCashDrawer, submitDriverCashRemittance, type DriverCashDrawerSummary } from '@infrastructure/repositories';
import { formatSDG, formatRelative } from '@application/services/format';
import { errorMessage } from '@application/errors';
import { Notice, Spinner, inputClass } from '../ui';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export const DriverCashDrawerModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [summary, setSummary] = useState<DriverCashDrawerSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [amount, setAmount] = useState('');
    const [notes, setNotes] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchDriverCashDrawer();
            setSummary(data);
            if (data.unremittedBalance > 0) {
                setAmount(data.unremittedBalance.toString());
            }
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل بيانات العهدة النقدية.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            void load();
            setSuccess(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const num = parseFloat(amount);
        if (isNaN(num) || num <= 0) {
            setError('الرجاء إدخال مبلغ صحيح.');
            return;
        }

        setSubmitting(true);
        setError(null);
        try {
            await submitDriverCashRemittance(num, notes.trim() || undefined);
            setSuccess('تم تسجيل تسليم المبلغ للمشرف بنجاح!');
            setNotes('');
            await load();
        } catch (err) {
            setError(errorMessage(err, 'تعذر تسجيل تسليم العهدة.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn" dir="rtl">
            <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 bg-linear-to-r from-gray-900 to-gray-800 text-white flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-2xl bg-amber-400/20 text-amber-300 flex items-center justify-center">
                            <Banknote className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-bold text-lg">صندوق النقدية (العهدة)</h2>
                            <p className="text-xs text-gray-300">متابعة المبالغ المحصلة وتسليمها للمستودع</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-white/10">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1">
                    {loading ? (
                        <div className="py-12 flex justify-center"><Spinner /></div>
                    ) : summary ? (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200">
                                    <p className="text-xs text-amber-800 font-medium">العهد النقدية المحصلة اليوم</p>
                                    <p className="text-xl font-black text-amber-900 mt-1" dir="ltr">{formatSDG(summary.collectedToday)}</p>
                                    <p className="text-[11px] text-amber-700 mt-0.5">{summary.deliveredCount} طلبات مسلّمة (COD)</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-sky-50 border border-sky-200">
                                    <p className="text-xs text-sky-800 font-medium">المتبقي للتسليم للمشرف</p>
                                    <p className="text-xl font-black text-sky-900 mt-1" dir="ltr">{formatSDG(summary.unremittedBalance)}</p>
                                    <p className="text-[11px] text-sky-700 mt-0.5">جاهز للتوريد</p>
                                </div>
                            </div>

                            {summary.pendingRemittance > 0 && (
                                <div className="flex items-center gap-2.5 p-3 rounded-xl bg-orange-50 border border-orange-200 text-orange-800 text-xs font-bold">
                                    <Clock className="w-4 h-4 shrink-0 text-orange-600" />
                                    <span>يوجد مبلغ {formatSDG(summary.pendingRemittance)} بانتظار تأكيد الاستلام من المشرف.</span>
                                </div>
                            )}

                            {error && <Notice kind="error">{error}</Notice>}
                            {success && <Notice kind="success">{success}</Notice>}

                            {/* Handover / Remittance Form */}
                            <form onSubmit={handleSubmit} className="p-4 rounded-2xl border border-gray-200 bg-gray-50/50 space-y-3">
                                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Send className="w-4 h-4 text-brand-blue" />
                                    تسليم نقدية لمشرف المستودع
                                </h3>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">المبلغ المراد تسليمه (ج.س)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        className={inputClass}
                                        placeholder="0.00"
                                        dir="ltr"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-700 mb-1">ملاحظات التسليم (اختياري)</label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        className={inputClass}
                                        placeholder="مثال: تسليم كامل العهدة لمشرف الوردية"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting || !amount || parseFloat(amount) <= 0}
                                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-brand-blue hover:bg-brand-blue/90 text-white font-bold text-sm shadow-xs transition-colors disabled:opacity-50"
                                >
                                    {submitting ? <Spinner /> : <Check className="w-4 h-4" />}
                                    تأكيد تسليم المبلغ للمشرف
                                </button>
                            </form>

                            {/* Orders Delivered Today Breakdown */}
                            <div>
                                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">الطلبات المسلمة نقداً اليوم ({summary.deliveredOrders.length})</h4>
                                {summary.deliveredOrders.length === 0 ? (
                                    <p className="text-xs text-gray-400 py-3 text-center">لا توجد طلبات مسلّمة نقداً بعد.</p>
                                ) : (
                                    <div className="divide-y divide-gray-100 border border-gray-200 rounded-2xl bg-white overflow-hidden text-xs">
                                        {summary.deliveredOrders.map((o: { id: string; orderNumber: string; customerName: string; codAmount: number; deliveredAt: string | null }) => (
                                            <div key={o.id} className="p-3 flex items-center justify-between gap-2">
                                                <div>
                                                    <span className="font-bold text-gray-900 block">{o.customerName}</span>
                                                    <span className="text-gray-500 text-[11px]">{o.orderNumber}{o.deliveredAt ? ` · ${formatRelative(o.deliveredAt)}` : ''}</span>
                                                </div>
                                                <span className="font-bold text-emerald-700 font-mono text-sm" dir="ltr">+{formatSDG(o.codAmount)}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : null}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-300 bg-white text-gray-700 text-sm font-bold hover:bg-gray-100">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
};
