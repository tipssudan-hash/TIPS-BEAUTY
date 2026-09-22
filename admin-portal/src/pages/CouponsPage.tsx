import React, { useEffect, useState } from 'react';
import { Ticket, Plus, Edit, Trash2, X, Loader2 } from 'lucide-react';
import type { Coupon, CouponInput } from '../types';
import { deleteCoupon, fetchCoupons, saveCoupon } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatNumber, formatSDG, fromLocalInput, toLocalInput } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const emptyCoupon = (): CouponInput => ({
    code: '', name: '', description: null, discount_type: 'percentage', discount_value: 10, max_discount_amount: null,
    min_order_amount: 0, usage_limit: null, per_user_limit: 1, starts_at: new Date().toISOString(), ends_at: null, is_active: true,
});

const numberOrNull = (value: string) => value === '' ? null : Number(value);
const toInput = ({ id: _id, usage_count: _count, ...input }: Coupon): CouponInput => { void _id; void _count; return input; };

export const CouponsPage: React.FC = () => {
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: CouponInput } | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setCoupons(await fetchCoupons());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل أكواد الخصم.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const update = (patch: Partial<CouponInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!/^[A-Za-z0-9-]{3,30}$/.test(data.code.trim())) { setError('الكود يجب أن يكون من 3 إلى 30 حرفاً إنجليزياً أو رقماً أو شرطة.'); return; }
        if (!data.name.trim()) { setError('اسم كود الخصم مطلوب.'); return; }
        if (!(data.discount_value > 0) || (data.discount_type === 'percentage' && data.discount_value > 100)) { setError('قيمة الخصم غير صحيحة.'); return; }
        if (data.ends_at && data.ends_at <= data.starts_at) { setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.'); return; }
        setSaving(true);
        setError(null);
        try {
            await saveCoupon(editing.id, data);
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (coupon: Coupon) => {
        try {
            await saveCoupon(coupon.id, { ...toInput(coupon), is_active: !coupon.is_active });
            await load();
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const remove = async (coupon: Coupon) => {
        if (!window.confirm(`حذف كود الخصم "${coupon.code}"؟`)) return;
        try {
            await deleteCoupon(coupon.id);
            setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const edit = (coupon: Coupon) => setEditing({ id: coupon.id, data: toInput(coupon) });

    const valueLabel = (c: Coupon) => c.discount_type === 'percentage' ? `${formatNumber(c.discount_value)}%` : formatSDG(c.discount_value);
    const isLive = (c: Coupon) => c.is_active && new Date(c.starts_at) <= new Date() && (!c.ends_at || new Date(c.ends_at) >= new Date());

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="أكواد الخصم"
                subtitle="كود يكتبه العميل عند إتمام الطلب. يُطبَّق فقط إذا كان خصمه أكبر من الخصومات على المنتجات؛ لا تتراكم الخصومات."
                icon={<Ticket className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyCoupon() })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة كود</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل كود الخصم' : 'كود خصم جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الكود" required hint="حروف إنجليزية وأرقام وشرطات، يُحفظ بأحرف كبيرة">
                                <input value={editing.data.code} onChange={(e) => update({ code: e.target.value.toUpperCase() })} className={inputClass} dir="ltr" required />
                            </Field>
                            <Field label="الاسم" required><input value={editing.data.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} required /></Field>
                            <Field label="الوصف" hint="اختياري"><input value={editing.data.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} className={inputClass} /></Field>
                            <Field label="نوع الخصم" required>
                                <select value={editing.data.discount_type} onChange={(e) => update({ discount_type: e.target.value as CouponInput['discount_type'] })} className={inputClass}>
                                    <option value="percentage">نسبة مئوية</option>
                                    <option value="fixed">مبلغ ثابت (ج.س)</option>
                                </select>
                            </Field>
                            <Field label={editing.data.discount_type === 'percentage' ? 'النسبة (%)' : 'المبلغ (ج.س)'} required>
                                <input type="number" min={1} max={editing.data.discount_type === 'percentage' ? 100 : undefined} step="1" value={editing.data.discount_value} onChange={(e) => update({ discount_value: Number(e.target.value) })} className={inputClass} dir="ltr" required />
                            </Field>
                            <Field label="الحد الأقصى للخصم (ج.س)" hint="اختياري، مفيد مع النسبة المئوية">
                                <input type="number" min={1} step="1" value={editing.data.max_discount_amount ?? ''} onChange={(e) => update({ max_discount_amount: numberOrNull(e.target.value) })} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="الحد الأدنى لقيمة الطلب (ج.س)">
                                <input type="number" min={0} step="1" value={editing.data.min_order_amount} onChange={(e) => update({ min_order_amount: Number(e.target.value) || 0 })} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="إجمالي مرات الاستخدام" hint="اتركيه فارغاً بلا حد">
                                <input type="number" min={1} step="1" value={editing.data.usage_limit ?? ''} onChange={(e) => update({ usage_limit: numberOrNull(e.target.value) })} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="مرات الاستخدام لكل عميل" required>
                                <input type="number" min={1} step="1" value={editing.data.per_user_limit} onChange={(e) => update({ per_user_limit: Number(e.target.value) || 1 })} className={inputClass} dir="ltr" required />
                            </Field>
                            <Field label="تاريخ البداية" required><input type="datetime-local" value={toLocalInput(editing.data.starts_at)} onChange={(e) => update({ starts_at: fromLocalInput(e.target.value) ?? new Date().toISOString() })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="تاريخ الانتهاء" hint="اتركيه فارغاً بلا انتهاء"><input type="datetime-local" value={toLocalInput(editing.data.ends_at)} onChange={(e) => update({ ends_at: fromLocalInput(e.target.value) })} className={inputClass} dir="ltr" /></Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => update({ is_active: e.target.checked })} className="w-4 h-4 accent-brand-blue" /> مفعّل
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null} حفظ</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['الكود', 'الخصم', 'الشروط', 'الفترة', 'الاستخدام', 'الحالة', 'الإجراءات']} empty={coupons.length === 0} emptyText="لا توجد أكواد خصم بعد">
                    {coupons.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900" dir="ltr">{c.code}</p>
                                <p className="text-[10px] text-slate-400 font-bold">{c.name}</p>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">
                                {valueLabel(c)}{c.max_discount_amount ? <span className="block text-[10px] text-slate-400">حتى {formatSDG(c.max_discount_amount)}</span> : null}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {c.min_order_amount > 0 ? `حد أدنى ${formatSDG(c.min_order_amount)}` : 'بلا حد أدنى'}
                                <span className="block">{formatNumber(c.per_user_limit)} لكل عميل</span>
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {formatDateTime(c.starts_at)}
                                <span className="block">{c.ends_at ? `حتى ${formatDateTime(c.ends_at)}` : 'بلا انتهاء'}</span>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">{formatNumber(c.usage_count)}{c.usage_limit ? ` / ${formatNumber(c.usage_limit)}` : ''}</td>
                            <td className="px-6 py-4"><StatusPill tone={isLive(c) ? 'success' : c.is_active ? 'attention' : 'neutral'}>{isLive(c) ? 'ساري' : c.is_active ? 'خارج الفترة' : 'متوقف'}</StatusPill></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => edit(c)} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    <button type="button" onClick={() => void toggle(c)} className={`${smallButtonClass} ${c.is_active ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{c.is_active ? 'إيقاف' : 'تفعيل'}</button>
                                    {c.usage_count === 0 && <button type="button" onClick={() => void remove(c)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>}
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
