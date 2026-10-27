import React, { useEffect, useState } from 'react';
import { BookOpen, Loader2, AlertTriangle } from 'lucide-react';
import { fetchAffiliates } from '../../lib/catalogApi';
import type { Affiliate } from '../../types';
import { formatSDG } from '../../lib/format';
import { errorMessage } from '../../lib/errors';
import { Card, Notice, PageHeader } from '../../components/ui';

const STATUS_LABELS: Record<Affiliate['status'], string> = {
    pending: 'بانتظار الموافقة',
    active: 'نشط',
    suspended: 'موقوف',
    rejected: 'مرفوض',
};

const STATUS_STYLES: Record<Affiliate['status'], string> = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    suspended: 'bg-red-50 text-red-600 border-red-200',
    rejected: 'bg-slate-100 text-slate-500 border-slate-200',
};

export const MarketerAccountsPage: React.FC = () => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        fetchAffiliates()
            .then(setAffiliates)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل حسابات المسوقين.')))
            .finally(() => setLoading(false));
    }, []);

    const totalPendingBalance = affiliates.filter((a) => a.status === 'active').reduce((s, a) => s + a.pending_balance, 0);
    const activeCount = affiliates.filter((a) => a.status === 'active').length;

    return (
        <div className="space-y-8 animate-in fade-in duration-500" dir="rtl">
            <PageHeader
                title="حسابات المسوقين"
                subtitle="عمولات المسوقين المستحقة والمدفوعة"
                icon={<BookOpen className="w-6 h-6 text-purple-500" />}
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-2xl p-5 bg-emerald-50 text-emerald-800 border border-emerald-100">
                    <p className="text-xs font-bold opacity-70 mb-1">مسوقون نشطون</p>
                    <p className="text-2xl font-black">{activeCount}</p>
                </div>
                <div className="rounded-2xl p-5 bg-amber-50 text-amber-800 border border-amber-100">
                    <p className="text-xs font-bold opacity-70 mb-1">عمولات مستحقة</p>
                    <p className="text-2xl font-black">{formatSDG(totalPendingBalance)}</p>
                </div>
                <div className="rounded-2xl p-5 bg-blue-50 text-blue-800 border border-blue-100">
                    <p className="text-xs font-bold opacity-70 mb-1">إجمالي المبيعات</p>
                    <p className="text-2xl font-black">{formatSDG(affiliates.reduce((s, a) => s + a.total_sales, 0))}</p>
                </div>
            </div>

            {totalPendingBalance > 0 && (
                <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                    <p className="text-sm font-bold">
                        يوجد <span className="font-black">{formatSDG(totalPendingBalance)}</span> عمولات مستحقة لم تُسدَّد بعد
                    </p>
                </div>
            )}

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-24 text-slate-400">
                        <Loader2 className="w-7 h-7 animate-spin" />
                    </div>
                ) : affiliates.length === 0 ? (
                    <div className="text-center py-20 text-slate-400">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="font-bold text-sm">لا يوجد مسوقون مسجلون</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-right text-sm">
                            <thead className="bg-slate-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                <tr>
                                    <th className="px-5 py-4">المسوق</th>
                                    <th className="px-5 py-4">الحالة</th>
                                    <th className="px-5 py-4 text-center">طلبات</th>
                                    <th className="px-5 py-4">إجمالي المبيعات</th>
                                    <th className="px-5 py-4">إجمالي العمولات</th>
                                    <th className="px-5 py-4">مدفوع</th>
                                    <th className="px-5 py-4">مستحق</th>
                                    <th className="px-5 py-4 text-center">نسبة العمولة</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {affiliates.map((a) => (
                                    <tr key={a.id} className="hover:bg-slate-50/50">
                                        <td className="px-5 py-4">
                                            <p className="font-bold text-slate-900">{a.display_name}</p>
                                            <p className="text-[11px] text-slate-400 font-mono">{a.code}</p>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black border ${STATUS_STYLES[a.status]}`}>
                                                {STATUS_LABELS[a.status]}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-center font-bold">{a.total_orders}</td>
                                        <td className="px-5 py-4 font-bold">{formatSDG(a.total_sales)}</td>
                                        <td className="px-5 py-4 font-bold">{formatSDG(a.total_commission_earned)}</td>
                                        <td className="px-5 py-4 font-bold text-emerald-600">{formatSDG(a.total_payouts_paid)}</td>
                                        <td className={`px-5 py-4 font-black ${a.pending_balance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>
                                            {formatSDG(a.pending_balance)}
                                        </td>
                                        <td className="px-5 py-4 text-center font-bold text-slate-700">{a.commission_rate}%</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                <tr>
                                    <td className="px-5 py-3 font-black text-slate-900" colSpan={2}>الإجمالي</td>
                                    <td className="px-5 py-3 text-center font-black">{affiliates.reduce((s, a) => s + a.total_orders, 0)}</td>
                                    <td className="px-5 py-3 font-black">{formatSDG(affiliates.reduce((s, a) => s + a.total_sales, 0))}</td>
                                    <td className="px-5 py-3 font-black">{formatSDG(affiliates.reduce((s, a) => s + a.total_commission_earned, 0))}</td>
                                    <td className="px-5 py-3 font-black text-emerald-600">{formatSDG(affiliates.reduce((s, a) => s + a.total_payouts_paid, 0))}</td>
                                    <td className={`px-5 py-3 font-black ${totalPendingBalance > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{formatSDG(totalPendingBalance)}</td>
                                    <td className="px-5 py-3" />
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                )}
            </Card>
        </div>
    );
};
