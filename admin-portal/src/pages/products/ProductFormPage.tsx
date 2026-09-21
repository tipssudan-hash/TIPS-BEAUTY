import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Save, ArrowRight, Loader2, Image as ImageIcon, Plus, Trash2, Info, Upload, Link as LinkIcon, Star } from 'lucide-react';
import type { ProductInput, ProductVariant } from '../../types';
import { createProduct, fetchAdminProduct, fetchAdminProducts, updateProduct, uploadPublicImage, validateImage } from '../../lib/catalogApi';
import { errorMessage } from '../../lib/errors';
import { formatSDG } from '../../lib/format';
import { Card, Field, Notice, Spinner, inputClass, primaryButtonClass, secondaryButtonClass } from '../../components/ui';

const SKIN_TYPES = ['جميع الأنواع', 'دهنية', 'جافة', 'مختلطة', 'حساسة', 'عادية'];

const emptyProduct: ProductInput = {
    name_ar: '', name_en: '', description: '', price: 0, cost_price: 0, discount_percentage: 0,
    brand: '', category: '', image: '', images: [], origin: 'السودان', expiry: '',
    ingredients: [], benefits: [], usage: '', skin_type: [], is_imported: true, variants: [], is_active: true,
};

const numberValue = (value: string) => {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
};

export const ProductFormPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isEditMode = Boolean(id);

    const [form, setForm] = useState<ProductInput>(emptyProduct);
    const [fetching, setFetching] = useState(isEditMode);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [categories, setCategories] = useState<string[]>([]);
    const [urlDraft, setUrlDraft] = useState('');
    const fileInput = useRef<HTMLInputElement>(null);
    const uploadFolder = useMemo(() => id ?? crypto.randomUUID(), [id]);

    useEffect(() => {
        let cancelled = false;
        fetchAdminProducts()
            .then((products) => { if (!cancelled) setCategories(Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort()); })
            .catch(() => undefined);
        if (!id) return () => { cancelled = true; };
        fetchAdminProduct(id)
            .then((product) => {
                if (cancelled) return;
                if (!product) { navigate('/products'); return; }
                const { id: _id, stock: _stock, reviews_count: _rc, average_rating: _ar, created_at: _ca, ...input } = product;
                void _id; void _stock; void _rc; void _ar; void _ca;
                setForm(input);
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المنتج.')); })
            .finally(() => { if (!cancelled) setFetching(false); });
        return () => { cancelled = true; };
    }, [id, navigate]);

    const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => setForm((prev) => ({ ...prev, [key]: value }));
    const setList = (key: 'ingredients' | 'benefits', value: string) => set(key, value.split(/[,،\n]/).map((s) => s.trim()).filter(Boolean));

    const addImageUrl = (url: string) => {
        const trimmed = url.trim();
        if (!trimmed) return;
        setForm((prev) => ({ ...prev, images: [...prev.images, trimmed], image: prev.image || trimmed }));
        setUrlDraft('');
    };

    const removeImage = (idx: number) => setForm((prev) => {
        const images = prev.images.filter((_, i) => i !== idx);
        return { ...prev, images, image: images.includes(prev.image) ? prev.image : (images[0] ?? '') };
    });

    const onFiles = async (files: FileList | null) => {
        if (!files?.length) return;
        setError(null);
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                const problem = validateImage(file);
                if (problem) { setError(problem); continue; }
                addImageUrl(await uploadPublicImage(uploadFolder, file));
            }
        } catch (err) {
            setError(errorMessage(err, 'تعذر رفع الصورة.'));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const updateVariant = (idx: number, patch: Partial<ProductVariant>) =>
        set('variants', form.variants.map((v, i) => i === idx ? { ...v, ...patch } : v));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        if (form.price <= 0) { setError('السعر يجب أن يكون أكبر من صفر.'); return; }
        if (form.discount_percentage < 0 || form.discount_percentage >= 100) { setError('نسبة الخصم يجب أن تكون بين 0 و 99.'); return; }
        if (!form.image && form.images.length === 0) { setError('أضيفي صورة واحدة على الأقل.'); return; }
        if (form.variants.some((v) => v.price != null && v.price <= 0)) { setError('سعر الخيار يجب أن يكون أكبر من صفر أو فارغاً.'); return; }
        setSaving(true);
        try {
            const payload: ProductInput = { ...form, variants: form.variants.filter((v) => v.name_ar.trim()) };
            if (id) await updateProduct(id, payload); else await createProduct(payload);
            navigate('/products');
        } catch (err) {
            setError(errorMessage(err, 'فشل حفظ المنتج.'));
        } finally {
            setSaving(false);
        }
    };

    if (fetching) return <Spinner label="جاري تحميل بيانات المنتج..." />;

    return (
        <div className="max-w-5xl mx-auto space-y-8 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm sticky top-4 z-30">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/products')} className="p-3 bg-slate-50 hover:bg-blue-50 hover:text-brand-blue rounded-2xl transition-all" aria-label="رجوع">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900">{isEditMode ? 'تعديل المنتج' : 'إضافة منتج جديد'}</h1>
                        <p className="text-slate-400 text-xs font-bold mt-0.5">المخزون يُدار من صفحة المخزون لكل مخزن.</p>
                    </div>
                </div>
                <button form="product-form" type="submit" disabled={saving || uploading} className={primaryButtonClass}>
                    {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    <span>{isEditMode ? 'حفظ التعديلات' : 'حفظ المنتج'}</span>
                </button>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <form id="product-form" onSubmit={handleSubmit} className="space-y-8">
                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Info className="w-5 h-5 text-brand-blue" /> البيانات الأساسية</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="اسم المنتج بالعربية" required>
                            <input value={form.name_ar} onChange={(e) => set('name_ar', e.target.value)} required className={inputClass} />
                        </Field>
                        <Field label="الاسم بالإنجليزية">
                            <input value={form.name_en} onChange={(e) => set('name_en', e.target.value)} className={inputClass} dir="ltr" />
                        </Field>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6">
                        <Field label="التصنيف" required hint="اكتبي تصنيفاً جديداً أو اختاري من القائمة">
                            <input list="category-options" value={form.category} onChange={(e) => set('category', e.target.value)} required className={inputClass} />
                            <datalist id="category-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
                        </Field>
                        <Field label="الماركة"><input value={form.brand} onChange={(e) => set('brand', e.target.value)} className={inputClass} /></Field>
                        <Field label="بلد المنشأ"><input value={form.origin} onChange={(e) => set('origin', e.target.value)} className={inputClass} /></Field>
                    </div>
                    <Field label="الوصف">
                        <textarea value={form.description} onChange={(e) => set('description', e.target.value)} rows={5} className={`${inputClass} font-medium leading-relaxed`} />
                    </Field>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="المكونات" hint="افصلي بينها بفاصلة">
                            <input value={form.ingredients.join('، ')} onChange={(e) => setList('ingredients', e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="الفوائد" hint="افصلي بينها بفاصلة">
                            <input value={form.benefits.join('، ')} onChange={(e) => setList('benefits', e.target.value)} className={inputClass} />
                        </Field>
                    </div>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="طريقة الاستخدام"><input value={form.usage} onChange={(e) => set('usage', e.target.value)} className={inputClass} /></Field>
                        <Field label="تاريخ الانتهاء"><input value={form.expiry} onChange={(e) => set('expiry', e.target.value)} className={inputClass} placeholder="مثال: 12/2027" /></Field>
                    </div>
                    <Field label="نوع البشرة المناسب">
                        <div className="flex flex-wrap gap-2">
                            {SKIN_TYPES.map((type) => {
                                const selected = form.skin_type.includes(type);
                                return (
                                    <button key={type} type="button" onClick={() => set('skin_type', selected ? form.skin_type.filter((t) => t !== type) : [...form.skin_type, type])}
                                        className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${selected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}>
                                        {type}
                                    </button>
                                );
                            })}
                        </div>
                    </Field>
                    <div className="flex flex-wrap gap-6">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={form.is_imported} onChange={(e) => set('is_imported', e.target.checked)} className="w-4 h-4 accent-brand-blue" /> منتج مستورد
                        </label>
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={form.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4 accent-brand-blue" /> ظاهر في المتجر
                        </label>
                    </div>
                </Card>

                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">التسعير</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                        <Field label="سعر البيع (ج.س)" required>
                            <input type="number" min={0} step="1" value={form.price} onChange={(e) => set('price', numberValue(e.target.value))} required className={inputClass} />
                        </Field>
                        <Field label="نسبة الخصم %" hint="0 = بدون خصم">
                            <input type="number" min={0} max={99} step="1" value={form.discount_percentage} onChange={(e) => set('discount_percentage', numberValue(e.target.value))} className={inputClass} />
                        </Field>
                        <Field label="سعر التكلفة (ج.س)" hint="لا يظهر للعملاء">
                            <input type="number" min={0} step="1" value={form.cost_price} onChange={(e) => set('cost_price', numberValue(e.target.value))} className={inputClass} />
                        </Field>
                    </div>
                    {form.discount_percentage > 0 && form.price > 0 && (
                        <p className="text-sm font-bold text-slate-600">السعر بعد الخصم: <span className="text-brand-blue">{formatSDG(form.price * (1 - form.discount_percentage / 100))}</span></p>
                    )}
                </Card>

                <Card className="p-8 space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><ImageIcon className="w-5 h-5 text-brand-blue" /> الصور</h3>
                        <div className="flex items-center gap-2">
                            <input ref={fileInput} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
                            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={`${secondaryButtonClass} flex items-center gap-2 text-sm`}>
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} رفع صور
                            </button>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input value={urlDraft} onChange={(e) => setUrlDraft(e.target.value)} placeholder="أو الصقي رابط صورة" className={`${inputClass} flex-1`} dir="ltr" />
                        <button type="button" onClick={() => addImageUrl(urlDraft)} className={`${secondaryButtonClass} flex items-center gap-1 text-sm`}><LinkIcon className="w-4 h-4" /> إضافة</button>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {form.images.map((url, idx) => (
                            <div key={`${url}-${idx}`} className="relative aspect-square rounded-2xl overflow-hidden bg-slate-50 border border-slate-100 group">
                                <img src={url} alt={`${form.name_ar || 'المنتج'} - صورة ${idx + 1}`} className="w-full h-full object-cover" />
                                {form.image === url && <span className="absolute top-2 right-2 px-2 py-0.5 bg-emerald-500 text-white text-[9px] font-black rounded-full">الرئيسية</span>}
                                <div className="absolute inset-x-0 bottom-0 p-2 flex gap-1 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button type="button" onClick={() => set('image', url)} className="flex-1 py-1 bg-white/90 text-slate-800 rounded-lg text-[10px] font-black flex items-center justify-center gap-1"><Star className="w-3 h-3" /> رئيسية</button>
                                    <button type="button" onClick={() => removeImage(idx)} className="py-1 px-2 bg-red-500 text-white rounded-lg text-[10px] font-black" aria-label="حذف"><Trash2 className="w-3 h-3" /></button>
                                </div>
                            </div>
                        ))}
                        {form.images.length === 0 && <p className="col-span-full text-sm text-slate-400 font-bold">لا توجد صور بعد.</p>}
                    </div>
                </Card>

                <Card className="p-8 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-black text-slate-900">الخيارات (اختياري)</h3>
                            <p className="text-xs text-slate-400 font-bold mt-1">مثل الدرجة أو الحجم. العميلة تختار واحداً عند الشراء؛ اتركي السعر فارغاً ليُستخدم سعر المنتج. المخزون على مستوى المنتج.</p>
                        </div>
                        <button type="button" onClick={() => set('variants', [...form.variants, { id: crypto.randomUUID(), name_ar: '', name_en: '', price: null }])} className={`${secondaryButtonClass} flex items-center gap-1 text-sm`}><Plus className="w-4 h-4" /> إضافة خيار</button>
                    </div>
                    {form.variants.map((variant, idx) => (
                        <div key={variant.id} className="grid md:grid-cols-4 gap-3 items-end">
                            <Field label="الاسم بالعربية"><input value={variant.name_ar} onChange={(e) => updateVariant(idx, { name_ar: e.target.value })} className={inputClass} /></Field>
                            <Field label="الاسم بالإنجليزية"><input value={variant.name_en ?? ''} onChange={(e) => updateVariant(idx, { name_en: e.target.value })} className={inputClass} dir="ltr" /></Field>
                            <Field label="السعر (اختياري)"><input type="number" min={0} step="0.01" value={variant.price ?? ''} onChange={(e) => updateVariant(idx, { price: e.target.value === '' ? null : Number(e.target.value) })} className={inputClass} dir="ltr" placeholder={String(form.price)} /></Field>
                            <button type="button" onClick={() => set('variants', form.variants.filter((_, i) => i !== idx))} className="p-3 text-red-500 hover:bg-red-50 rounded-2xl justify-self-start" aria-label="حذف الخيار"><Trash2 className="w-5 h-5" /></button>
                        </div>
                    ))}
                </Card>
            </form>
        </div>
    );
};
