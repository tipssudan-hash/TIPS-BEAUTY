import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowRight, Loader2, Search, X, ChevronUp, ChevronDown, Plus } from 'lucide-react';
import type { CollectionInput, CollectionRuleType, Product } from '../../types';
import {
    COLLECTION_ICONS, COLLECTION_RULE_LABELS, fetchAdminProducts, fetchCollection,
    saveCollection, validateCollectionSlug, errorMessage,
} from '../../lib/catalogApi';
import { Card, Field, Notice, Spinner, inputClass, primaryButtonClass } from '../../components/ui';

const emptyCollection: CollectionInput = {
    slug: '', name_ar: '', description_ar: null, icon: 'auto-awesome', rule_type: 'manual', rule_config: {}, display_order: 100, is_active: true,
};

const RULE_TYPES = Object.keys(COLLECTION_RULE_LABELS) as CollectionRuleType[];

export const CollectionFormPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(id);

    const [form, setForm] = useState<CollectionInput>(emptyCollection);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [catalogue, setCatalogue] = useState<Product[]>([]);
    const [pickerSearch, setPickerSearch] = useState('');
    const [fetching, setFetching] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([fetchAdminProducts(), id ? fetchCollection(id) : Promise.resolve(null)])
            .then(([products, collection]) => {
                if (cancelled) return;
                setCatalogue(products);
                if (id) {
                    if (!collection) { navigate('/collections'); return; }
                    const { id: _id, product_ids, ...input } = collection;
                    void _id;
                    setForm(input);
                    setSelectedIds(product_ids);
                }
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل بيانات التشكيلة.')); })
            .finally(() => { if (!cancelled) setFetching(false); });
        return () => { cancelled = true; };
    }, [id, navigate]);

    const set = <K extends keyof CollectionInput>(key: K, value: CollectionInput[K]) => setForm((prev) => ({ ...prev, [key]: value }));
    const setRule = (key: keyof CollectionInput['rule_config'], value: number | string | undefined) =>
        setForm((prev) => ({ ...prev, rule_config: { ...prev.rule_config, [key]: value } }));
    const isManual = form.rule_type === 'manual';
    const categories = useMemo(() => Array.from(new Set(catalogue.map((p) => p.category).filter(Boolean))).sort(), [catalogue]);

    const productsById = useMemo(() => new Map(catalogue.map((p) => [p.id, p])), [catalogue]);
    const selectedProducts = useMemo(() => selectedIds.map((pid) => productsById.get(pid)).filter((p): p is Product => Boolean(p)), [selectedIds, productsById]);
    const pickerResults = useMemo(() => {
        const term = pickerSearch.trim();
        return catalogue
            .filter((p) => !selectedIds.includes(p.id))
            .filter((p) => !term || p.name_ar.includes(term) || p.brand.includes(term))
            .slice(0, 50);
    }, [catalogue, selectedIds, pickerSearch]);

    const addProduct = (productId: string) => setSelectedIds((prev) => [...prev, productId]);
    const removeProduct = (productId: string) => setSelectedIds((prev) => prev.filter((pid) => pid !== productId));
    const moveProduct = (index: number, direction: -1 | 1) => setSelectedIds((prev) => {
        const next = [...prev];
        const target = index + direction;
        if (target < 0 || target >= next.length) return prev;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (!form.name_ar.trim()) { setError('اسم التشكيلة مطلوب.'); return; }
        const slugError = validateCollectionSlug(form.slug);
        if (slugError) { setError(slugError); return; }
        if (form.rule_type === 'price_under' && !(Number(form.rule_config.price) > 0)) { setError('حددي السعر الأقصى للقاعدة.'); return; }
        if (form.rule_type === 'category' && !form.rule_config.category) { setError('اختاري التصنيف للقاعدة.'); return; }

        setSaving(true);
        try {
            await saveCollection(id ?? null, form, selectedIds);
            navigate('/collections');
        } catch (err) {
            setError(errorMessage(err, 'فشل حفظ التشكيلة.'));
        } finally {
            setSaving(false);
        }
    };

    if (fetching) return <Spinner label="جاري تحميل بيانات التشكيلة..." />;

    return (
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm sticky top-4 z-30">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/collections')} className="p-3 bg-slate-50 hover:bg-blue-50 hover:text-brand-blue rounded-2xl transition-all" aria-label="رجوع">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                    <h1 className="text-2xl font-black text-slate-900">{isEditMode ? 'تعديل التشكيلة' : 'تشكيلة جديدة'}</h1>
                </div>
                <button form="collection-form" type="submit" disabled={saving} className={primaryButtonClass}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>حفظ التشكيلة</span>
                </button>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <form id="collection-form" onSubmit={handleSubmit} className="space-y-8">
                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">البيانات الأساسية</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="اسم التشكيلة" required>
                            <input value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} required className={inputClass} />
                        </Field>
                        <Field label="المعرّف (slug)" required hint="حروف إنجليزية صغيرة وأرقام وشرطات فقط، مثل: eid-essentials">
                            <input value={form.slug} onChange={(e) => set('slug', e.target.value)} required className={inputClass} dir="ltr" />
                        </Field>
                    </div>
                    <Field label="الوصف" hint="اختياري">
                        <textarea value={form.description_ar ?? ''} onChange={(e) => set('description_ar', e.target.value || null)} rows={2} className={inputClass} />
                    </Field>
                    <div className="grid md:grid-cols-3 gap-6 items-end">
                        <Field label="الأيقونة">
                            <select value={form.icon} onChange={(e) => set('icon', e.target.value)} className={inputClass}>
                                {Object.entries(COLLECTION_ICONS).map(([name, label]) => <option key={name} value={name}>{label}</option>)}
                            </select>
                        </Field>
                        <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً بين التشكيلات">
                            <input type="number" step="1" value={form.display_order} onChange={(e) => set('display_order', parseInt(e.target.value, 10) || 0)} className={inputClass} dir="ltr" />
                        </Field>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4 accent-brand-blue" /> ظاهرة في المتجر
                        </label>
                    </div>
                </Card>

                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">قاعدة التشكيلة</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="طريقة اختيار المنتجات" required>
                            <select value={form.rule_type} onChange={(e) => set('rule_type', e.target.value as CollectionRuleType)} className={inputClass}>
                                {RULE_TYPES.map((rule) => <option key={rule} value={rule}>{COLLECTION_RULE_LABELS[rule]}</option>)}
                            </select>
                        </Field>
                        {!isManual && (
                            <Field label="الحد الأقصى للمنتجات" hint="من 1 إلى 48، الافتراضي 12">
                                <input type="number" min={1} max={48} step="1" value={form.rule_config.limit ?? ''} placeholder="12"
                                    onChange={(e) => setRule('limit', e.target.value ? parseInt(e.target.value, 10) : undefined)} className={inputClass} dir="ltr" />
                            </Field>
                        )}
                        {form.rule_type === 'price_under' && (
                            <Field label="السعر الأقصى (ج.س)" required hint="بعد الخصم">
                                <input type="number" min={1} step="1" value={form.rule_config.price ?? ''}
                                    onChange={(e) => setRule('price', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} dir="ltr" />
                            </Field>
                        )}
                        {form.rule_type === 'discount' && (
                            <Field label="أقل نسبة خصم (%)" hint="الافتراضي 1">
                                <input type="number" min={1} max={100} step="1" value={form.rule_config.minimum_discount ?? ''} placeholder="1"
                                    onChange={(e) => setRule('minimum_discount', e.target.value ? Number(e.target.value) : undefined)} className={inputClass} dir="ltr" />
                            </Field>
                        )}
                        {form.rule_type === 'category' && (
                            <Field label="التصنيف" required>
                                <select value={form.rule_config.category ?? ''} onChange={(e) => setRule('category', e.target.value || undefined)} className={inputClass}>
                                    <option value="">اختاري تصنيفاً</option>
                                    {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </Field>
                        )}
                    </div>
                    {!isManual && <p className="text-xs text-slate-400 font-bold">تتحدث هذه التشكيلة تلقائياً حسب القاعدة؛ لا يظهر فيها إلا المنتجات المتاحة للبيع.</p>}
                </Card>

                {isManual && <Card className="p-8 space-y-6">
                    <div>
                        <h3 className="text-lg font-black text-slate-900">منتجات التشكيلة</h3>
                        <p className="text-xs text-slate-400 font-bold mt-1">منتج غير متوفر حالياً لا يظهر للعميل حتى يعود للمخزون، لكن يبقى ضمن التشكيلة.</p>
                    </div>

                    {selectedProducts.length > 0 && (
                        <div className="space-y-2">
                            {selectedProducts.map((p, idx) => (
                                <div key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                                    <img src={p.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-white border border-slate-100 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-slate-900 truncate">{p.name_ar}</p>
                                        {p.stock <= 0 && <p className="text-[10px] font-black text-red-500">غير متوفر حالياً</p>}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button type="button" onClick={() => moveProduct(idx, -1)} disabled={idx === 0} className="p-1.5 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تحريك للأعلى"><ChevronUp className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => moveProduct(idx, 1)} disabled={idx === selectedProducts.length - 1} className="p-1.5 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تحريك للأسفل"><ChevronDown className="w-4 h-4" /></button>
                                        <button type="button" onClick={() => removeProduct(p.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" aria-label="إزالة من التشكيلة"><X className="w-4 h-4" /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="space-y-3 pt-2 border-t border-slate-100">
                        <div className="relative">
                            <input
                                value={pickerSearch}
                                onChange={(e) => setPickerSearch(e.target.value)}
                                placeholder="ابحثي عن منتج لإضافته..."
                                className={`${inputClass} pr-10`}
                            />
                            <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                        </div>
                        <div className="max-h-72 overflow-y-auto space-y-1">
                            {pickerResults.map((p) => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => addProduct(p.id)}
                                    className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-blue-50 text-right transition-all"
                                >
                                    <img src={p.image} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-50 border border-slate-100 shrink-0" />
                                    <span className="flex-1 min-w-0 text-sm font-bold text-slate-700 truncate">{p.name_ar}</span>
                                    <Plus className="w-4 h-4 text-brand-blue shrink-0" />
                                </button>
                            ))}
                            {pickerResults.length === 0 && <p className="text-sm text-slate-400 font-bold text-center py-4">لا توجد نتائج.</p>}
                        </div>
                    </div>
                </Card>}
            </form>
        </div>
    );
};
