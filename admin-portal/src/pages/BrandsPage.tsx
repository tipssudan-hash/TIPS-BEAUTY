import React, { useEffect, useRef, useState } from 'react';
import { Tag, Plus, Edit, Trash2, X, Upload, Loader2, ChevronLeft, ChevronRight, EyeOff, Eye } from 'lucide-react';
import type { Brand, BrandInput } from '../types';
import { catalogError, deleteBrand, downscaleImage, fetchBrands, reorderBrands, saveBrand, uploadPublicImage, validateImage } from '../lib/catalogApi';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

type Editing = { id: string | null; data: BrandInput };

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const emptyBrand = (sortOrder: number): BrandInput => ({
    name_ar: '', name_en: null, slug: null, logo_url: null, sort_order: sortOrder, is_active: true,
});

const toInput = (b: Brand): BrandInput => ({
    name_ar: b.name_ar, name_en: b.name_en, slug: b.slug, logo_url: b.logo_url, sort_order: b.sort_order, is_active: b.is_active,
});

export const BrandsPage: React.FC = () => {
    const [brands, setBrands] = useState<Brand[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setBrands(await fetchBrands());
        } catch (err) {
            setError(catalogError(err, 'تعذر تحميل العلامات التجارية.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const nextSortOrder = () => brands.reduce((max, b) => Math.max(max, b.sort_order + 1), 0);

    const patch = (changes: Partial<BrandInput>) => setEditing((prev) => prev && { ...prev, data: { ...prev.data, ...changes } });

    const run = async (action: () => Promise<void>, fallback: string) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            setBrands(await fetchBrands());
        } catch (err) {
            setError(catalogError(err, fallback));
        } finally {
            setBusy(false);
        }
    };

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        const name = data.name_ar.trim();
        if (!name) { setError('اسم العلامة التجارية مطلوب.'); return; }
        const slug = data.slug?.trim() || null;
        if (slug && !SLUG_PATTERN.test(slug)) { setError('المعرّف يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط.'); return; }
        const original = editing.id ? brands.find((b) => b.id === editing.id) : undefined;
        const input: BrandInput = {
            ...data,
            name_ar: name,
            name_en: data.name_en?.trim() || null,
            slug,
            sort_order: original ? original.sort_order : nextSortOrder(),
        };
        void run(async () => {
            await saveBrand(editing.id, input);
            setEditing(null);
        }, 'فشل حفظ العلامة التجارية.');
    };

    const onFile = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        const problem = validateImage(file);
        if (problem) { setError(problem); return; }
        setUploading(true);
        setError(null);
        try {
            const url = await uploadPublicImage('brands', await downscaleImage(file));
            patch({ logo_url: url });
        } catch (err) {
            setError(catalogError(err, 'تعذر رفع الشعار.'));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const move = (index: number, direction: -1 | 1) => {
        const target = index + direction;
        if (target < 0 || target >= brands.length) return;
        const order = [...brands];
        [order[index], order[target]] = [order[target], order[index]];
        void run(() => reorderBrands(order.map((b) => b.id)), 'تعذر تغيير الترتيب.');
    };

    const toggleActive = (brand: Brand) =>
        void run(() => saveBrand(brand.id, { ...toInput(brand), is_active: !brand.is_active }).then(() => undefined), 'تعذر تغيير الحالة.');

    const remove = (brand: Brand) => {
        if (!window.confirm(`حذف العلامة "${brand.name_ar}"؟`)) return;
        void run(() => deleteBrand(brand.id), 'تعذر حذف العلامة التجارية.');
    };

    const openNew = () => {
        setError(null);
        setEditing({ id: null, data: emptyBrand(nextSortOrder()) });
    };

    const openEdit = (brand: Brand) => {
        setError(null);
        setEditing({ id: brand.id, data: toInput(brand) });
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="العلامات التجارية"
                subtitle="شعارات العلامات كما تظهر في المتجر. الترتيب يحدد ظهورها."
                icon={<Tag className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={openNew} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة علامة</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل علامة تجارية' : 'علامة تجارية جديدة'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم بالعربية" required>
                                <input value={editing.data.name_ar} onChange={(e) => patch({ name_ar: e.target.value })} className={inputClass} required />
                            </Field>
                            <Field label="الاسم بالإنجليزية">
                                <input value={editing.data.name_en ?? ''} onChange={(e) => patch({ name_en: e.target.value })} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="المعرّف (slug)" hint="اختياري: حروف إنجليزية صغيرة وأرقام وشرطات">
                                <input value={editing.data.slug ?? ''} onChange={(e) => patch({ slug: e.target.value })} className={inputClass} dir="ltr" />
                            </Field>
                            <Field label="الشعار" hint="يُفضّل شعار مربع أو أفقي بخلفية شفافة.">
                                <div className="flex items-center gap-3">
                                    {editing.data.logo_url && <img src={editing.data.logo_url} alt={editing.data.name_ar ? `شعار ${editing.data.name_ar}` : 'معاينة الشعار'} className="w-12 h-12 rounded-xl object-contain border border-slate-100 bg-white" />}
                                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files)} />
                                    <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={`${secondaryButtonClass} flex items-center gap-2 text-sm`}>
                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {editing.data.logo_url ? 'تغيير' : 'رفع شعار'}
                                    </button>
                                    {editing.data.logo_url && (
                                        <button type="button" onClick={() => patch({ logo_url: null })} className={`${smallButtonClass} bg-red-50 text-red-600`}>إزالة</button>
                                    )}
                                </div>
                            </Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-brand-blue" /> مفعّلة في المتجر
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={busy || uploading} className={primaryButtonClass}>{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            {brands.length === 0 ? (
                <Card className="p-12 text-center text-slate-400 font-bold text-sm">لا توجد علامات تجارية بعد</Card>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {brands.map((brand, index) => (
                        <Card key={brand.id} className={`p-5 flex flex-col items-center gap-3 text-center ${brand.is_active ? '' : 'opacity-60'}`}>
                            <div className="w-full h-24 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center p-3">
                                {brand.logo_url
                                    ? <img src={brand.logo_url} alt={brand.name_ar} className="max-h-full max-w-full object-contain" />
                                    : <Tag className="w-8 h-8 text-slate-300" />}
                            </div>
                            <div className="min-w-0 w-full">
                                <p className="text-sm font-black text-slate-900 truncate">{brand.name_ar}</p>
                                {brand.name_en && <p className="text-[10px] text-slate-400 font-bold truncate" dir="ltr">{brand.name_en}</p>}
                                <p className="text-[10px] text-slate-400 font-bold mt-1">{brand.product_count} منتج</p>
                            </div>
                            <StatusPill tone={brand.is_active ? 'success' : 'neutral'}>{brand.is_active ? 'مفعّلة' : 'متوقفة'}</StatusPill>
                            <div className="flex items-center gap-1">
                                <button type="button" disabled={busy || index === 0} onClick={() => move(index, -1)} className="p-2 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تقديم"><ChevronRight className="w-4 h-4" /></button>
                                <button type="button" disabled={busy || index === brands.length - 1} onClick={() => move(index, 1)} className="p-2 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تأخير"><ChevronLeft className="w-4 h-4" /></button>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                <button type="button" onClick={() => openEdit(brand)} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                <button type="button" disabled={busy} onClick={() => toggleActive(brand)} className={`${smallButtonClass} flex items-center gap-1 ${brand.is_active ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {brand.is_active ? <><EyeOff className="w-3.5 h-3.5" /> إيقاف</> : <><Eye className="w-3.5 h-3.5" /> تفعيل</>}
                                </button>
                                <button type="button" disabled={busy} onClick={() => remove(brand)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                            </div>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
};
