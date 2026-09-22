import { formatDate, fromLocalInput, toLocalInput } from '../lib/format';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Edit, Trash2, X, Upload, Loader2 } from 'lucide-react';
import type { Banner, BannerActionType, Collection, Product } from '../types';
import { BANNER_MAX_WIDTH, deleteBanner, downscaleImage, fetchAdminProducts, fetchBanners, fetchCollections, saveBanner, uploadPublicImage, validateImage, type BannerInput } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const ACTION_LABELS: Record<BannerActionType, string> = { none: 'بدون إجراء', category: 'تصنيف', product: 'منتج', collection: 'مجموعة', url: 'رابط' };

const emptyBanner = (): BannerInput => ({ title_ar: '', subtitle_ar: null, image_url: '', action_type: 'none', action_value: null, display_order: 100, is_active: true, starts_at: new Date().toISOString(), ends_at: null });

export const BannersPage: React.FC = () => {
    const [banners, setBanners] = useState<Banner[]>([]);
    const [collections, setCollections] = useState<Collection[]>([]);
    const [catalogue, setCatalogue] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: BannerInput } | null>(null);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [rows, cols, products] = await Promise.all([fetchBanners(), fetchCollections(), fetchAdminProducts()]);
            setBanners(rows);
            setCollections(cols);
            setCatalogue(products);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل البانرات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const update = (patch: Partial<BannerInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });
    const categories = useMemo(() => Array.from(new Set(catalogue.map((p) => p.category).filter(Boolean))).sort(), [catalogue]);
    const collectionName = (slug: string) => collections.find((c) => c.slug === slug)?.name_ar ?? slug;
    const productName = (id: string) => catalogue.find((p) => p.id === id)?.name_ar ?? id;
    // What the customer app does with each action, in the admin's words.
    const actionSummary = (b: Pick<Banner, 'action_type' | 'action_value'>) => {
        if (!b.action_value) return ACTION_LABELS[b.action_type];
        switch (b.action_type) {
            case 'collection': return `مجموعة: ${collectionName(b.action_value)}`;
            case 'product': return `منتج: ${productName(b.action_value)}`;
            case 'category': return `تصنيف: ${b.action_value}`;
            case 'url': return `رابط: ${b.action_value}`;
            default: return ACTION_LABELS[b.action_type];
        }
    };

    const onFile = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file) return;
        const problem = validateImage(file);
        if (problem) { setError(problem); return; }
        setUploading(true);
        setError(null);
        try {
            update({ image_url: await uploadPublicImage('banners', await downscaleImage(file)) });
        } catch (err) {
            setError(errorMessage(err, 'تعذر رفع الصورة.'));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!data.title_ar.trim()) { setError('عنوان البانر مطلوب.'); return; }
        if (!data.image_url) { setError('صورة البانر مطلوبة.'); return; }
        if (data.action_type !== 'none' && !data.action_value?.trim()) { setError('حددي وجهة البانر (المجموعة أو المنتج أو التصنيف أو الرابط).'); return; }
        if (data.action_type === 'url' && !/^(https?:\/\/|\/)/.test(data.action_value?.trim() ?? '')) { setError('الرابط يجب أن يبدأ بـ / لصفحة داخل المتجر أو https:// لموقع خارجي.'); return; }
        if (data.ends_at && data.ends_at < data.starts_at) { setError('تاريخ الانتهاء يجب أن يكون بعد تاريخ البداية.'); return; }
        setSaving(true);
        setError(null);
        try {
            await saveBanner(editing.id, { ...data, title_ar: data.title_ar.trim(), subtitle_ar: data.subtitle_ar?.trim() || null, action_value: data.action_type === 'none' ? null : data.action_value?.trim() ?? null });
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (banner: Banner) => {
        if (!window.confirm(`حذف البانر "${banner.title_ar}"؟`)) return;
        try {
            await deleteBanner(banner.id);
            setBanners((prev) => prev.filter((b) => b.id !== banner.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const isLive = (b: Banner) => b.is_active && new Date(b.starts_at) <= new Date() && (!b.ends_at || new Date(b.ends_at) >= new Date());

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="البانرات"
                subtitle="تظهر في الصفحة الرئيسية للمتجر ضمن فترة العرض فقط."
                icon={<ImageIcon className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyBanner() })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة بانر</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل بانر' : 'بانر جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                            <Field label="العنوان" required><input value={editing.data.title_ar} onChange={(e) => update({ title_ar: e.target.value })} className={inputClass} required /></Field>
                            <Field label="العنوان الفرعي"><input value={editing.data.subtitle_ar ?? ''} onChange={(e) => update({ subtitle_ar: e.target.value })} className={inputClass} /></Field>
                            <Field label="الإجراء عند الضغط">
                                <select value={editing.data.action_type} onChange={(e) => update({ action_type: e.target.value as BannerActionType, action_value: null })} className={inputClass}>
                                    {(Object.keys(ACTION_LABELS) as BannerActionType[]).map((a) => <option key={a} value={a}>{ACTION_LABELS[a]}</option>)}
                                </select>
                            </Field>
                            {editing.data.action_type === 'collection' && (
                                <Field label="المجموعة" required>
                                    <select value={editing.data.action_value ?? ''} onChange={(e) => update({ action_value: e.target.value || null })} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {collections.map((c) => <option key={c.id} value={c.slug}>{c.name_ar}{c.is_active ? '' : ' (غير ظاهرة)'}</option>)}
                                    </select>
                                </Field>
                            )}
                            {editing.data.action_type === 'category' && (
                                <Field label="التصنيف" required>
                                    <select value={editing.data.action_value ?? ''} onChange={(e) => update({ action_value: e.target.value || null })} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </Field>
                            )}
                            {editing.data.action_type === 'product' && (
                                <Field label="المنتج" required>
                                    <select value={editing.data.action_value ?? ''} onChange={(e) => update({ action_value: e.target.value || null })} className={inputClass} required>
                                        <option value="">اختاري…</option>
                                        {catalogue.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name_ar}</option>)}
                                    </select>
                                </Field>
                            )}
                            {editing.data.action_type === 'url' && (
                                <Field label="الرابط" required hint="صفحة داخل المتجر تبدأ بـ / مثل /offers، أو رابط خارجي يبدأ بـ https://">
                                    <input value={editing.data.action_value ?? ''} onChange={(e) => update({ action_value: e.target.value })} className={inputClass} dir="ltr" required />
                                </Field>
                            )}
                            {editing.data.action_type === 'none' && <div className="hidden md:block" />}
                            <Field label="تاريخ البداية" required><input type="datetime-local" value={toLocalInput(editing.data.starts_at)} onChange={(e) => update({ starts_at: fromLocalInput(e.target.value) ?? new Date().toISOString() })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="تاريخ الانتهاء" hint="اتركيه فارغاً للعرض الدائم"><input type="datetime-local" value={toLocalInput(editing.data.ends_at)} onChange={(e) => update({ ends_at: fromLocalInput(e.target.value) })} className={inputClass} dir="ltr" /></Field>
                            <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً"><input type="number" step="1" value={editing.data.display_order} onChange={(e) => update({ display_order: parseInt(e.target.value, 10) || 0 })} className={inputClass} dir="ltr" /></Field>
                            <Field label="الصورة" required hint={`عرضية بنسبة 16:7 تقريباً (مثل 1600×700). تُصغَّر تلقائياً إلى ${BANNER_MAX_WIDTH} بكسل عرضاً قبل الرفع.`}>
                                <div className="flex items-center gap-3">
                                    {editing.data.image_url && <img src={editing.data.image_url} alt={editing.data.title_ar ? `معاينة: ${editing.data.title_ar}` : 'معاينة صورة البانر'} className="w-20 h-12 rounded-xl object-cover border border-slate-100" />}
                                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => void onFile(e.target.files)} />
                                    <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={`${secondaryButtonClass} flex items-center gap-2 text-sm`}>
                                        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} {editing.data.image_url ? 'تغيير الصورة' : 'رفع صورة'}
                                    </button>
                                </div>
                            </Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => update({ is_active: e.target.checked })} className="w-4 h-4 accent-brand-blue" /> مفعّل
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={saving || uploading} className={primaryButtonClass}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['البانر', 'الإجراء', 'الفترة', 'الترتيب', 'الحالة', 'الإجراءات']} empty={banners.length === 0}>
                    {banners.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <div className="flex items-center gap-3">
                                    <img src={b.image_url} alt="" className="w-20 h-12 rounded-xl object-cover border border-slate-100 bg-slate-50" />
                                    <div>
                                        <p className="text-sm font-black text-slate-900">{b.title_ar}</p>
                                        {b.subtitle_ar && <p className="text-[10px] text-slate-400 font-bold">{b.subtitle_ar}</p>}
                                    </div>
                                </div>
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{actionSummary(b)}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-600" dir="ltr">{formatDate(b.starts_at)} → {b.ends_at ? formatDate(b.ends_at) : '∞'}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{b.display_order}</td>
                            <td className="px-6 py-4"><StatusPill tone={isLive(b) ? 'success' : b.is_active ? 'attention' : 'neutral'}>{isLive(b) ? 'معروض' : b.is_active ? 'خارج الفترة' : 'متوقف'}</StatusPill></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => { const { id: _id, ...data } = b; void _id; setEditing({ id: b.id, data }); }} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    <button type="button" onClick={() => void remove(b)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
