import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderTree, Plus, Edit, Trash2, X, Upload, Loader2, ChevronUp, ChevronDown, EyeOff, Eye } from 'lucide-react';
import type { Category, CategoryInput } from '../types';
import { COLLECTION_ICONS, catalogError, deleteCategory, downscaleImage, fetchCategories, reorderCategories, saveCategory, uploadPublicImage, validateImage } from '../lib/catalogApi';
import { childrenByParent, topLevelCategories } from '../lib/categoryTree';
import { Card, Field, Notice, PageHeader, Spinner, Table, StatusPill, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

type Editing = { id: string | null; data: CategoryInput };

const SLUG_PATTERN = /^[a-z0-9-]+$/;

const emptyCategory = (parentId: string | null, sortOrder: number): CategoryInput => ({
    name_ar: '', name_en: null, slug: null, image_url: null, icon: null, parent_id: parentId, sort_order: sortOrder, is_active: true,
});

const toInput = (c: Category): CategoryInput => ({
    name_ar: c.name_ar, name_en: c.name_en, slug: c.slug, image_url: c.image_url, icon: c.icon, parent_id: c.parent_id, sort_order: c.sort_order, is_active: c.is_active,
});

export const CategoriesPage: React.FC = () => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<Editing | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const childrenOf = useMemo(() => childrenByParent(categories), [categories]);
    const roots = useMemo(() => topLevelCategories(categories), [categories]);
    const rows = useMemo(() => roots.flatMap((root) => [
        { category: root, depth: 0 },
        ...(childrenOf.get(root.id) ?? []).map((child) => ({ category: child, depth: 1 })),
    ]), [roots, childrenOf]);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setCategories(await fetchCategories());
        } catch (err) {
            setError(catalogError(err, 'تعذر تحميل التصنيفات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const siblingsOf = (parentId: string | null, excludeId?: string) =>
        categories.filter((c) => c.parent_id === parentId && c.id !== excludeId).sort((a, b) => a.sort_order - b.sort_order);

    const nextSortOrder = (parentId: string | null) =>
        siblingsOf(parentId).reduce((max, c) => Math.max(max, c.sort_order + 1), 0);

    const patch = (changes: Partial<CategoryInput>) => setEditing((prev) => prev && { ...prev, data: { ...prev.data, ...changes } });

    const run = async (action: () => Promise<void>, fallback: string) => {
        setBusy(true);
        setError(null);
        try {
            await action();
            setCategories(await fetchCategories());
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
        if (!name) { setError('اسم التصنيف مطلوب.'); return; }
        const slug = data.slug?.trim() || null;
        if (slug && !SLUG_PATTERN.test(slug)) { setError('المعرّف يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط.'); return; }
        const original = editing.id ? categories.find((c) => c.id === editing.id) : undefined;
        const keepsPosition = original?.parent_id === data.parent_id;
        const input: CategoryInput = {
            ...data,
            name_ar: name,
            name_en: data.name_en?.trim() || null,
            slug,
            sort_order: keepsPosition && original ? original.sort_order : nextSortOrder(data.parent_id),
        };
        void run(async () => {
            await saveCategory(editing.id, input);
            setEditing(null);
        }, 'فشل حفظ التصنيف.');
    };

    const onFile = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        const problem = validateImage(file);
        if (problem) { setError(problem); return; }
        setUploading(true);
        setError(null);
        try {
            const url = await uploadPublicImage('categories', await downscaleImage(file));
            patch({ image_url: url });
        } catch (err) {
            setError(catalogError(err, 'تعذر رفع الصورة.'));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const move = (category: Category, direction: -1 | 1) => {
        const siblings = siblingsOf(category.parent_id);
        const index = siblings.findIndex((c) => c.id === category.id);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= siblings.length) return;
        const order = [...siblings];
        [order[index], order[target]] = [order[target], order[index]];
        void run(() => reorderCategories(order.map((c) => c.id)), 'تعذر تغيير الترتيب.');
    };

    const toggleActive = (category: Category) =>
        void run(() => saveCategory(category.id, { ...toInput(category), is_active: !category.is_active }).then(() => undefined), 'تعذر تغيير الحالة.');

    const remove = (category: Category) => {
        if (!window.confirm(`حذف التصنيف "${category.name_ar}"؟`)) return;
        void run(() => deleteCategory(category.id), 'تعذر حذف التصنيف.');
    };

    const openNew = (parentId: string | null) => {
        setError(null);
        setEditing({ id: null, data: emptyCategory(parentId, nextSortOrder(parentId)) });
    };

    const openEdit = (category: Category) => {
        setError(null);
        setEditing({ id: category.id, data: toInput(category) });
    };

    const editingHasChildren = editing?.id ? (childrenOf.get(editing.id)?.length ?? 0) > 0 : false;
    const parentOptions = roots.filter((c) => c.id !== editing?.id);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="التصنيفات"
                subtitle="شجرة من مستويين: تصنيف رئيسي وتصنيفات فرعية داخله. الترتيب يحدد ظهورها في المتجر."
                icon={<FolderTree className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => openNew(null)} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة تصنيف</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل تصنيف' : 'تصنيف جديد'}</h3>
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
                            <Field label="التصنيف الأم" hint={editingHasChildren ? 'هذا التصنيف يحوي فروعاً، فلا يمكن نقله تحت تصنيف آخر.' : 'بدون أم = تصنيف رئيسي'}>
                                <select value={editing.data.parent_id ?? ''} onChange={(e) => patch({ parent_id: e.target.value || null })} className={inputClass} disabled={editingHasChildren}>
                                    <option value="">بدون (تصنيف رئيسي)</option>
                                    {parentOptions.map((c) => <option key={c.id} value={c.id}>{c.name_ar}</option>)}
                                </select>
                            </Field>
                            <Field label="الأيقونة" hint="تظهر عند غياب الصورة">
                                <select value={editing.data.icon ?? ''} onChange={(e) => patch({ icon: e.target.value || null })} className={inputClass}>
                                    <option value="">بلا أيقونة</option>
                                    {Object.entries(COLLECTION_ICONS).map(([name, label]) => <option key={name} value={name}>{label}</option>)}
                                </select>
                            </Field>
                            <Field label="الصورة" hint="تُصغَّر تلقائياً قبل الرفع.">
                                <div className="flex items-center gap-3">
                                    {editing.data.image_url && <img src={editing.data.image_url} alt={editing.data.name_ar ? `معاينة: ${editing.data.name_ar}` : 'معاينة صورة التصنيف'} className="w-12 h-12 rounded-xl object-cover border border-slate-100" />}
                                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files)} />
                                    <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={`${secondaryButtonClass} flex items-center gap-2 text-sm`}>
                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {editing.data.image_url ? 'تغيير' : 'رفع صورة'}
                                    </button>
                                    {editing.data.image_url && (
                                        <button type="button" onClick={() => patch({ image_url: null })} className={`${smallButtonClass} bg-red-50 text-red-600`}>إزالة</button>
                                    )}
                                </div>
                            </Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => patch({ is_active: e.target.checked })} className="w-4 h-4 accent-brand-blue" /> مفعّل في المتجر
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={busy || uploading} className={primaryButtonClass}>{busy ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['التصنيف', 'المعرّف', 'المنتجات', 'الترتيب', 'الحالة', 'الإجراءات']} empty={rows.length === 0} emptyText="لا توجد تصنيفات بعد">
                    {rows.map(({ category, depth }) => {
                        const siblings = siblingsOf(category.parent_id);
                        const index = siblings.findIndex((c) => c.id === category.id);
                        return (
                            <tr key={category.id} className={`hover:bg-slate-50/50 ${category.is_active ? '' : 'opacity-60'}`}>
                                <td className={`py-4 ${depth ? 'pr-14 pl-6' : 'px-6'}`}>
                                    <div className="flex items-center gap-3">
                                        {category.image_url
                                            ? <img src={category.image_url} alt="" className="w-12 h-12 rounded-xl object-cover border border-slate-100 bg-slate-50" />
                                            : <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center"><FolderTree className="w-5 h-5" /></div>}
                                        <div>
                                            <p className="text-sm font-black text-slate-900">{category.name_ar}</p>
                                            {category.name_en && <p className="text-[10px] text-slate-400 font-bold" dir="ltr">{category.name_en}</p>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{category.slug ?? '—'}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-700">{category.product_count}</td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1">
                                        <button type="button" disabled={busy || index <= 0} onClick={() => move(category, -1)} className="p-2 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تحريك للأعلى"><ChevronUp className="w-4 h-4" /></button>
                                        <button type="button" disabled={busy || index < 0 || index >= siblings.length - 1} onClick={() => move(category, 1)} className="p-2 text-slate-400 hover:text-brand-blue disabled:opacity-30 rounded-lg" aria-label="تحريك للأسفل"><ChevronDown className="w-4 h-4" /></button>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><StatusPill tone={category.is_active ? 'success' : 'neutral'}>{category.is_active ? 'مفعّل' : 'متوقف'}</StatusPill></td>
                                <td className="px-6 py-4">
                                    <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => openEdit(category)} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                        {depth === 0 && <button type="button" onClick={() => openNew(category.id)} className={`${smallButtonClass} bg-indigo-50 text-indigo-700 flex items-center gap-1`}><Plus className="w-3.5 h-3.5" /> فرعي</button>}
                                        <button type="button" disabled={busy} onClick={() => toggleActive(category)} className={`${smallButtonClass} flex items-center gap-1 ${category.is_active ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {category.is_active ? <><EyeOff className="w-3.5 h-3.5" /> إيقاف</> : <><Eye className="w-3.5 h-3.5" /> تفعيل</>}
                                        </button>
                                        <button type="button" disabled={busy} onClick={() => remove(category)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </Table>
            </Card>
        </div>
    );
};
