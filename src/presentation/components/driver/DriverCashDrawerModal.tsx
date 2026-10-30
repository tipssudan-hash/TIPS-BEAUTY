import React, { useEffect, useState } from 'react';
import { X, Banknote, Clock, Send, Check } from 'lucide-react';
import { fetchMyCashPosition, submitDriverCashRemittance, type CashPosition, type CashPositionEntry } from '@infrastructure/repositories';
import { formatSDG, formatRelative } from '@application/services/format';
import { errorMessage } from '@application/errors';
import { Notice, Spinner } from '../ui';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const ENTRY_LABEL: Record<CashPositionEntry['entryType'], string> = {
    cod_collected: 'تحصيل نقدي',
    remittance_confirmed: 'تسليم مؤكد للمشرف',
    adjustment: 'تعديل الإدارة',
};

export const DriverCashDrawerModal: React.FC<Props> = ({ isOpen, onClose }) => {
    const [position, setPosition] = useState<CashPosition | null>(null);
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
            const data = await fetchMyCashPosition();
            setPosition(data);
            setAmount(data.closingBalance > 0 ? data.closingBalance.toString() : '');
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

    const closing = position?.closingBalance ?? 0;
    const hasPending = (position?.pendingSubmitted ?? 0) > 0;
    const num = parseFloat(amount);
    const amountValid = !Number.isNaN(num) && num > 0 && num <= closing;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (hasPending) {
            setError('توجد تسليمة بانتظار تأكيد المشرف، لا يمكن إرسال تسليمة أخرى الآن.');
            return;
        }
        if (!amountValid) {
            setError('الرجاء إدخال مبلغ صحيح لا يتجاوز الرصيد المستحق.');
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn text-black" dir="rtl">
            <div className="w-full max-w-lg bg-white rounded-lg border-2 border-gray-400 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-5 bg-black text-white flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-md bg-amber-400 text-black flex items-center justify-center">
                            <Banknote className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="font-black text-lg text-white">صندوق النقدية (العهدة)</h2>
                            <p className="text-xs text-gray-300 font-bold">متابعة المبالغ المحصلة وتسليمها للمستودع</p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="p-2 text-white hover:bg-white/20 rounded-md transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-5 overflow-y-auto space-y-5 flex-1 text-black">
                    {loading ? (
                        <div className="py-12 flex justify-center"><Spinner /></div>
                    ) : position ? (
                        <>
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-md bg-amber-100 border-2 border-amber-400 text-black">
                                    <p className="text-xs text-black font-black">العهد النقدية المحصلة اليوم</p>
                                    <p className="text-2xl font-black text-black mt-1 font-mono" dir="ltr">{formatSDG(position.collected)}</p>
                                    <p className="text-xs text-black font-bold mt-1">رصيد أول المدة {formatSDG(position.openingBalance)}</p>
                                </div>
                                <div className="p-4 rounded-md bg-blue-100 border-2 border-blue-400 text-black">
                                    <p className="text-xs text-black font-black">المتبقي للتسليم للمشرف</p>
                                    <p className="text-2xl font-black text-black mt-1 font-mono" dir="ltr">{formatSDG(position.closingBalance)}</p>
                                    <p className="text-xs text-black font-bold mt-1">مسلَّم ومؤكد {formatSDG(position.remittedConfirmed)}</p>
                                </div>
                            </div>

                            {hasPending && (
                                <div className="flex items-center gap-2.5 p-3.5 rounded-md bg-orange-100 border-2 border-orange-400 text-black text-xs font-black">
                                    <Clock className="w-4 h-4 shrink-0 text-black" />
                                    <span>يوجد مبلغ {formatSDG(position.pendingSubmitted)} بانتظار تأكيد الاستلام من المشرف.</span>
                                </div>
                            )}

                            {error && <Notice kind="error">{error}</Notice>}
                            {success && <Notice kind="success">{success}</Notice>}

                            {/* Handover / Remittance Form */}
                            <form onSubmit={handleSubmit} className="p-4 rounded-md border-2 border-gray-300 bg-gray-100 space-y-3.5 text-black">
                                <h3 className="text-sm font-black text-black flex items-center gap-2">
                                    <Send className="w-4 h-4 text-black" />
                                    تسليم نقدية لمشرف المستودع
                                </h3>
                                <div>
                                    <label className="block text-xs font-black text-black mb-1">المبلغ المراد تسليمه (ج.س)</label>
                                    <input
                                        type="number"
                                        step="any"
                                        required
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        disabled={hasPending}
                                        className="w-full px-3.5 py-2.5 rounded-md border-2 border-gray-400 bg-white text-base font-black text-black focus:border-black outline-hidden disabled:opacity-50"
                                        placeholder="0.00"
                                        dir="ltr"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-black text-black mb-1">ملاحظات التسليم (اختياري)</label>
                                    <input
                                        type="text"
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        disabled={hasPending}
                                        className="w-full px-3.5 py-2.5 rounded-md border-2 border-gray-400 bg-white text-sm font-bold text-black focus:border-black outline-hidden disabled:opacity-50"
                                        placeholder="مثال: تسليم كامل العهدة لمشرف الوردية"
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={submitting || hasPending || !amountValid}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-md bg-black hover:bg-gray-800 text-white font-black text-sm shadow-xs transition-colors disabled:opacity-50"
                                >
                                    {submitting ? <Spinner /> : <Check className="w-4 h-4 text-white" />}
                                    تأكيد تسليم المبلغ للمشرف
                                </button>
                            </form>

                            {/* Today's ledger entries */}
                            <div>
                                <h4 className="text-xs font-black text-black uppercase tracking-wider mb-2">حركات اليوم ({position.entries.length})</h4>
                                {position.entries.length === 0 ? (
                                    <p className="text-xs text-black font-bold py-3 text-center">لا توجد حركات نقدية اليوم بعد.</p>
                                ) : (
                                    <div className="divide-y-2 divide-gray-200 border-2 border-gray-300 rounded-md bg-white overflow-hidden text-xs text-black">
                                        {position.entries.map((e, index) => (
                                            <div key={`${e.createdAt}-${index}`} className="p-3 flex items-center justify-between gap-2">
                                                <div>
                                                    <span className="font-black text-black text-sm block">{ENTRY_LABEL[e.entryType]}</span>
                                                    <span className="text-black font-bold text-xs">
                                                        {e.orderNumber ? `${e.orderNumber} · ` : ''}{formatRelative(e.createdAt)}
                                                    </span>
                                                </div>
                                                <span className="font-black text-black font-mono text-sm" dir="ltr">
                                                    {e.amount > 0 ? '+' : ''}{formatSDG(e.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        error && <Notice kind="error">{error}</Notice>
                    )}
                </div>

                <div className="p-4 border-t-2 border-gray-200 bg-gray-100 flex justify-end">
                    <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-md border-2 border-gray-400 bg-white text-black text-sm font-black hover:bg-gray-200">
                        إغلاق
                    </button>
                </div>
            </div>
        </div>
    );
};
