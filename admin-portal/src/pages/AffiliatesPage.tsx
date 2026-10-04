import React, { useEffect, useState } from 'react';
import {
    Megaphone, Plus, Edit, X, Loader2, DollarSign, TrendingUp,
    CheckCircle2, Eye, Trash2, Building2, CreditCard,
    Receipt, Wallet, Phone, Mail, Ticket, ArrowUpRight, Star,
    Banknote, ArrowRightLeft, Copy, Check, Info
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Affiliate, AffiliateInput, AffiliateDetails, AffiliateAccount } from '../types';
import { parseAffiliateAccounts, serializeAffiliateAccounts } from '../types';
import { fetchAffiliates, fetchAffiliateDetails, saveAffiliate, recordAffiliatePayout } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatNumber, formatSDG } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const BANK_PRESETS = [
    'بنك الخرطوم (تطبيق بنكك)',
    'بنك فيصل الإسلامي (تطبيق فوري)',
    'بنك أمدرمان الوطني (تطبيق أوكاش)',
    'بنك النيل',
    'بنك المال المتحد',
    'بنك البركة',
    'محفظة كاش إلكترونية',
    'استلام نقدي (يدوي)',
];

const emptyAccount = (id: string, isDefault = false): AffiliateAccount => ({
    id,
    bank_name: 'بنك الخرطوم (تطبيق بنكك)',
    account_number: '',
    account_holder: '',
    is_default: isDefault,
});

const emptyAffiliate = (): AffiliateInput => ({
    display_name: '',
    phone: '',
    email: '',
    commission_rate: 5,
    minimum_payout: 0,
    payout_method: 'بنك الخرطوم (تطبيق بنكك)',
    payout_details: JSON.stringify([emptyAccount('acc_1', true)]),
    admin_note: '',
    status: 'active',
});

type PayoutChannel = 'transfer' | 'cash';

interface PayoutModalState {
    affiliate: Affiliate;
    channel: PayoutChannel;
    amount: number;
    // For bank/transfer
    selectedAccountIndex: number | 'custom';
    customBankName: string;
    customAccountNumber: string;
    customAccountHolder: string;
    // For cash
    receivedBy: string;
    // Common
    reference: string;
    notes: string;
}

export const AffiliatesPage: React.FC = () => {
    const [affiliates, setAffiliates] = useState<Affiliate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    // Editing / Creation state
    const [editing, setEditing] = useState<{ id: string | null; data: AffiliateInput } | null>(null);
    const [formAccounts, setFormAccounts] = useState<AffiliateAccount[]>([]);
    const [saving, setSaving] = useState(false);

    // Profile Details View state
    const [selectedAffiliateId, setSelectedAffiliateId] = useState<string | null>(null);
    const [details, setDetails] = useState<AffiliateDetails | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'coupons' | 'payouts'>('overview');

    // Professional Payout modal state
    const [payoutModal, setPayoutModal] = useState<PayoutModalState | null>(null);
    const [recordingPayout, setRecordingPayout] = useState(false);
    const [copiedAccNumber, setCopiedAccNumber] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setAffiliates(await fetchAffiliates());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل قائمة المسوقين من قاعدة البيانات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const openEditForm = (id: string | null, data: AffiliateInput) => {
        const parsed = parseAffiliateAccounts(data.payout_details, data.payout_method);
        setFormAccounts(parsed.length > 0 ? parsed : [emptyAccount('acc_1', true)]);
        setEditing({ id, data });
    };

    const addAccountRow = () => {
        const newId = `acc_${Date.now()}`;
        setFormAccounts(prev => [
            ...prev,
            emptyAccount(newId, prev.length === 0)
        ]);
    };

    const removeAccountRow = (index: number) => {
        setFormAccounts(prev => {
            const next = prev.filter((_, i) => i !== index);
            if (next.length > 0 && !next.some(a => a.is_default)) {
                next[0].is_default = true;
            }
            return next;
        });
    };

    const updateAccountRow = (index: number, patch: Partial<AffiliateAccount>) => {
        setFormAccounts(prev => prev.map((item, i) => {
            if (i === index) {
                return { ...item, ...patch };
            }
            if (patch.is_default) {
                return { ...item, is_default: false };
            }
            return item;
        }));
    };

    const loadDetails = async (id: string) => {
        setSelectedAffiliateId(id);
        try {
            const data = await fetchAffiliateDetails(id);
            setDetails(data);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل بيانات المسوق من الخادم.'));
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

        const { payout_method, payout_details } = serializeAffiliateAccounts(formAccounts);
        const payload: AffiliateInput = {
            ...data,
            payout_method,
            payout_details,
        };

        setSaving(true);
        setError(null);
        try {
            await saveAffiliate(editing.id, payload);
            setEditing(null);
            setSuccessMessage(editing.id ? 'تم تحديث بيانات المسوق وحساباته في سوبابيز بنجاح.' : 'تم إضافة المسوق وحساباته بنجاح.');
            setTimeout(() => setSuccessMessage(null), 4000);
            await load();
            if (selectedAffiliateId && editing.id === selectedAffiliateId) {
                await loadDetails(selectedAffiliateId);
            }
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const openPayoutModal = (affiliate: Affiliate, customAmount?: number) => {
        const accounts = parseAffiliateAccounts(affiliate.payout_details, affiliate.payout_method);
        const defaultIndex = accounts.findIndex(a => a.is_default);
        const selectedIndex = defaultIndex >= 0 ? defaultIndex : (accounts.length > 0 ? 0 : 'custom');

        const initialAmount = customAmount !== undefined
            ? Math.max(0, customAmount)
            : (affiliate.pending_balance > 0 ? affiliate.pending_balance : 0);

        setPayoutModal({
            affiliate,
            channel: 'transfer',
            amount: initialAmount,
            selectedAccountIndex: selectedIndex,
            customBankName: 'بنك الخرطوم (تطبيق بنكك)',
            customAccountNumber: '',
            customAccountHolder: affiliate.display_name,
            receivedBy: affiliate.display_name,
            reference: '',
            notes: '',
        });
    };

    const copyToClipboard = (text: string) => {
        if (!text) return;
        void navigator.clipboard.writeText(text);
        setCopiedAccNumber(text);
        setTimeout(() => setCopiedAccNumber(null), 2500);
    };

    const submitPayout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payoutModal) return;
        if (payoutModal.amount <= 0) {
            setError('مبلغ الصرف يجب أن يكون أكبر من صفر.');
            return;
        }

        const accounts = parseAffiliateAccounts(payoutModal.affiliate.payout_details, payoutModal.affiliate.payout_method);

        let resolvedMethod = '';
        let generatedNotes = payoutModal.notes.trim();

        if (payoutModal.channel === 'transfer') {
            if (payoutModal.selectedAccountIndex === 'custom') {
                const bName = payoutModal.customBankName.trim() || 'تحويل بنكي';
                const accNum = payoutModal.customAccountNumber.trim();
                const accHolder = payoutModal.customAccountHolder.trim();
                resolvedMethod = `${bName}${accNum ? ` - ${accNum}` : ''}`;
                const detailStr = `تحويل إلى ${bName} حساب: ${accNum || 'غير محدد'}${accHolder ? ` باسم: ${accHolder}` : ''}`;
                generatedNotes = generatedNotes ? `${detailStr} | ${generatedNotes}` : detailStr;
            } else {
                const targetAcc = accounts[payoutModal.selectedAccountIndex];
                if (targetAcc) {
                    resolvedMethod = `${targetAcc.bank_name}${targetAcc.account_number ? ` (${targetAcc.account_number})` : ''}`;
                    const detailStr = `تحويل إلى ${targetAcc.bank_name} - حساب: ${targetAcc.account_number || '-'}${targetAcc.account_holder ? ` (صاحب الحساب: ${targetAcc.account_holder})` : ''}`;
                    generatedNotes = generatedNotes ? `${detailStr} | ${generatedNotes}` : detailStr;
                } else {
                    resolvedMethod = 'تحويل بنكي';
                }
            }
        } else {
            // Cash
            resolvedMethod = 'تسليم نقدي (كاش)';
            const cashStr = `تسليم نقدي كاش${payoutModal.receivedBy ? ` للمستلم: ${payoutModal.receivedBy}` : ''}`;
            generatedNotes = generatedNotes ? `${cashStr} | ${generatedNotes}` : cashStr;
        }

        setRecordingPayout(true);
        setError(null);
        try {
            await recordAffiliatePayout({
                affiliate_id: payoutModal.affiliate.id,
                amount: payoutModal.amount,
                payout_method: resolvedMethod,
                reference_number: payoutModal.reference.trim() || undefined,
                notes: generatedNotes || undefined,
            });
            const recordedAmount = payoutModal.amount;
            setPayoutModal(null);
            setSuccessMessage(`تم تسجيل صرف مبلغ ${formatSDG(recordedAmount)} للمسوق بنجاح وحفظ العملية في سوبابيز.`);
            setTimeout(() => setSuccessMessage(null), 5000);
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
                title="المسوقون ونظام العمولات"
                subtitle="إدارة المسوقين ومتابعة مبيعاتهم المحققة من أكواد الخصم، حساب نسب الأرباح وصرف المستحقات."
                icon={<Megaphone className="w-8 h-8 text-brand-blue" />}
                actions={
                    <div className="flex gap-2">
                        <Link to="/coupons" className={`${secondaryButtonClass} flex items-center gap-1.5`}>
                            <Ticket className="w-4 h-4 text-brand-blue" />
                            أكواد الخصم
                        </Link>
                        <button
                            type="button"
                            onClick={() => openEditForm(null, emptyAffiliate())}
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
                    <form onSubmit={submitAffiliate} className="space-y-6">
                        <div className="flex items-center justify-between border-b pb-3">
                            <h3 className="font-black text-slate-900 text-lg">
                                {editing.id ? 'تعديل بيانات المسوق' : 'إضافة مسوق جديد'}
                            </h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Basic Info */}
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="اسم المسوق" required>
                                <input
                                    value={editing.data.display_name}
                                    onChange={(e) => updateEditing({ display_name: e.target.value })}
                                    className={inputClass}
                                    placeholder="مثال: سارة فاشن أو أحمد للتسويق"
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

                            <Field label="رقم الهاتف" hint="للتواصل وتسليم الأرباح">
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
                                    placeholder="affiliate@example.com"
                                />
                            </Field>

                            <Field label="ملاحظات الإدارة" hint="داخلية">
                                <input
                                    value={editing.data.admin_note ?? ''}
                                    onChange={(e) => updateEditing({ admin_note: e.target.value })}
                                    className={inputClass}
                                    placeholder="ملاحظات سرية لفريق الإدارة"
                                />
                            </Field>
                        </div>

                        {/* Dynamic Payout Accounts Section */}
                        <div className="border-t pt-5">
                            <div className="flex items-center justify-between mb-3">
                                <div>
                                    <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                                        <Building2 className="w-4 h-4 text-brand-blue" />
                                        حسابات استلام الأرباح المسجلة في النظام
                                    </h4>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        يتم حفظ هذه الحسابات في سوبابيز واسترجاعها تلقائياً عند إجراء أي تحويل أو صرف مالي للمسوق.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={addAccountRow}
                                    className={`${secondaryButtonClass} text-xs flex items-center gap-1.5 py-1.5 px-3`}
                                >
                                    <Plus className="w-3.5 h-3.5" /> إضافة حساب استلام إضافي
                                </button>
                            </div>

                            <div className="space-y-3">
                                {formAccounts.map((account, index) => (
                                    <div
                                        key={account.id}
                                        className={`p-4 rounded-xl border transition-all ${account.is_default ? 'bg-blue-50/40 border-blue-300 shadow-sm' : 'bg-slate-50/70 border-slate-200'}`}
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-black text-slate-700 bg-white px-2 py-0.5 rounded border shadow-sm">
                                                    حساب #{index + 1}
                                                </span>
                                                {account.is_default ? (
                                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-blue bg-blue-100 px-2.5 py-0.5 rounded-full">
                                                        <Star className="w-3 h-3 fill-brand-blue text-brand-blue" /> الحساب الأساسي للتحويل
                                                    </span>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => updateAccountRow(index, { is_default: true })}
                                                        className="text-[11px] font-bold text-slate-500 hover:text-brand-blue underline"
                                                    >
                                                        تعيين كحساب أساسي
                                                    </button>
                                                )}
                                            </div>

                                            {formAccounts.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeAccountRow(index)}
                                                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="حذف هذا الحساب"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>

                                        <div className="grid md:grid-cols-3 gap-3">
                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                                    جهة الاستلام / البنك
                                                </label>
                                                <div className="space-y-1.5">
                                                    <select
                                                        value={BANK_PRESETS.includes(account.bank_name) ? account.bank_name : '__CUSTOM__'}
                                                        onChange={(e) => {
                                                            if (e.target.value === '__CUSTOM__') {
                                                                updateAccountRow(index, { bank_name: '' });
                                                            } else {
                                                                updateAccountRow(index, { bank_name: e.target.value });
                                                            }
                                                        }}
                                                        className={inputClass}
                                                    >
                                                        {BANK_PRESETS.map((bank) => (
                                                            <option key={bank} value={bank}>{bank}</option>
                                                        ))}
                                                        <option value="__CUSTOM__">جهة أخرى (كتابة يدوية)...</option>
                                                    </select>
                                                    {!BANK_PRESETS.includes(account.bank_name) && (
                                                        <input
                                                            value={account.bank_name}
                                                            onChange={(e) => updateAccountRow(index, { bank_name: e.target.value })}
                                                            placeholder="اسم البنك أو المحفظة..."
                                                            className={inputClass}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                                    رقم الحساب / الآيبان
                                                </label>
                                                <input
                                                    value={account.account_number}
                                                    onChange={(e) => updateAccountRow(index, { account_number: e.target.value })}
                                                    className={inputClass}
                                                    dir="ltr"
                                                    placeholder="مثال: 1234567"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                                    اسم صاحب الحساب
                                                </label>
                                                <input
                                                    value={account.account_holder}
                                                    onChange={(e) => updateAccountRow(index, { account_holder: e.target.value })}
                                                    className={inputClass}
                                                    placeholder="الاسم الرباعي أو اسم الحساب"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-3 border-t">
                            <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>
                                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null} حفظ المسوق في سوبابيز
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
                        'حسابات الاستلام المسجلة',
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
                    {affiliates.map((a) => {
                        const marketerAccounts = parseAffiliateAccounts(a.payout_details, a.payout_method);
                        const defaultAcc = marketerAccounts.find(acc => acc.is_default) || marketerAccounts[0];

                        return (
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
                                <td className="px-6 py-4">
                                    {marketerAccounts.length > 0 && (defaultAcc?.account_number || defaultAcc?.bank_name) ? (
                                        <div className="space-y-0.5">
                                            <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                                <CreditCard className="w-3.5 h-3.5 text-brand-blue" />
                                                {defaultAcc.bank_name}
                                            </p>
                                            {defaultAcc.account_number && (
                                                <p className="text-[11px] font-mono text-slate-500" dir="ltr">
                                                    {defaultAcc.account_number}
                                                    {defaultAcc.account_holder ? ` (${defaultAcc.account_holder})` : ''}
                                                </p>
                                            )}
                                            {marketerAccounts.length > 1 && (
                                                <span className="inline-block text-[10px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.2 rounded">
                                                    +{marketerAccounts.length - 1} حساب إضافي
                                                </span>
                                            )}
                                        </div>
                                    ) : (
                                        <span className="text-xs text-slate-400">غير مسجل</span>
                                    )}
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
                                            onClick={() => openPayoutModal(a)}
                                            title="صرف وتسليم الأرباح"
                                            className={`${smallButtonClass} bg-emerald-50 text-emerald-700 hover:bg-emerald-100 flex items-center gap-1 font-black`}
                                        >
                                            <Wallet className="w-3.5 h-3.5" /> صرف
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => openEditForm(a.id, {
                                                display_name: a.display_name,
                                                phone: a.phone,
                                                email: a.email,
                                                commission_rate: a.commission_rate,
                                                minimum_payout: a.minimum_payout,
                                                payout_method: a.payout_method,
                                                payout_details: a.payout_details,
                                                admin_note: a.admin_note,
                                                status: a.status,
                                            })}
                                            title="تعديل بيانات المسوق"
                                            className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}
                                        >
                                            <Edit className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
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
                                    <span className="text-xs bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-bold">
                                        عمولة {details.profile.commission_rate}%
                                    </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300 mt-2">
                                    {parseAffiliateAccounts(details.profile.payout_details, details.profile.payout_method).map((acc, i) => (
                                        <span key={acc.id || i} className="bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700 flex items-center gap-1">
                                            <Building2 className="w-3 h-3 text-emerald-400" />
                                            <strong className="text-white">{acc.bank_name}:</strong>
                                            <span dir="ltr">{acc.account_number || '-'}</span>
                                            {acc.account_holder ? ` (${acc.account_holder})` : ''}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        const found = affiliates.find(x => x.id === details.profile.id);
                                        if (found) {
                                            openPayoutModal(found, details.stats.pending_balance);
                                        }
                                    }}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black px-3.5 py-2 rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
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
                                    <Table headers={['المبلغ المحول', 'طريقة الصرف', 'الرقم المرجعي للإشعار', 'ملاحظات', 'تاريخ الصرف']} empty={details.payouts.length === 0} emptyText="لم يتم تسجيل دفعات بعد">
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

            {/* Professional Record Payout Settlement Modal */}
            {payoutModal && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden animate-in fade-in my-8 border">
                        {/* Modal Header */}
                        <div className="p-5 bg-emerald-800 text-white flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 bg-emerald-700/80 rounded-xl">
                                    <Wallet className="w-5 h-5 text-emerald-100" />
                                </div>
                                <div>
                                    <h3 className="font-black text-lg">صرف وتسليم أرباح المسوق</h3>
                                    <p className="text-xs text-emerald-200">تسجيل وتوثيق المعاملة المالية في سوبابيز</p>
                                </div>
                            </div>
                            <button type="button" onClick={() => setPayoutModal(null)} className="p-1.5 text-white/80 hover:text-white hover:bg-emerald-700/50 rounded-lg">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={submitPayout} className="p-6 space-y-5">
                            {/* Marketer Financial Summary Banner */}
                            <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-xs text-emerald-800 font-bold">المسوق المستفيد</p>
                                        <p className="text-base font-black text-slate-900 mt-0.5">{payoutModal.affiliate.display_name}</p>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-xs text-emerald-800 font-bold">الرصيد المعلق المستحق</p>
                                        <p className="text-base font-black text-emerald-700 mt-0.5">{formatSDG(payoutModal.affiliate.pending_balance)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Payout Channel Selection (Transfer vs Cash) */}
                            <div>
                                <label className="block text-xs font-black text-slate-800 mb-2">
                                    طريقة تسليم الأرباح
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setPayoutModal({ ...payoutModal, channel: 'transfer' })}
                                        className={`p-3.5 rounded-xl border text-right flex items-center gap-3 transition-all ${payoutModal.channel === 'transfer' ? 'bg-brand-blue/5 border-brand-blue ring-2 ring-brand-blue/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-lg ${payoutModal.channel === 'transfer' ? 'bg-brand-blue text-white' : 'bg-slate-200 text-slate-600'}`}>
                                            <ArrowRightLeft className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black ${payoutModal.channel === 'transfer' ? 'text-brand-blue' : 'text-slate-800'}`}>
                                                تحويل بنكي / إلكتروني
                                            </p>
                                            <p className="text-[10px] text-slate-500">تطبيق بنكك، فوري، أوكاش...</p>
                                        </div>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setPayoutModal({ ...payoutModal, channel: 'cash' })}
                                        className={`p-3.5 rounded-xl border text-right flex items-center gap-3 transition-all ${payoutModal.channel === 'cash' ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-600/20' : 'bg-slate-50 border-slate-200 hover:bg-slate-100'}`}
                                    >
                                        <div className={`p-2 rounded-lg ${payoutModal.channel === 'cash' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                                            <Banknote className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <p className={`text-xs font-black ${payoutModal.channel === 'cash' ? 'text-emerald-800' : 'text-slate-800'}`}>
                                                تسليم نقدي (كاش)
                                            </p>
                                            <p className="text-[10px] text-slate-500">استلام يدوي بسند صرف</p>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* Payout Channel Details */}
                            {payoutModal.channel === 'transfer' ? (
                                <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                                    <div className="flex items-center justify-between">
                                        <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                                            <Building2 className="w-3.5 h-3.5 text-brand-blue" />
                                            اختر حساب المسوق المسجل للتحويل إليه:
                                        </label>
                                        <span className="text-[10px] text-slate-400">مجلوب من ملف المسوق</span>
                                    </div>

                                    {(() => {
                                        const marketerAccounts = parseAffiliateAccounts(payoutModal.affiliate.payout_details, payoutModal.affiliate.payout_method);
                                        const validAccs = marketerAccounts.filter(a => a.bank_name || a.account_number);

                                        return (
                                            <div className="space-y-2">
                                                {validAccs.map((acc, idx) => (
                                                    <label
                                                        key={acc.id || idx}
                                                        className={`flex items-start justify-between p-3 rounded-xl border cursor-pointer transition-all ${payoutModal.selectedAccountIndex === idx ? 'bg-blue-50/80 border-brand-blue ring-1 ring-brand-blue shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                                    >
                                                        <div className="flex items-start gap-2.5">
                                                            <input
                                                                type="radio"
                                                                name="payout_account_choice"
                                                                checked={payoutModal.selectedAccountIndex === idx}
                                                                onChange={() => setPayoutModal({ ...payoutModal, selectedAccountIndex: idx })}
                                                                className="mt-1 accent-brand-blue"
                                                            />
                                                            <div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <p className="text-xs font-black text-slate-900">{acc.bank_name}</p>
                                                                    {acc.is_default && (
                                                                        <span className="text-[9px] bg-blue-100 text-brand-blue px-1.5 py-0.2 rounded font-bold">
                                                                            افتراضي
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                {acc.account_number && (
                                                                    <div className="flex items-center gap-1 mt-1">
                                                                        <span className="text-xs font-mono font-bold text-slate-700" dir="ltr">{acc.account_number}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(ev) => {
                                                                                ev.stopPropagation();
                                                                                copyToClipboard(acc.account_number);
                                                                            }}
                                                                            className="p-1 text-slate-400 hover:text-brand-blue"
                                                                            title="نسخ رقم الحساب"
                                                                        >
                                                                            {copiedAccNumber === acc.account_number ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {acc.account_holder && (
                                                                    <p className="text-[10px] text-slate-500 mt-0.5">صاحب الحساب: {acc.account_holder}</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </label>
                                                ))}

                                                {/* Custom transfer option */}
                                                <label
                                                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition-all ${payoutModal.selectedAccountIndex === 'custom' ? 'bg-blue-50/80 border-brand-blue ring-1 ring-brand-blue shadow-sm' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                                                >
                                                    <input
                                                        type="radio"
                                                        name="payout_account_choice"
                                                        checked={payoutModal.selectedAccountIndex === 'custom'}
                                                        onChange={() => setPayoutModal({ ...payoutModal, selectedAccountIndex: 'custom' })}
                                                        className="mt-1 accent-brand-blue"
                                                    />
                                                    <div className="w-full">
                                                        <p className="text-xs font-black text-slate-900">حساب / بنك آخر جديد</p>
                                                        {payoutModal.selectedAccountIndex === 'custom' && (
                                                            <div className="grid md:grid-cols-3 gap-2 mt-2">
                                                                <input
                                                                    value={payoutModal.customBankName}
                                                                    onChange={(e) => setPayoutModal({ ...payoutModal, customBankName: e.target.value })}
                                                                    className={`${inputClass} text-xs py-1.5`}
                                                                    placeholder="اسم البنك..."
                                                                />
                                                                <input
                                                                    value={payoutModal.customAccountNumber}
                                                                    onChange={(e) => setPayoutModal({ ...payoutModal, customAccountNumber: e.target.value })}
                                                                    className={`${inputClass} text-xs py-1.5`}
                                                                    dir="ltr"
                                                                    placeholder="رقم الحساب..."
                                                                />
                                                                <input
                                                                    value={payoutModal.customAccountHolder}
                                                                    onChange={(e) => setPayoutModal({ ...payoutModal, customAccountHolder: e.target.value })}
                                                                    className={`${inputClass} text-xs py-1.5`}
                                                                    placeholder="اسم صاحب الحساب..."
                                                                />
                                                            </div>
                                                        )}
                                                    </div>
                                                </label>
                                            </div>
                                        );
                                    })()}
                                </div>
                            ) : (
                                <div className="space-y-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200">
                                    <Field label="اسم الشخص المستلم للنقدية" required>
                                        <input
                                            value={payoutModal.receivedBy}
                                            onChange={(e) => setPayoutModal({ ...payoutModal, receivedBy: e.target.value })}
                                            className={inputClass}
                                            placeholder="اسم المستلم رباعياً أو المسوق نفسه"
                                            required
                                        />
                                    </Field>
                                </div>
                            )}

                            {/* Amount to payout with quick calculation chips */}
                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label className="text-xs font-black text-slate-800">
                                        المبلغ المراد صرفه (ج.س) <span className="text-red-500">*</span>
                                    </label>
                                    <div className="flex items-center gap-1.5">
                                        <button
                                            type="button"
                                            onClick={() => setPayoutModal({ ...payoutModal, amount: payoutModal.affiliate.pending_balance })}
                                            className="text-[10px] font-black text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded transition-colors"
                                        >
                                            صرف كامل المستحقات (100%)
                                        </button>
                                        {payoutModal.affiliate.pending_balance > 0 && (
                                            <button
                                                type="button"
                                                onClick={() => setPayoutModal({ ...payoutModal, amount: Math.round(payoutModal.affiliate.pending_balance / 2) })}
                                                className="text-[10px] font-bold text-slate-600 bg-slate-200 hover:bg-slate-300 px-2 py-0.5 rounded transition-colors"
                                            >
                                                50%
                                            </button>
                                        )}
                                    </div>
                                </div>
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
                                {payoutModal.amount > 0 && (
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 px-1">
                                        <span>الرصيد المتبقي بعد هذا الصرف:</span>
                                        <span className={`font-black ${payoutModal.affiliate.pending_balance - payoutModal.amount < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                                            {formatSDG(Math.max(0, payoutModal.affiliate.pending_balance - payoutModal.amount))}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Transaction Reference & Notes */}
                            <div className="grid md:grid-cols-2 gap-3">
                                <Field
                                    label={payoutModal.channel === 'transfer' ? 'الرقم المرجعي للتحويل / رقم الإشعار' : 'رقم سند الصرف النقدي'}
                                    hint="اختياري - للتوثيق المحاسبي"
                                >
                                    <input
                                        value={payoutModal.reference}
                                        onChange={(e) => setPayoutModal({ ...payoutModal, reference: e.target.value })}
                                        className={inputClass}
                                        dir="ltr"
                                        placeholder={payoutModal.channel === 'transfer' ? 'مثال: REF-983210' : 'مثال: CASH-2026-01'}
                                    />
                                </Field>

                                <Field label="ملاحظات الصرف" hint="اختياري">
                                    <input
                                        value={payoutModal.notes}
                                        onChange={(e) => setPayoutModal({ ...payoutModal, notes: e.target.value })}
                                        className={inputClass}
                                        placeholder="ملاحظات إضافية على الصرف..."
                                    />
                                </Field>
                            </div>

                            {/* Summary Box */}
                            <div className="bg-slate-900 text-slate-200 rounded-xl p-3.5 text-xs flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Info className="w-4 h-4 text-emerald-400" />
                                    <span>المبلغ الصافي للصرف: <strong className="text-white text-sm font-black">{formatSDG(payoutModal.amount)}</strong></span>
                                </div>
                                <span className="text-[11px] text-slate-400">
                                    {payoutModal.channel === 'transfer' ? 'تحويل بنكي' : 'تسليم كاش'}
                                </span>
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2 pt-2 border-t">
                                <button type="button" onClick={() => setPayoutModal(null)} className={secondaryButtonClass}>
                                    إلغاء
                                </button>
                                <button
                                    type="submit"
                                    disabled={recordingPayout || payoutModal.amount <= 0}
                                    className="bg-emerald-600 hover:bg-emerald-500 text-white font-black px-6 py-2.5 rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm"
                                >
                                    {recordingPayout ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                                    تأكيد الصرف وحفظ المعاملة
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
