import React, { useEffect, useState } from 'react';
import { HandCoins, Loader2, CheckCircle2, XCircle, AlertTriangle, Lock } from 'lucide-react';
import { fetchPendingRemittances, confirmRemittanceAsAdmin, type CashRemittanceRow } from '../../lib/adminApi';
import { formatSDG, formatDateTime } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Card, Notice, PageHeader } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';

const STATUS_LABELS: Record<CashRemittanceRow['status'], string> = {
    submitted: 'بانتظار التأكيد',
    confirmed: 'مؤكدة',
    rejected: 'مرفوضة',
};

const STATUS_STYLES: Record<CashRemittanceRow['status'], string> = {
    submitted: 'bg-amber-50 text-amber-700 border-amber-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rejected: 'bg-red-50 text-red-600 border-red-200',
};

type ActionModal = {
    remittance: CashRemittanceRow;
    action: 'confirmed' | 'rejected';
    notes: string;
};

export const CustodyPage: React.FC = () => {
    const { user } = useAuth();
    const [rows, setRows] = useState<CashRemittanceRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [modal, setModal] = useState<ActionModal | null>(null);
    const [password, setPassword] = useState('');
    const [modalError, setModalError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [filterStatus, setFilterStatus] = useState<string>('submitted');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchPendingRemittances();
            setRows(data);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل العهد.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const openModal = (remittance: CashRemittanceRow, action: 'confirmed' | 'rejected') => {
        setModal({ remittance, action, notes: '' });
        setPassword('');
        setModalError(null);
    };

    const handleAction = async () => {
        if (!modal) return;
        setModalError(null);

        if (modal.action === 'confirmed') {
            if (!password.trim()) {
                setModalError('يجب إدخال كلمة المرور لتأكيد استلام العهدة.');
                return;
            }
            if (!user?.email) {
                setModalError('تعذر التحقق من بريدك الإلكتروني.');
                return;
            }

            setBusy(true);
            try {
                const { error: authErr } = await supabase.auth.signInWithPassword({
                    email: user.email,
                    password: password.trim(),
                });
                if (authErr) {
                    setModalError('كلمة المرور غير صحيحة. لا يمكن تأكيد استلام العهدة دون التحقق من الهوية.');
                    setBusy(false);
                    return;
                }
            } catch (err) {
                setModalError(errorMessage(err, 'فشل التحقق من كلمة المرور.'));
                setBusy(false);
                return;
            }
        }

        setBusy(true);
        try {
            await confirmRemittanceAsAdmin(modal.remittance.id, modal.action, modal.notes || undefined);
            setModal(null);
            setPassword('');
            await load();
        } catch (err) {
            setModalError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const filtered = filterStatus === 'all' ? rows : rows.filter((r) => r.status === filterStatus);
    const pendingTotal = rows.filter((r) => r.status === 'submitted').reduce((s, r) => s + r.amount, 0);

    return (
        <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
            <PageHeader
                title="العهد الغير مسلمة"
                subtitle="تتبع وتأكيد تسليم العهد النقدية من المندوبين"
                icon={<HandCoins className="w-6 h-6 text-amber-500" />}
            />

            {pendingTotal > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-bold">
                        يوجد <span className="font-black">{formatSDG(pendingTotal)}</span> بانتظار التأكيد من {rows.filter((r) => r.status === 'submitted').length} عهدة
                    </p>
                </div>
            )}

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="p-5">
                <div className="flex gap-2 flex-wrap">
                    {(['all', 'submitted', 'confirmed', 'rejected'] as const).map((s) => (
                        <button
                            key={s}
                            onClick={() => setFilterStatus(s)}
                            className={`px-4 py-2 rounded-xl text-xs font-black border transition-colors ${filterStatus === s
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                                }`}
                        >
                            {s === 'all' ? 'الكل' : STATUS_LABELS[s]}
                        </button>
                    ))}
                </div>
            </Card>

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-24 text-slate-400">
                        <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <HandCoins className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-bold text-sm">لا توجد عهد بهذه الحالة</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-5 py-3">المندوب</th>
                                    <th className="px-5 py-3">المبلغ</th>
                                    <th className="px-5 py-3">الحالة</th>
                                    <th className="px-5 py-3">تاريخ التقديم</th>
                                    <th className="px-5 py-3">ملاحظات المندوب</th>
                                    <th className="px-5 py-3 text-center">إجراء</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50/50">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-900">{r.driver_name}</p>
                                            {r.warehouse_name && (
                                                <p className="text-[11px] text-slate-400 font-medium">{r.warehouse_name}</p>
                                            )}
                                        </td>
                                        <td className="px-5 py-4 font-black text-slate-900">{formatSDG(r.amount)}</td>
                                        <td className="px-5 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${STATUS_STYLES[r.status]}`}>
                                                {STATUS_LABELS[r.status]}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-slate-500 font-medium">{formatDateTime(r.submitted_at)}</td>
                                        <td className="px-5 py-4 text-slate-500 text-xs max-w-xs truncate">{r.driver_notes ?? '—'}</td>
                                        <td className="px-5 py-4 text-center">
                                            {r.status === 'submitted' && (
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => openModal(r, 'confirmed')}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
                                                    >
                                                        <CheckCircle2 className="w-3.5 h-3.5" /> تأكيد
                                                    </button>
                                                    <button
                                                        onClick={() => openModal(r, 'rejected')}
                                                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-black hover:bg-red-100"
                                                    >
                                                        <XCircle className="w-3.5 h-3.5" /> رفض
                                                    </button>
                                                </div>
                                            )}
                                            {r.status !== 'submitted' && (
                                                <span className="text-xs text-slate-400 font-medium">{r.confirmed_at ? formatDateTime(r.confirmed_at) : '—'}</span>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {modal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
                    <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={() => setModal(null)} />
                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                        <h2 className="font-black text-slate-900 text-lg mb-1">
                            {modal.action === 'confirmed' ? 'تأكيد استلام العهدة' : 'رفض العهدة'}
                        </h2>
                        <p className="text-sm text-slate-500 mb-4">
                            المندوب: <span className="font-bold text-slate-700">{modal.remittance.driver_name}</span>
                            {' · '}المبلغ: <span className="font-bold text-slate-700">{formatSDG(modal.remittance.amount)}</span>
                        </p>

                        {modalError && (
                            <div className="p-3 mb-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-bold">
                                {modalError}
                            </div>
                        )}

                        {modal.action === 'confirmed' && (
                            <div className="space-y-3 mb-4">
                                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-bold flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                    <span>يجب التأكد من استلام المبلغ فعلياً من المندوب قبل التأكيد.</span>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="flex items-center gap-1.5 text-xs font-black text-slate-700">
                                        <Lock className="w-3.5 h-3.5 text-brand-blue" />
                                        <span>كلمة مرور الحساب (للتحقق من هوية المستلم):</span>
                                    </label>
                                    <input
                                        type="password"
                                        placeholder="أدخل كلمة مرور حسابك لتأكيد الاستلام..."
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-blue"
                                        autoFocus
                                    />
                                </div>
                            </div>
                        )}

                        <textarea
                            rows={2}
                            placeholder="ملاحظات (اختياري)"
                            value={modal.notes}
                            onChange={(e) => setModal({ ...modal, notes: e.target.value })}
                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-brand-blue mb-4 resize-none"
                        />

                        <div className="flex gap-3">
                            <button
                                disabled={busy}
                                onClick={handleAction}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-black text-white disabled:opacity-50 flex items-center justify-center gap-2 ${modal.action === 'confirmed' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}
                            >
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : modal.action === 'confirmed' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                                {modal.action === 'confirmed' ? 'تأكيد الاستلام' : 'رفض العهدة'}
                            </button>
                            <button
                                disabled={busy}
                                onClick={() => setModal(null)}
                                className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-50"
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
