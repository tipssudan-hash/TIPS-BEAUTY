import React, { useEffect, useMemo, useState } from 'react';
import { Percent, Plus, Edit, Trash2, X, Loader2, Square } from 'lucide-react';
import type { Product, Promotion, PromotionInput } from '../types';
import { PROMOTION_STATUS_LABELS, PROMOTION_TARGET_LABELS, deletePromotion, endPromotion, fetchAdminProducts, fetchPromotions, savePromotion } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatNumber, formatSDG, fromLocalInput, toLocalInput } from '../lib/format';
import { Card, Field, Notice, PageHeader, Spinner, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

// Promotions are priced by the backend (effective_price); this page only schedules and targets them.

const emptyPromotion = (): PromotionInput => ({
    title: '', description: null, discount_type: 'percentage', discount_value: 10,
    target_kind: 'all', target_value: null, target_product_ids: [], start_date: new Date().toISOString(), end_date: null,
});

const toInput = ({ id: _id, status: _status, ...input }: Promotion): PromotionInput => { void _id; void _status; return input; };

// Same palette as StatusPill (ui.tsx), plus a scheduled state.
const statusClass: Record<Promotion['status'], string> = {
    active: 'bg-emerald-50 text-emerald-600', scheduled: 'bg-blue-50 text-brand-blue', expired: 'bg-slate-100 text-slate-600',
};

export const PromotionsPage: React.FC = () => {
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [catalogue, setCatalogue] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: PromotionInput } | null>(null);
    const [saving, setSaving] = useState(false);
    const [productSearch, setProductSearch] = useState('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [rows, products] = await Promise.all([fetchPromotions(), fetchAdminProducts()]);
            setPromotions(rows);
            setCatalogue(products);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل العروض.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const categories = useMemo(() => Array.from(new Set(catalogue.map((p) => p.category).filter(Boolean))).sort(), [catalogue]);
    const brands = useMemo(() => Array.from(new Set(catalogue.map((p) => p.brand).filter(Boolean))).sort(), [catalogue]);
    const productName = useMemo(() => new Map(catalogue.map((p) => [p.id, p.name_ar])), [catalogue]);

    const update = (patch: Partial<PromotionInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });
    const setTargetKind = (target_kind: PromotionInput['target_kind']) => update({ target_kind, target_value: null, target_product_ids: [] });
    const toggleProduct = (id: string) => editing && update({
        target_product_ids: editing.data.target_product_ids.includes(id)
            ? editing.data.target_product_ids.filter((p) => p !== id)
            : [...editing.data.target_product_ids, id],
    });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!data.title.trim()) { setError('اسم العرض مطلوب.'); return; }
        if (!(data.discount_value > 0) || (data.discount_type === 'percentage' && data.discount_value > 100)) { setError('قيمة العرض غير صحيحة.'); return; }
        if ((data.target_kind === 'category' || data.target_kind === 'brand') && !data.target_value) { setError(data.target_kind === 'category' ? 'اختاري التصنيف.' : 'اختاري العلامة التجارية.'); return; }
        if (data.target_kind === 'products' && data.target_product_ids.length === 0) { setError('اختاري منتجاً واحداً على الأقل.'); return; }
        if (data.end_date && data.end_date <= data.start_date) { setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.'); return; }
        setSaving(true);
        setError(null);
        try {
            await savePromotion(editing.id, data);
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const end = async (promotion: Promotion) => {
        if (!window.confirm(`إنهاء العرض "${promotion.title}" الآن؟`)) return;
        try {
            await endPromotion(promotion.id);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const remove = async (promotion: Promotion) => {
        if (!window.confirm(`حذف العرض "${promotion.title}"؟`)) return;
        try {
            await deletePromotion(promotion.id);
            setPromotions((prev) => prev.filter((p) => p.id !== promotion.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const valueLabel = (p: Promotion) => p.discount_type === 'percentage' ? `${formatNumber(p.discount_value)}%` : formatSDG(p.discount_value);
    const targetLabel = (p: Promotion) => {
        if (p.target_kind === 'products') return `${formatNumber(p.target_product_ids.length)} منتجات`;
        if (p.target_kind === 'all') return PROMOTION_TARGET_LABELS.all;
        return `${PROMOTION_TARGET_LABELS[p.target_kind]}: ${p.target_value ?? ''}`;
    };

    const visibleProducts = useMemo(() => {
        const term = productSearch.trim();
        return catalogue.filter((p) => !term || p.name_ar.includes(term) || p.brand.includes(term)).slice(0, 40);
    }, [catalogue, productSearch]);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="العروض"
                subtitle="تخفيض مجدول يُطبَّق تلقائياً على كل المنتجات أو تصنيف أو علامة أو منتجات محددة. لا يتراكم مع خصم المنتج: الأكبر هو الذي يُطبَّق. البانرات لا تغيّر الأسعار."
                icon={<Percent className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyPromotion() })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة عرض</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل العرض' : 'عرض جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="اسم العرض" required hint="يظهر للعميلة بجانب السعر"><input value={editing.data.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} required /></Field>
                            <Field label="الوصف" hint="اختياري"><input value={editing.data.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} className={inputClass} /></Field>
                            <Field label="نوع التخفيض" required>
                                <select value={editing.data.discount_type} onChange={(e) => update({ discount_type: e.target.value as PromotionInput['discount_type'] })} className={inputClass}>
                                    <option value="percentage">نسبة مئوية</option>
                                    <option value="fixed">مبلغ ثابت (ج.س)</option>
                                </select>
                            </Field>
                            <Field label={editing.data.discount_type === 'percentage' ? 'النسبة (%)' : 'المبلغ (ج.س)'} required>
                                <input type="number" min={1} max={editing.data.discount_type === 'percentage' ? 100 : undefined} step="1" value={editing.data.discount_value} onChange={(e) => update({ discount_value: Number(e.target.value) })} className={inputClass} dir="ltr" required />
                            </Field>
                            <Field label="يشمل" required>
                                <select value={editing.data.target_kind} onChange={(e) => setTargetKind(e.target.value as PromotionInput['target_kind'])} className={inputClass}>
                                    {(Object.keys(PROMOTION_TARGET_LABELS) as PromotionInput['target_kind'][]).map((k) => <option key={k} value={k}>{PROMOTION_TARGET_LABELS[k]}</option>)}
                                </select>
                            </Field>
                            {editing.data.target_kind === 'category' && (
                                <Field label="التصنيف" required>
                                    <select value={editing.data.target_value ?? ''} onChange={(e) => update({ target_value: e.target.value || null })} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                            )}
                            {editing.data.target_kind === 'brand' && (
                                <Field label="العلامة التجارية" required>
                                    <select value={editing.data.target_value ?? ''} onChange={(e) => update({ target_value: e.target.value || null })} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                                    </select>
                                </Field>
                            )}
                            <Field label="تاريخ البداية" required><input type="datetime-local" value={toLocalInput(editing.data.start_date)} onChange={(e) => update({ start_date: fromLocalInput(e.target.value) ?? new Date().toISOString() })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="تاريخ الانتهاء" hint="اتركيه فارغاً بلا انتهاء"><input type="datetime-local" value={toLocalInput(editing.data.end_date)} onChange={(e) => update({ end_date: fromLocalInput(e.target.value) })} className={inputClass} dir="ltr" /></Field>
                        </div>
                        {editing.data.target_kind === 'products' && (
                            <div className="space-y-3">
                                <Field label={`المنتجات المشمولة (${formatNumber(editing.data.target_product_ids.length)})`} required>
                                    <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="ابحثي بالاسم أو العلامة" className={inputClass} />
                                </Field>
                                <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
                                    {visibleProducts.map((p) => {
                                        const checked = editing.data.target_product_ids.includes(p.id);
                                        return (
                                            <label key={p.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer ${checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                                                <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} className="w-4 h-4 accent-brand-blue" />
                                                <span className="font-bold text-slate-800 flex-1">{p.name_ar}</span>
                                                <span className="text-xs text-slate-400">{p.brand}</span>
                                            </label>
                                        );
                                    })}
                                    {visibleProducts.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">لا توجد منتجات مطابقة</p>}
                                </div>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null} حفظ</button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['العرض', 'التخفيض', 'يشمل', 'الفترة', 'الحالة', 'الإجراءات']} empty={promotions.length === 0} emptyText="لا توجد عروض بعد">
                    {promotions.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900">{p.title}</p>
                                {p.description && <p className="text-[10px] text-slate-400 font-bold">{p.description}</p>}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">{valueLabel(p)}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {targetLabel(p)}
                                {p.target_kind === 'products' && <span className="block text-[10px] text-slate-400 truncate max-w-[16rem]">{p.target_product_ids.map((id) => productName.get(id) ?? '…').join('، ')}</span>}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {formatDateTime(p.start_date)}
                                <span className="block">{p.end_date ? `حتى ${formatDateTime(p.end_date)}` : 'بلا انتهاء'}</span>
                            </td>
                            <td className="px-6 py-4"><span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black ${statusClass[p.status]}`}>{PROMOTION_STATUS_LABELS[p.status]}</span></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditing({ id: p.id, data: toInput(p) })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    {p.status !== 'expired' && <button type="button" onClick={() => void end(p)} className={`${smallButtonClass} bg-amber-50 text-amber-700 flex items-center gap-1`}><Square className="w-3.5 h-3.5" /> إنهاء الآن</button>}
                                    <button type="button" onClick={() => void remove(p)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
