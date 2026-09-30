import React, { useEffect, useState } from 'react';
import {
    Megaphone, Plus, Edit, X, Loader2, DollarSign, TrendingUp,
    CheckCircle2, Eye,
    Receipt, Wallet, Phone, Mail, Ticket, ArrowUpRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Affiliate, AffiliateInput, AffiliateDetails } from '../types';
import { fetchAffiliates, fetchAffiliateDetails, saveAffiliate, recordAffiliatePayout } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatNumber, formatSDG } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const emptyAffiliate = (): AffiliateInput => ({
    display_name: '',
    phone: '',
    email: '',
    commission_rate: 5,
    minimum_payout: 0,
    payout_method: 'بنكك (بنك الخرطوم)',
    payout_details: '',
    admin_note: '',
    status: 'active',
});

export const AffiliatesPage: React.FC = () => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Editing / Creation state
    const [editing, setEditing] = useState<{ id: string | null; data: AffiliateInput } | null>(null);
    const [saving, setSaving] = useState(false);

    // Profile Details View state
    const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);
    const [details, setDetails] = useState<AffiliateDetails | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'coupons' | 'payouts'>('overview');

    // Payout modal state
    const [payoutModal, setPayoutModal] = useState<{ affiliate: Affiliate; amount: number; method: string; reference: string; notes: string } | null>(null);
    const [recordingPayout, setRecordingPayout] = useState(false);


    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setAffiliates(await fetchAffiliates());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل قائمة المسوقين.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const loadDetails = async (id: string) => {
        setSelectedAffiliateId(id);
        try {
            const data = await fetchAffiliateDetails(id);
            setDetails(data);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل بيانات المسوق.'));
            setSelectedAffiliateId(null);
        }
    };

    const updateEditing = (patch: Partial<AffiliateInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });

    const submitAffiliate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!data.display_name.trim()) { setError('اسم المسوق مطلوب.'); return; }
        if (data.commission_rate < 0 || data.commission_rate > 100) { setError('نسبة العمولة يجب أن تكون بين 0 و 100%.'); return; }

        setSaving(true);
        setError(null);
        try {
            await saveAffiliate(editing.id, data);
            setEditing(null);
            setSuccessMessage(editing.id ? 'تم تحديث بيانات المسوق بنجاح.' : 'تم إضافة المسوق بنجاح.');
            setTimeout(() => setSuccessMessage(null), 4000);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const submitPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payoutModal) return;
        if (payoutModal.amount <= 0) {
            setError('مبلغ الصرف يجب أن يكون أكبر من صفر.');
            return;
        }
        setRecordingPayout(true);
        setError(null);
        try {
            await recordAffiliatePayout({
                affiliate_id: payoutModal.affiliate.id,
                amount: payoutModal.amount,
                payout_method: payoutModal.method,
                reference_number: payoutModal.reference,
                notes: payoutModal.notes,
            });
            setPayoutModal(null);
            setSuccessMessage(`تم تسجيل صرف مبلغ ${formatSDG(payoutModal.amount)} للمسوق بنجاح.`);
            setTimeout(() => setSuccessMessage(null), 4000);
            await load();
            if (selectedAffiliateId === payoutModal.affiliate.id) {
                await loadDetails(selectedAffiliateId);
            }
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setRecordingPayout(false);
        }
    };


    // Calculate aggregated totals
    const totalSalesAll = affiliates.reduce((acc, a) => acc + a.total_sales, 0);
    const totalCommissionAll = affiliates.reduce((acc, a) => acc + a.total_commission_earned, 0);
    const totalPaidAll = affiliates.reduce((acc, a) => acc + a.total_payouts_paid, 0);
    const totalPendingAll = affiliates.reduce((acc, a) => acc + a.pending_balance, 0);
    const totalOrdersAll = affiliates.reduce((acc, a) => acc + a.total_orders, 0);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المسوقون والناشرون (نظام العمولات)"
                subtitle="إدارة المسوقين والناشرين ومتابعة مبيعاتهم المحققة من أكواد الخصم، حساب نسب الأرباح وصرف المستحقات."
                icon={<Megaphone className="w-8 h-8 text-brand-blue" />}
                actions={
                    <div className="flex gap-2">
                        <Link to="/coupons" className={`${secondaryButtonClass} flex items-center gap-1.5`}>
                            <Ticket className="w-4 h-4 text-brand-blue" />
                            أكواد الخصم
                        </Link>
                        <button
                            type="button"
                            onClick={() => setEditing({ id: null, data: emptyAffiliate() })}
                            className={primaryButtonClass}
                        >
                            <Plus className="w-5 h-5" /> إضافة مسوق جديد
                        </button>
                    </div>
                }
            />

            {error && <Notice kind="error">{error}</Notice>}
            {successMessage && <Notice kind="success">{successMessage}</Notice>}

            {/* Performance Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="p-4 border-r-4 border-r-brand-blue">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">إجمالي المسوقين</p>
                        <Megaphone className="w-5 h-5 text-brand-blue" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 mt-2">{formatNumber(affiliates.length)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">حسابات تسويق مسجلة</p>
                </Card>

                <Card className="p-4 border-r-4 border-r-emerald-500">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">إجمالي مبيعات المسوقين</p>
                        <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-black text-emerald-700 mt-2">{formatSDG(totalSalesAll)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">من {formatNumber(totalOrdersAll)} طلب مكتمل</p>
                </Card>

                <Card className="p-4 border-r-4 border-r-indigo-500">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">إجمالي العمولات المكتسبة</p>
                        <DollarSign className="w-5 h-5 text-indigo-600" />
                    </div>
                    <p className="text-2xl font-black text-indigo-700 mt-2">{formatSDG(totalCommissionAll)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">أرباح مستحقة للمسوقين</p>
                </Card>

                <Card className="p-4 border-r-4 border-r-blue-500">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">المبالغ المصروفة</p>
                        <Receipt className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-2xl font-black text-blue-700 mt-2">{formatSDG(totalPaidAll)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">تم تحويلها للمسوقين</p>
                </Card>

                <Card className="p-4 border-r-4 border-r-amber-500">
                    <div className="flex items-center justify-between">
                        <p className="text-xs font-bold text-slate-500">المستحقات المعلقة</p>
                        <Wallet className="w-5 h-5 text-amber-600" />
                    </div>
                    <p className="text-2xl font-black text-amber-700 mt-2">{formatSDG(totalPendingAll)}</p>
                    <p className="text-[11px] text-slate-400 mt-1">في انتظار الصرف</p>
                </Card>
            </div>

            {/* Add / Edit Marketer Form */}
            {editing && (
                <Card className="p-6">
                    <form onSubmit={submitAffiliate} className="space-y-4">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-black text-slate-900 text-lg">
                                {editing.id ? 'تعديل بيانات المسوق / الناشر' : 'إضافة مسوق / ناشر جديد'}
                            </h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم التسويقي / الناشر" required>
                                <input
                                    value={editing.data.display_name}
                                    onChange={(e) => updateEditing({ display_name: e.target.value })}
                                    className={inputClass}
                                    placeholder="مثال: سارة فاشن / المؤثر أحمد"
                                    required
                                />
                            </Field>

                            <Field label="نسبة العمولة (%)" required hint="نسبة المسوق من إجمالي المبيعات">
                                <input
                                    type="number"
                                    min={0}
                                    max={100}
                                    step="0.5"
                                    value={editing.data.commission_rate}
                                    onChange={(e) => updateEditing({ commission_rate: Number(e.target.value) })}
                                    className={inputClass}
                                    dir="ltr"
                                    required
                                />
                            </Field>
                            <Field label="رقم الهاتف" hint="للتواصل وتحويل الأرباح">
                                <input
                                    value={editing.data.phone ?? ''}
                                    onChange={(e) => updateEditing({ phone: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                    placeholder="09xxxxxxxx"
                                />
                            </Field>
                            <Field label="البريد الإلكتروني" hint="اختياري">
                                <input
                                    type="email"
                                    value={editing.data.email ?? ''}
                                    onChange={(e) => updateEditing({ email: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                />
                            </Field>
                            <Field label="حالة الحساب" required>
                                <select
                                    value={editing.data.status}
                                    onChange={(e) => updateEditing({ status: e.target.value as AffiliateInput['status'] })}
                                    className={inputClass}
                                >
                                    <option value="active">نشط (معتمد)</option>
                                    <option value="pending">قيد المراجعة</option>
                                    <option value="suspended">موقوف مؤقتاً</option>
                                    <option value="rejected">مرفوض</option>
                                </select>
                            </Field>
                            <Field label="طريقة استلام الأرباح" hint="مثال: بنكك / فوري / نقداً">
                                <input
                                    value={editing.data.payout_method ?? ''}
                                    onChange={(e) => updateEditing({ payout_method: e.target.value })}
                                    className={inputClass}
                                    placeholder="بنكك - بنك الخرطوم"
                                />
                            </Field>
                            <Field label="تفاصيل الحساب البنكي / التحويل" hint="رقم الحساب / الآيبان / الاسم">
                                <input
                                    value={editing.data.payout_details ?? ''}
                                    onChange={(e) => updateEditing({ payout_details: e.target.value })}
                                    className={inputClass}
                                    placeholder="حساب بنكك: 1234567 باسم ..."
                                />
                            </Field>
                            <Field label="ملاحظات الإدارة" hint="داخلية">
                                <input
                                    value={editing.data.admin_note ?? ''}
                                    onChange={(e) => updateEditing({ admin_note: e.target.value })}
                                    className={inputClass}
                                />
                            </Field>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t">
                            <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null} حفظ المسوق
                            </button>
                        </div>
                    </form>
                </Card>
            )}

            {/* Marketers Table */}
            <Card className="overflow-hidden">
                <Table
                    headers={[
                        'المسوق والكود',
                        'بيانات التواصل',
                        'نسبة العمولة',
                        'الطلبات والمبيعات',
                        'العمولة المكتسبة',
                        'المصروف',
                        'الرصيد المعلق',
                        'الحالة',
                        'الإجراءات'
                    ]}
                    empty={affiliates.length === 0}
                    emptyText="لا يوجد مسوقون مسجلون بعد"
                >
                    {affiliates.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <div>
                                    <p className="text-sm font-black text-slate-900">{a.display_name}</p>
                                    <p className="text-[10px] text-slate-400 font-bold mt-0.5">
                                        {a.coupons_count > 0 ? `${a.coupons_count} كود خصم مخصص` : 'لا توجد أكواد مخصصة'}
                                    </p>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-600">
                                {a.phone && <p className="flex items-center gap-1"><Phone className="w-3 h-3 text-slate-400" /> <span dir="ltr">{a.phone}</span></p>}
                                {a.email && <p className="flex items-center gap-1 mt-0.5 text-slate-400"><Mail className="w-3 h-3" /> <span dir="ltr">{a.email}</span></p>}
                                {!a.phone && !a.email && <span className="text-slate-400">-</span>}
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-indigo-700">
                                {formatNumber(a.commission_rate)}%
                            </td>
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900">{formatSDG(a.total_sales)}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{formatNumber(a.total_orders)} طلب مكتمل</p>
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-emerald-700">
                                {formatSDG(a.total_commission_earned)}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-blue-700">
                                {formatSDG(a.total_payouts_paid)}
                            </td>
                            <td className="px-6 py-4">
                                <span className={`text-sm font-black ${a.pending_balance > 0 ? 'text-amber-700 bg-amber-50 px-2 py-1 rounded-md' : 'text-slate-400'}`}>
                                    {formatSDG(a.pending_balance)}
                                </span>
                            </td>
                            <td className="px-6 py-4">
                                <StatusPill tone={a.status === 'active' ? 'success' : a.status === 'pending' ? 'attention' : 'neutral'}>
                                    {a.status === 'active' ? 'نشط' : a.status === 'pending' ? 'مراجعة' : a.status === 'suspended' ? 'موقوف' : 'مرفوض'}
                                </StatusPill>
                            </td>
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => void loadDetails(a.id)}
                                        title="عرض ملف المسوق والمبيعات بالتفصيل"
                                        className={`${smallButtonClass} bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center gap-1`}
                                    >
                                        <Eye className="w-3.5 h-3.5" /> الملف
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPayoutModal({ affiliate: a, amount: a.pending_balance > 0 ? a.pending_balance : 0, method: a.payout_method || 'بنكك (بنك الخرطوم)', reference: '', notes: '' })}
                                        title="صرف وتسليم الأرباح"
                                        className={`${smallButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1`}
                                    >
                                        <Wallet className="w-3.5 h-3.5" /> صرف
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setEditing({
                                            id: a.id,
                                            data: {
                                                display_name: a.display_name,
                                                phone: a.phone,
                                                email: a.email,
                                                commission_rate: a.commission_rate,
                                                minimum_payout: a.minimum_payout,
                                                payout_method: a.payout_method,
                                                payout_details: a.payout_details,
                                                admin_note: a.admin_note,
                                                status: a.status,
                                            }
                                        })}
                                        title="تعديل بيانات المسوق"
                                        className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}
                                    >
                                        <Edit className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>

            {/* Marketer Detailed Profile & Analytics Modal */}
            {selectedAffiliateId && details && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in">
                        {/* Header */}
                        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
                            <div>
                                <div className="flex items-center gap-2">
                                    <h2 className="text-xl font-black">{details.profile.display_name}</h2>
                                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded">
                                        عمولة {details.profile.commission_rate}%
                                    </span>
                                </div>
                                <p className="text-xs text-slate-300 mt-1">
                                    {details.profile.payout_method || 'طريقة الصرف: غير محددة'} • {details.profile.payout_details || 'لا توجد بيانات بنكية'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const found = affiliates.find(x => x.id === details.profile.id);
                                        if (found) {
                                            setPayoutModal({
                                                affiliate: found,
                                                amount: details.stats.pending_balance,
                                                method: details.profile.payout_method || 'بنكك',
                                                reference: '',
                                                notes: ''
                                            });
                                        }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-3 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
                                >
                                    <Wallet className="w-4 h-4" /> صرف المستحقات ({formatSDG(details.stats.pending_balance)})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedAffiliateId(null); setDetails(null); }}
                                    className="p-2 text-slate-400 hover:text-white rounded-lg"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>
                        </div>

                        {/* Top Stats Cards in Modal */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 bg-slate-50 border-b">
                            <div className="bg-white p-3 rounded-xl border">
                                <p className="text-[10px] font-bold text-slate-500">الطلبات المكتملة</p>
                                <p className="text-lg font-black text-slate-900 mt-1">{formatNumber(details.stats.total_orders)}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border">
                                <p className="text-[10px] font-bold text-slate-500">إجمالي المبيعات</p>
                                <p className="text-lg font-black text-emerald-700 mt-1">{formatSDG(details.stats.total_sales)}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border">
                                <p className="text-[10px] font-bold text-slate-500">العمولات المكتسبة</p>
                                <p className="text-lg font-black text-indigo-700 mt-1">{formatSDG(details.stats.total_commission_earned)}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border">
                                <p className="text-[10px] font-bold text-slate-500">إجمالي المصروف</p>
                                <p className="text-lg font-black text-blue-700 mt-1">{formatSDG(details.stats.total_payouts_paid)}</p>
                            </div>
                            <div className="bg-white p-3 rounded-xl border">
                                <p className="text-[10px] font-bold text-slate-500">الرصيد المتبقي</p>
                                <p className="text-lg font-black text-amber-700 mt-1">{formatSDG(details.stats.pending_balance)}</p>
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b px-6 bg-white">
                            <button
                                type="button"
                                onClick={() => setActiveTab('overview')}
                                className={`py-3 px-4 text-xs font-black border-b-2 transition-colors ${activeTab === 'overview' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                سجل العمولات ({details.commissions.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('orders')}
                                className={`py-3 px-4 text-xs font-black border-b-2 transition-colors ${activeTab === 'orders' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                الطلبات المحققة ({details.orders.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('coupons')}
                                className={`py-3 px-4 text-xs font-black border-b-2 transition-colors ${activeTab === 'coupons' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                الأكواد المخصصة ({details.coupons.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('payouts')}
                                className={`py-3 px-4 text-xs font-black border-b-2 transition-colors ${activeTab === 'payouts' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                            >
                                سجل الدفعات والمصروفات ({details.payouts.length})
                            </button>
                        </div>

                        {/* Tab Content */}
                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            {activeTab === 'overview' && (
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 mb-3">سجل العمولات المحتسبة للطلبات</h4>
                                    <Table headers={['رقم الطلب', 'قيمة العمولة', 'نسبة العمولة', 'الحالة', 'تاريخ الاستحقاق', 'تاريخ الصرف']} empty={details.commissions.length === 0} emptyText="لا توجد عمولات مسجلة بعد">
                                        {details.commissions.map((c) => (
                                            <tr key={c.id}>
                                                <td className="px-4 py-3 font-mono font-bold text-xs text-brand-blue" dir="ltr">{c.order_number || c.order_id}</td>
                                                <td className="px-4 py-3 text-sm font-black text-emerald-700">{formatSDG(c.commission_amount)}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-600">{c.commission_rate}%</td>
                                                <td className="px-4 py-3">
                                                    <StatusPill tone={c.status === 'paid' ? 'success' : c.status === 'approved' ? 'attention' : 'neutral'}>
                                                        {c.status === 'paid' ? 'مدفوعة' : c.status === 'approved' ? 'معتمدة' : c.status === 'pending' ? 'معلقة' : 'ملغاة'}
                                                    </StatusPill>
                                                </td>
                                                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(c.created_at)}</td>
                                                <td className="px-4 py-3 text-xs text-slate-500">{c.paid_at ? formatDateTime(c.paid_at) : '-'}</td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            )}

                            {activeTab === 'orders' && (
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 mb-3">الطلبات المحققة عبر هذا المسوق</h4>
                                    <Table headers={['رقم الطلب', 'اسم العميل', 'الهاتف', 'إجمالي الطلب', 'خصم الكود', 'حالة الطلب', 'التاريخ']} empty={details.orders.length === 0} emptyText="لا توجد طلبات بعد">
                                        {details.orders.map((o) => (
                                            <tr key={o.id}>
                                                <td className="px-4 py-3 font-mono font-bold text-xs text-brand-blue" dir="ltr">{o.order_number}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-800">{o.customer_name}</td>
                                                <td className="px-4 py-3 text-xs font-mono text-slate-600" dir="ltr">{o.phone}</td>
                                                <td className="px-4 py-3 text-sm font-black text-slate-900">{formatSDG(o.total)}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-purple-700">{formatSDG(o.discount_amount)}</td>
                                                <td className="px-4 py-3"><StatusPill tone={o.status === 'delivered' ? 'success' : 'neutral'}>{o.status}</StatusPill></td>
                                                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(o.created_at)}</td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            )}

                            {activeTab === 'coupons' && (
                                <div>
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-sm font-black text-slate-900">أكواد الخصم المخصصة للمسوق</h4>
                                        <Link to="/coupons" className="text-xs font-bold text-brand-blue hover:underline flex items-center gap-1">
                                            إضافة كود خصم جديد للمسوق <ArrowUpRight className="w-3.5 h-3.5" />
                                        </Link>
                                    </div>
                                    <Table headers={['الكود', 'الاسم', 'نوع وقيمة الخصم للعميل', 'مرات الاستخدام', 'الحالة']} empty={details.coupons.length === 0} emptyText="لا توجد أكواد مخصصة بعد">
                                        {details.coupons.map((cp) => (
                                            <tr key={cp.id}>
                                                <td className="px-4 py-3 font-mono font-black text-sm text-brand-blue" dir="ltr">{cp.code}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-800">{cp.name}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700">
                                                    {cp.discount_type === 'percentage' ? `${cp.discount_value}%` : formatSDG(cp.discount_value)}
                                                </td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700">{formatNumber(cp.usage_count)}</td>
                                                <td className="px-4 py-3"><StatusPill tone={cp.is_active ? 'success' : 'neutral'}>{cp.is_active ? 'مفعل' : 'معطل'}</StatusPill></td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            )}

                            {activeTab === 'payouts' && (
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 mb-3">سجل المبالغ المحولة والمصروفة</h4>
                                    <Table headers={['المبلغ المحول', 'طريقة الصرف', 'الرقم المرجعي / الإشعار', 'ملاحظات', 'تاريخ الصرف']} empty={details.payouts.length === 0} emptyText="لم يتم تسجيل دفعات بعد">
                                        {details.payouts.map((p) => (
                                            <tr key={p.id}>
                                                <td className="px-4 py-3 text-sm font-black text-emerald-700">{formatSDG(p.amount)}</td>
                                                <td className="px-4 py-3 text-xs font-bold text-slate-700">{p.payout_method}</td>
                                                <td className="px-4 py-3 text-xs font-mono text-slate-600" dir="ltr">{p.reference_number || '-'}</td>
                                                <td className="px-4 py-3 text-xs text-slate-500">{p.notes || '-'}</td>
                                                <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(p.created_at)}</td>
                                            </tr>
                                        ))}
                                    </Table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Record Payout Modal ("Give him his money") */}
            {payoutModal && (
                <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in">
                        <div className="p-5 bg-emerald-800 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Wallet className="w-5 h-5 text-emerald-200" />
                                <h3 className="font-black text-lg">صرف وتسليم الأرباح للمسوق</h3>
                            </div>
                            <button type="button" onClick={() => setPayoutModal(null)} className="text-white/80 hover:text-white">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={submitPayout} className="p-6 space-y-4">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                                <p className="text-xs text-emerald-800 font-bold">
                                    المسوق: <span className="font-black text-slate-900">{payoutModal.affiliate.display_name}</span>
                                </p>
                                <p className="text-xs text-emerald-700 mt-1">
                                    الرصيد المعلق المستحق: <span className="font-black">{formatSDG(payoutModal.affiliate.pending_balance)}</span>
                                </p>
                                {payoutModal.affiliate.payout_details && (
                                    <p className="text-[11px] text-slate-600 mt-1">
                                        بيانات الاستلام: {payoutModal.affiliate.payout_details}
                                    </p>
                                )}
                            </div>

                            <Field label="المبلغ المراد صرفه (ج.س)" required>
                                <input
                                    type="number"
                                    min={1}
                                    step="1"
                                    value={payoutModal.amount}
                                    onChange={(e) => setPayoutModal({ ...payoutModal, amount: Number(e.target.value) })}
                                    className={inputClass}
                                    dir="ltr"
                                    required
                                />
                            </Field>

                            <Field label="طريقة الصرف / التحويل" required>
                                <input
                                    value={payoutModal.method}
                                    onChange={(e) => setPayoutModal({ ...payoutModal, method: e.target.value })}
                                    className={inputClass}
                                    placeholder="مثال: تطبيق بنكك / فوري / نقداً"
                                    required
                                />
                            </Field>

                            <Field label="الرقم المرجعي للتحويل / رقم الإشعار" hint="اختياري">
                                <input
                                    value={payoutModal.reference}
                                    onChange={(e) => setPayoutModal({ ...payoutModal, reference: e.target.value })}
                                    className={inputClass}
                                    dir="ltr"
                                    placeholder="مثال: REF-10938492"
                                />
                            </Field>

                            <Field label="ملاحظات الصرف" hint="اختياري">
                                <input
                                    value={payoutModal.notes}
                                    onChange={(e) => setPayoutModal({ ...payoutModal, notes: e.target.value })}
                                    className={inputClass}
                                    placeholder="تسليم أرباح مبيعات شهر ..."
                                />
                            </Field>

                            <div className="flex justify-end gap-2 pt-3 border-t">
                                <button type="button" onClick={() => setPayoutModal(null)} className={secondaryButtonClass}>
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={recordingPayout || payoutModal.amount <= 0}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-5 py-2.5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50"
                                >
                                    {recordingPayout ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    تأكيد الصرف وتسجيل الدفعة
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
