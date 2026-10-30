import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Loader2, Plus, Save, Search, Trash2, X } from 'lucide-react';
import type { Brand, Category, Product, Promotion, PromotionBundleItem, PromotionInput, PromotionTier, PromotionType } from '../types';
import { PROMOTION_TARGET_LABELS, PROMOTION_TYPE_LABELS, fetchAdminProducts, fetchBrands, fetchCategories, fetchPromotion, savePromotion } from '../lib/catalogApi';
import { categoryPathLabel } from '../lib/categoryTree';
import { errorMessage } from '../lib/errors';
import { formatNumber, formatSDG, fromLocalInput, toLocalInput } from '../lib/format';
import { Card, Field, Notice, Spinner, inputClass, primaryButtonClass, secondaryButtonClass } from '../components/ui';
import { AuditHistory } from '../components/AuditHistory';

const PROMOTION_TYPES = Object.keys(PROMOTION_TYPE_LABELS) as PromotionType[];
const TARGET_KINDS = Object.keys(PROMOTION_TARGET_LABELS) as PromotionInput['target_kind'][];

const emptyPromotion = (): PromotionInput => ({
    title: '', description: null, promotion_type: 'item_discount', discount_type: 'percentage', discount_value: 10,
    buy_quantity: null, get_quantity: null, get_discount_percent: null, tiers: [], bundle_price: null, bundle_items: [],
    max_applications_per_order: null, target_kind: 'all', target_value: null, target_category_id: null, target_brand_id: null,
    target_product_ids: [], start_date: new Date().toISOString(), end_date: null,
});

const toInput = ({ id: _id, status: _status, ...input }: Promotion): PromotionInput => { void _id; void _status; return input; };

const isPositiveInt = (value: number | null): value is number => value != null && Number.isInteger(value) && value > 0;
const isPercent = (value: number | null): value is number => value != null && value > 0 && value <= 100;
const bundleTotal = (items: PromotionBundleItem[], prices: Map<string, number>) => items.reduce((sum, i) => sum + (prices.get(i.product_id) ?? 0) * i.quantity, 0);

function typeShapeError(data: PromotionInput, prices: Map<string, number>): string | null {
    switch (data.promotion_type) {
        case 'item_discount': {
            const value = data.discount_value;
            if (value == null || value <= 0 || (data.discount_type === 'percentage' && value > 100)) return 'قيمة العرض غير صحيحة.';
            return null;
        }
        case 'buy_x_get_y':
            if (!isPositiveInt(data.buy_quantity) || !isPositiveInt(data.get_quantity)) return 'حددي عدد الوحدات المشتراة والمخفّضة، أرقاماً صحيحة موجبة.';
            if (!isPercent(data.get_discount_percent)) return 'نسبة خصم الوحدات المخفّضة يجب أن تكون بين 1 و100.';
            return null;
        case 'quantity_tier':
            if (data.tiers.length === 0) return 'أضيفي شريحة واحدة على الأقل.';
            for (let i = 0; i < data.tiers.length; i++) {
                const tier = data.tiers[i];
                if (!Number.isInteger(tier.min_quantity) || tier.min_quantity < 2) return 'حدّ كل شريحة يجب أن يكون رقماً صحيحاً من 2 فأكثر.';
                if (!isPercent(tier.percent)) return 'نسبة كل شريحة يجب أن تكون بين 1 و100.';
                if (i > 0 && tier.min_quantity <= data.tiers[i - 1].min_quantity) return 'الشرائح يجب أن تكون تصاعدية بلا تكرار.';
            }
            return null;
        case 'bundle': {
            if (data.bundle_items.length === 0) return 'أضيفي منتجاً واحداً على الأقل إلى الحزمة.';
            if (data.bundle_items.some((i) => !isPositiveInt(i.quantity))) return 'كمية كل منتج في الحزمة يجب أن تكون رقماً صحيحاً موجباً.';
            const price = data.bundle_price;
            if (price == null || price <= 0) return 'حددي سعر الحزمة.';
            if (price >= bundleTotal(data.bundle_items, prices)) return 'سعر الحزمة يجب أن يكون أقل من مجموع أسعار منتجاتها.';
            return null;
        }
    }
}

function validatePromotion(data: PromotionInput, prices: Map<string, number>): string | null {
    if (!data.title.trim()) return 'اسم العرض مطلوب.';
    if (data.end_date && data.end_date <= data.start_date) return 'تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.';
    if (data.max_applications_per_order != null && !isPositiveInt(data.max_applications_per_order)) return 'الحد الأقصى للتطبيقات يجب أن يكون رقماً صحيحاً موجباً.';
    const shapeError = typeShapeError(data, prices);
    if (shapeError) return shapeError;
    if (data.promotion_type === 'bundle') return null;
    if (data.target_kind === 'category' && !data.target_category_id) return 'اختاري التصنيف.';
    if (data.target_kind === 'brand' && !data.target_brand_id) return 'اختاري العلامة التجارية.';
    if (data.target_kind === 'products' && data.target_product_ids.length === 0) return 'اختاري منتجاً واحداً على الأقل.';
    return null;
}

// Targets saved before the id columns existed carry only the name; resolve the id so the form and the save agree.
function withTargetIds(input: PromotionInput, categoryList: Category[], brandList: Brand[]): PromotionInput {
    return {
        ...input,
        target_category_id: input.target_category_id ?? (input.target_kind === 'category' ? categoryList.find((c) => c.name_ar === input.target_value)?.id ?? null : null),
        target_brand_id: input.target_brand_id ?? (input.target_kind === 'brand' ? brandList.find((b) => b.name_ar === input.target_value)?.id ?? null : null),
    };
}

export const PromotionFormPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(id);

    const [form, setForm] = useState<PromotionInput>(emptyPromotion);
    const [catalogue, setCatalogue] = useState<Product[]>([]);
    const [categories, setCategories] = useState<Category[]>([]);
    const [brands, setBrands] = useState<Brand[]>([]);
    const [productSearch, setProductSearch] = useState('');
    const [bundleSearch, setBundleSearch] = useState('');
    const [fetching, setFetching] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchAdminProducts(), fetchCategories(), fetchBrands(), id ? fetchPromotion(id) : Promise.resolve(null)])
            .then(([products, categoryList, brandList, promotion]) => {
                if (cancelled) return;
                setCatalogue(products);
                setCategories(categoryList);
                setBrands(brandList);
                if (id) {
                    if (!promotion) { navigate('/promotions'); return; }
                    setForm(withTargetIds(toInput(promotion), categoryList, brandList));
                }
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل بيانات العرض.')); })
            .finally(() => { if (!cancelled) setFetching(false); });
        return () => { cancelled = true; };
    }, [id, navigate]);

    const update = (patch: Partial<PromotionInput>) => setForm((prev) => ({ ...prev, ...patch }));
    const productPrices = useMemo(() => new Map(catalogue.map((p): [string, number] => [p.id, p.price])), [catalogue]);
    const productsById = useMemo(() => new Map(catalogue.map((p) => [p.id, p])), [catalogue]);

    const isBundle = form.promotion_type === 'bundle';
    const bundleIds = form.bundle_items.map((i) => i.product_id);
    const bundleSum = bundleTotal(form.bundle_items, productPrices);
    const bundleSavings = form.bundle_price == null ? null : bundleSum - form.bundle_price;

    const setType = (promotion_type: PromotionType) => setForm((prev) => {
        const next = { ...prev, promotion_type, discount_type: prev.discount_type ?? 'percentage', discount_value: prev.discount_value ?? 10 };
        if (promotion_type === 'bundle') {
            return { ...next, target_kind: 'products', target_value: null, target_category_id: null, target_brand_id: null, target_product_ids: prev.bundle_items.map((i) => i.product_id) };
        }
        if (prev.promotion_type === 'bundle') {
            return { ...next, target_kind: 'all', target_value: null, target_category_id: null, target_brand_id: null, target_product_ids: [] };
        }
        return next;
    });

    const setTargetKind = (target_kind: PromotionInput['target_kind']) =>
        update({ target_kind, target_value: null, target_category_id: null, target_brand_id: null, target_product_ids: [] });
    const setCategory = (categoryId: string) => {
        const category = categories.find((c) => c.id === categoryId);
        update({ target_category_id: category?.id ?? null, target_value: category?.name_ar ?? null });
    };
    const setBrand = (brandId: string) => {
        const brand = brands.find((b) => b.id === brandId);
        update({ target_brand_id: brand?.id ?? null, target_value: brand?.name_ar ?? null });
    };
    const toggleProduct = (productId: string) => update({
        target_product_ids: form.target_product_ids.includes(productId)
            ? form.target_product_ids.filter((p) => p !== productId)
            : [...form.target_product_ids, productId],
    });

    const updateTier = (index: number, patch: Partial<PromotionTier>) =>
        update({ tiers: form.tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)) });
    const addTier = () => {
        const last = form.tiers[form.tiers.length - 1];
        update({ tiers: [...form.tiers, { min_quantity: last ? last.min_quantity + 1 : 2, percent: 10 }] });
    };
    const removeTier = (index: number) => update({ tiers: form.tiers.filter((_, i) => i !== index) });

    const setBundleItems = (items: PromotionBundleItem[]) => update({ bundle_items: items, target_product_ids: items.map((i) => i.product_id) });
    const addBundleProduct = (productId: string) => setBundleItems([...form.bundle_items, { product_id: productId, quantity: 1 }]);
    const updateBundleQuantity = (index: number, quantity: number) =>
        setBundleItems(form.bundle_items.map((item, i) => (i === index ? { ...item, quantity } : item)));
    const removeBundleItem = (index: number) => setBundleItems(form.bundle_items.filter((_, i) => i !== index));

    const matchProducts = (search: string, exclude: string[] = []) => {
        const term = search.trim();
        return catalogue.filter((p) => !exclude.includes(p.id) && (!term || p.name_ar.includes(term) || p.brand.includes(term))).slice(0, 40);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validation = validatePromotion(form, productPrices);
        if (validation) { setError(validation); return; }
        setSaving(true);
        setError(null);
        try {
            await savePromotion(id ?? null, form);
            navigate('/promotions');
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const maxApplicationsField = (
        <Field label="الحد الأقصى للتطبيقات في الطلب" hint="كم مرة يُطبَّق العرض في الطلب الواحد. اتركيه فارغاً بلا حد.">
            <input
                type="number" min={1} step="1" value={form.max_applications_per_order ?? ''} dir="ltr" className={inputClass}
                onChange={(e) => update({ max_applications_per_order: e.target.value ? Number(e.target.value) : null })}
            />
        </Field>
    );

    if (fetching) return <Spinner label="جاري تحميل بيانات العرض..." />;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <Card className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 sticky top-4 z-30">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/promotions')} className="p-3 bg-slate-50 hover:bg-blue-50 hover:text-brand-blue rounded-2xl transition-all" aria-label="رجوع">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                    <h1 className="text-2xl font-black text-slate-900">{isEditMode ? 'تعديل العرض' : 'عرض جديد'}</h1>
                </div>
                <button form="promotion-form" type="submit" disabled={saving} className={primaryButtonClass}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>حفظ العرض</span>
                </button>
            </Card>

            {error && <Notice kind="error">{error}</Notice>}

            <form id="promotion-form" onSubmit={handleSubmit} className="space-y-8">
                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">البيانات الأساسية</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="نوع العرض" required>
                            <select value={form.promotion_type} onChange={(e) => setType(e.target.value as PromotionType)} className={inputClass}>
                                {PROMOTION_TYPES.map((t) => <option key={t} value={t}>{PROMOTION_TYPE_LABELS[t]}</option>)}
                            </select>
                        </Field>
                        <Field label="اسم العرض" required hint="يظهر للعميلة بجانب السعر">
                            <input value={form.title} onChange={(e) => update({ title: e.target.value })} className={inputClass} required />
                        </Field>
                        <Field label="الوصف" hint="اختياري">
                            <input value={form.description ?? ''} onChange={(e) => update({ description: e.target.value || null })} className={inputClass} />
                        </Field>
                        <div className="hidden md:block" />
                        <Field label="تاريخ البداية" required>
                            <input type="datetime-local" value={toLocalInput(form.start_date)} onChange={(e) => update({ start_date: fromLocalInput(e.target.value) ?? new Date().toISOString() })} className={inputClass} dir="ltr" required />
                        </Field>
                        <Field label="تاريخ الانتهاء" hint="اتركيه فارغاً بلا انتهاء">
                            <input type="datetime-local" value={toLocalInput(form.end_date)} onChange={(e) => update({ end_date: fromLocalInput(e.target.value) })} className={inputClass} dir="ltr" />
                        </Field>
                    </div>
                </Card>

                {!isBundle && (
                    <Card className="p-8 space-y-6">
                        <h3 className="text-lg font-black text-slate-900">التخفيض</h3>

                        {form.promotion_type === 'item_discount' && (
                            <div className="grid md:grid-cols-2 gap-6">
                                <Field label="نوع التخفيض" required>
                                    <select value={form.discount_type ?? 'percentage'} onChange={(e) => update({ discount_type: e.target.value as PromotionInput['discount_type'] })} className={inputClass}>
                                        <option value="percentage">نسبة مئوية</option>
                                        <option value="fixed">مبلغ ثابت (ج.س)</option>
                                    </select>
                                </Field>
                                <Field label={form.discount_type === 'fixed' ? 'المبلغ (ج.س)' : 'النسبة (%)'} required>
                                    <input type="number" min={1} max={form.discount_type === 'fixed' ? undefined : 100} step="1" value={form.discount_value ?? ''} onChange={(e) => update({ discount_value: e.target.value ? Number(e.target.value) : null })} className={inputClass} dir="ltr" required />
                                </Field>
                            </div>
                        )}

                        {form.promotion_type === 'buy_x_get_y' && (
                            <div className="space-y-6">
                                <p className="text-xs text-slate-400 font-bold">تُطبَّق على الوحدات المؤهلة ضمن الاستهداف أدناه؛ الوحدات الأرخص هي المخفّضة.</p>
                                <div className="grid md:grid-cols-3 gap-6">
                                    <Field label="اشترِ (X)" required hint="عدد الوحدات التي تشتريها العميلة">
                                        <input type="number" min={1} step="1" value={form.buy_quantity ?? ''} onChange={(e) => update({ buy_quantity: e.target.value ? Number(e.target.value) : null })} className={inputClass} dir="ltr" required />
                                    </Field>
                                    <Field label="واحصل على (Y)" required hint="عدد الوحدات المخفّضة">
                                        <input type="number" min={1} step="1" value={form.get_quantity ?? ''} onChange={(e) => update({ get_quantity: e.target.value ? Number(e.target.value) : null })} className={inputClass} dir="ltr" required />
                                    </Field>
                                    <Field label="خصم الوحدات المخفّضة (%)" required hint="100 = مجاناً">
                                        <input type="number" min={1} max={100} step="1" value={form.get_discount_percent ?? ''} onChange={(e) => update({ get_discount_percent: e.target.value ? Number(e.target.value) : null })} className={inputClass} dir="ltr" required />
                                    </Field>
                                </div>
                                {maxApplicationsField}
                            </div>
                        )}

                        {form.promotion_type === 'quantity_tier' && (
                            <div className="space-y-4">
                                <p className="text-xs text-slate-400 font-bold">تُطبَّق أعلى شريحة بلغتها الكمية المؤهلة على كامل الكمية. الشرائح تصاعدية بلا تكرار، وأقل حد 2.</p>
                                {form.tiers.length === 0 && <p className="text-sm text-slate-400 font-bold">لم تُضف أي شريحة بعد.</p>}
                                {form.tiers.map((tier, index) => (
                                    <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-4 items-end">
                                        <Field label="من كمية" required>
                                            <input type="number" min={2} step="1" value={tier.min_quantity} onChange={(e) => updateTier(index, { min_quantity: Number(e.target.value) })} className={inputClass} dir="ltr" required />
                                        </Field>
                                        <Field label="النسبة (%)" required>
                                            <input type="number" min={1} max={100} step="1" value={tier.percent} onChange={(e) => updateTier(index, { percent: Number(e.target.value) })} className={inputClass} dir="ltr" required />
                                        </Field>
                                        <button type="button" onClick={() => removeTier(index)} className="p-3.5 text-red-500 hover:bg-red-50 rounded-2xl" aria-label="حذف الشريحة">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                ))}
                                <button type="button" onClick={addTier} className={`${secondaryButtonClass} flex items-center gap-2`}>
                                    <Plus className="w-4 h-4" /> إضافة شريحة
                                </button>
                            </div>
                        )}
                    </Card>
                )}

                {isBundle && (
                    <Card className="p-8 space-y-6">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">منتجات الحزمة</h3>
                            <p className="text-xs text-slate-400 font-bold mt-1">تُباع المنتجات معاً بسعر الحزمة. الأسعار هنا أسعار المنتجات الأساسية.</p>
                        </div>

                        {form.bundle_items.length > 0 && (
                            <div className="space-y-2">
                                {form.bundle_items.map((item, index) => {
                                    const product = productsById.get(item.product_id);
                                    return (
                                        <div key={item.product_id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-black text-slate-900 truncate">{product?.name_ar ?? '—'}</p>
                                                <p className="text-[10px] text-slate-400 font-bold">{formatSDG(product?.price)} للوحدة</p>
                                            </div>
                                            <div className="w-28 shrink-0">
                                                <Field label="الكمية" required>
                                                    <input type="number" min={1} step="1" value={item.quantity} onChange={(e) => updateBundleQuantity(index, Number(e.target.value))} className={inputClass} dir="ltr" required />
                                                </Field>
                                            </div>
                                            <button type="button" onClick={() => removeBundleItem(index)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg shrink-0" aria-label="إزالة من الحزمة">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="space-y-3 pt-2 border-t border-slate-100">
                            <div className="relative">
                                <input value={bundleSearch} onChange={(e) => setBundleSearch(e.target.value)} placeholder="ابحثي عن منتج لإضافته إلى الحزمة..." className={`${inputClass} pr-10`} />
                                <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                            </div>
                            <div className="max-h-64 overflow-y-auto space-y-1">
                                {matchProducts(bundleSearch, bundleIds).map((p) => (
                                    <button key={p.id} type="button" onClick={() => addBundleProduct(p.id)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-blue-50 text-right transition-all">
                                        <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">{p.name_ar}</span>
                                        <span className="text-xs text-slate-400">{p.brand}</span>
                                        <Plus className="w-4 h-4 text-brand-blue shrink-0" />
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
                            <Field label="سعر الحزمة (ج.س)" required hint="السعر الذي تُباع به الحزمة كاملة">
                                <input type="number" min={1} step="1" value={form.bundle_price ?? ''} onChange={(e) => update({ bundle_price: e.target.value ? Number(e.target.value) : null })} className={inputClass} dir="ltr" required />
                            </Field>
                            <div className="space-y-2">
                                <span className="block text-xs font-black text-slate-500 uppercase tracking-widest">توفير الحزمة</span>
                                <p className="text-lg font-black text-slate-900">{bundleSavings == null ? '—' : formatSDG(Math.max(bundleSavings, 0))}</p>
                                <p className="text-[10px] text-slate-400 font-bold">مجموع أسعار المنتجات: {formatSDG(bundleSum)}</p>
                                {bundleSavings != null && bundleSavings <= 0 && <p className="text-xs font-bold text-amber-600">سعر الحزمة يجب أن يكون أقل من مجموع أسعار منتجاتها حتى يُطبَّق.</p>}
                            </div>
                        </div>
                        {maxApplicationsField}
                    </Card>
                )}

                {!isBundle && (
                    <Card className="p-8 space-y-6">
                        <h3 className="text-lg font-black text-slate-900">الاستهداف</h3>
                        <div className="grid md:grid-cols-2 gap-6">
                            <Field label="يشمل" required>
                                <select value={form.target_kind} onChange={(e) => setTargetKind(e.target.value as PromotionInput['target_kind'])} className={inputClass}>
                                    {TARGET_KINDS.map((k) => <option key={k} value={k}>{PROMOTION_TARGET_LABELS[k]}</option>)}
                                </select>
                            </Field>
                            {form.target_kind === 'category' && (
                                <Field label="التصنيف" required>
                                    <select value={form.target_category_id ?? ''} onChange={(e) => setCategory(e.target.value)} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {categories.map((c) => <option key={c.id} value={c.id}>{categoryPathLabel(c, categories)}</option>)}
                                    </select>
                                </Field>
                            )}
                            {form.target_kind === 'brand' && (
                                <Field label="العلامة التجارية" required>
                                    <select value={form.target_brand_id ?? ''} onChange={(e) => setBrand(e.target.value)} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {brands.map((b) => <option key={b.id} value={b.id}>{b.name_ar}</option>)}
                                    </select>
                                </Field>
                            )}
                        </div>
                        {form.target_kind === 'products' && (
                            <div className="space-y-3">
                                <Field label={`المنتجات المشمولة (${formatNumber(form.target_product_ids.length)})`} required>
                                    <input value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="ابحثي بالاسم أو العلامة" className={inputClass} />
                                </Field>
                                <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-50">
                                    {matchProducts(productSearch).map((p) => {
                                        const checked = form.target_product_ids.includes(p.id);
                                        return (
                                            <label key={p.id} className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer ${checked ? 'bg-blue-50/60' : 'hover:bg-slate-50'}`}>
                                                <input type="checkbox" checked={checked} onChange={() => toggleProduct(p.id)} className="w-4 h-4 accent-brand-blue" />
                                                <span className="font-bold text-slate-800 flex-1">{p.name_ar}</span>
                                                <span className="text-xs text-slate-400">{p.brand}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </Card>
                )}
            </form>
            {isEditMode && id && (
                <Card className="p-6 space-y-3">
                    <h3 className="font-black text-slate-900">السجل</h3>
                    <AuditHistory table="promotions" rowId={id} />
                </Card>
            )}
        </div>
    );
};
