import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, Paperclip, Plus, Search, Trash2, Upload, X } from 'lucide-react';
import type { ProductVariant, PurchaseInvoice, Supplier } from '../../types';
import { fetchWarehouseManagers } from '../../lib/adminApi';
import { fetchWarehouses } from '../../lib/catalogApi';
import {
    PURCHASE_STATUS_LABELS,
    approvePurchaseInvoice,
    fetchPurchaseInvoice,
    fetchSuppliers,
    getAttachmentUrl,
    isoDate,
    savePurchaseInvoiceDraft,
    searchStaffProducts,
    uploadPurchaseAttachment,
    voidPurchaseInvoice,
    type PurchaseInvoiceDraftInput,
    type StaffProductOption,
} from '../../lib/purchasesApi';
import { errorMessage } from '../../lib/errors';
import { formatDateTime, formatSDG } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { Card, Field, Notice, Spinner, StatusPill, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass, type StatusTone } from '../../components/ui';

const MAX_LINES = 200;
const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const STATUS_TONES: Record<PurchaseInvoice['status'], StatusTone> = { draft: 'neutral', approved: 'success', voided: 'danger' };

interface WarehouseChoice { id: string; name: string; is_active: boolean }

interface HeaderForm {
    supplier_id: string;
    warehouse_id: string;
    invoice_date: string;
    supplier_invoice_ref: string;
    discount: string;
    extra: string;
    notes: string;
}

interface Line {
    key: string;
    product_id: string;
    product_name: string;
    variant_id: string;
    variant_name: string | null;
    variants: ProductVariant[];
    quantity: string;
    unit_cost: string;
    expiry_date: string;
    batch_number: string;
}

type Attachment = { id: string; storage_path: string; uploaded_at: string };

function toNumber(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

function lineTotal(line: Line): number {
    return Math.round(toNumber(line.quantity) * toNumber(line.unit_cost) * 100) / 100;
}

function fromInvoice(invoice: PurchaseInvoice): { header: HeaderForm; lines: Line[] } {
    return {
        header: {
            supplier_id: invoice.supplier_id,
            warehouse_id: invoice.warehouse_id,
            invoice_date: invoice.invoice_date,
            supplier_invoice_ref: invoice.supplier_invoice_ref ?? '',
            discount: String(invoice.discount_amount),
            extra: String(invoice.extra_costs),
            notes: invoice.notes ?? '',
        },
        lines: invoice.items.map((item) => ({
            key: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id ?? '',
            variant_name: item.variant_name,
            variants: [],
            quantity: String(item.quantity),
            unit_cost: String(item.unit_cost),
            expiry_date: item.expiry_date ?? '',
            batch_number: item.batch_number ?? '',
        })),
    };
}

const emptyHeader = (): HeaderForm => ({ supplier_id: '', warehouse_id: '', invoice_date: isoDate(new Date()), supplier_invoice_ref: '', discount: '0', extra: '0', notes: '' });

export const PurchaseInvoiceFormPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id;
    const { isAdmin, managedWarehouses } = useAuth();

    const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [acting, setActing] = useState(false);
    const [dirty, setDirty] = useState(false);

    const [header, setHeader] = useState<HeaderForm>(emptyHeader);
    const [lines, setLines] = useState<Line[]>([]);
    const [attachments, setAttachments] = useState<Attachment[]>([]);

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [allWarehouses, setAllWarehouses] = useState<WarehouseChoice[]>([]);
    const [managersByWarehouse, setManagersByWarehouse] = useState<Set<string> | null>(null);

    const [productQuery, setProductQuery] = useState('');
    const [productResults, setProductResults] = useState<StaffProductOption[]>([]);
    const [searching, setSearching] = useState(false);

    const [voiding, setVoiding] = useState(false);
    const [voidReason, setVoidReason] = useState('');
    const [uploading, setUploading] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    const managedIds = useMemo(() => new Set(managedWarehouses.map((w) => w.id)), [managedWarehouses]);
    const warehouseOptions: WarehouseChoice[] = useMemo(
        () => (isAdmin ? allWarehouses : managedWarehouses.map((w) => ({ id: w.id, name: w.name, is_active: true }))),
        [isAdmin, allWarehouses, managedWarehouses],
    );

    const status = invoice?.status ?? 'draft';
    const editable = (isNew || status === 'draft') && (isAdmin || managedIds.has(header.warehouse_id));
    const isManagerOfInvoice = invoice ? isAdmin || managedIds.has(invoice.warehouse_id) : false;
    const canApprove = !isNew && status === 'draft' && (managedIds.has(invoice?.warehouse_id ?? '') || (isAdmin && managersByWarehouse !== null && !managersByWarehouse.has(invoice?.warehouse_id ?? '')));
    const canVoid = !isNew && ((status === 'draft' && isManagerOfInvoice) || (status === 'approved' && isAdmin));
    const canUpload = !isNew && invoice !== null && ((status === 'draft' && isManagerOfInvoice) || (isAdmin && status !== 'voided'));

    const subtotal = useMemo(() => Math.round(lines.reduce((sum, line) => sum + lineTotal(line), 0) * 100) / 100, [lines]);
    const total = subtotal - toNumber(header.discount) + toNumber(header.extra);

    useEffect(() => {
        let cancelled = false;
        fetchSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل الموردين.')); });
        if (isAdmin) {
            fetchWarehouses()
                .then((list) => { if (!cancelled) setAllWarehouses(list.map((w) => ({ id: w.id, name: w.name, is_active: w.is_active }))); })
                .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المستودعات.')); });
            fetchWarehouseManagers()
                .then((list) => { if (!cancelled) setManagersByWarehouse(new Set(list.flatMap((m) => m.warehouse_ids))); })
                .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل مديري المستودعات.')); });
        }
        return () => { cancelled = true; };
    }, [isAdmin]);

    useEffect(() => {
        if (!isNew || header.warehouse_id) return;
        const first = warehouseOptions.find((w) => w.is_active);
        if (first) setHeader((prev) => ({ ...prev, warehouse_id: first.id }));
    }, [isNew, header.warehouse_id, warehouseOptions]);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchPurchaseInvoice(id)
            .then(async (loaded) => {
                if (cancelled) return;
                if (!loaded) { setError('الفاتورة غير موجودة.'); return; }
                const next = fromInvoice(loaded);
                setInvoice(loaded);
                setHeader(next.header);
                setLines(next.lines);
                setAttachments(loaded.attachments);
                setDirty(false);
                if (loaded.status === 'draft') {
                    const names = [...new Set(next.lines.map((line) => line.product_name))];
                    const found = await Promise.all(names.map((name) => searchStaffProducts(name, 30).catch(() => [] as StaffProductOption[])));
                    const variantsById = new Map(found.flat().map((p) => [p.id, p.variants]));
                    if (!cancelled) setLines(next.lines.map((line) => ({ ...line, variants: variantsById.get(line.product_id) ?? [] })));
                }
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل الفاتورة.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        const term = productQuery.trim();
        if (!editable || !term) {
            setProductResults([]);
            return;
        }
        let cancelled = false;
        const timer = setTimeout(() => {
            setSearching(true);
            searchStaffProducts(term)
                .then((rows) => { if (!cancelled) setProductResults(rows); })
                .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر البحث عن المنتجات.')); })
                .finally(() => { if (!cancelled) setSearching(false); });
        }, 300);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [productQuery, editable]);

    const touchHeader = <K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) => {
        setHeader((prev) => ({ ...prev, [key]: value }));
        setDirty(true);
    };

    const updateLine = (key: string, patch: Partial<Line>) => {
        setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));
        setDirty(true);
    };

    const removeLine = (key: string) => {
        setLines((prev) => prev.filter((line) => line.key !== key));
        setDirty(true);
    };

    const addProduct = (product: StaffProductOption) => {
        setLines((prev) => [...prev, {
            key: crypto.randomUUID(),
            product_id: product.id,
            product_name: product.name_ar,
            variant_id: product.variants.length === 1 ? product.variants[0].id : '',
            variant_name: null,
            variants: product.variants,
            quantity: '1',
            unit_cost: '0',
            expiry_date: '',
            batch_number: '',
        }]);
        setProductQuery('');
        setProductResults([]);
        setDirty(true);
    };

    const validate = (): string | null => {
        if (!header.supplier_id) return 'اختاري المورد.';
        if (!header.warehouse_id) return 'اختاري المستودع.';
        if (!header.invoice_date) return 'حددي تاريخ الفاتورة.';
        if (header.invoice_date > isoDate(new Date())) return 'تاريخ الفاتورة لا يمكن أن يكون في المستقبل.';
        if (lines.length === 0) return 'أضيفي بنداً واحداً على الأقل.';
        if (lines.length > MAX_LINES) return `الحد الأقصى ${MAX_LINES} بنداً.`;
        for (const line of lines) {
            if (!Number.isInteger(toNumber(line.quantity)) || toNumber(line.quantity) < 1) return `الكمية في «${line.product_name}» يجب أن تكون عدداً صحيحاً أكبر من صفر.`;
            if (!line.unit_cost.trim() || toNumber(line.unit_cost) < 0) return `سعر الوحدة في «${line.product_name}» غير صحيح.`;
            if (line.variants.length > 0 && !line.variant_id) return `اختاري الخيار للمنتج «${line.product_name}».`;
        }
        if (toNumber(header.extra) < 0) return 'التكاليف الإضافية لا يمكن أن تكون سالبة.';
        if (toNumber(header.discount) < 0 || toNumber(header.discount) > subtotal + toNumber(header.extra)) return 'الخصم لا يمكن أن يتجاوز الإجمالي قبل الخصم.';
        return null;
    };

    const save = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError(null);
        setSuccess(null);
        const problem = validate();
        if (problem) { setError(problem); return; }
        const input: PurchaseInvoiceDraftInput = {
            id: id ?? null,
            supplier_id: header.supplier_id,
            warehouse_id: header.warehouse_id,
            invoice_date: header.invoice_date,
            supplier_invoice_ref: header.supplier_invoice_ref.trim() || null,
            discount_amount: toNumber(header.discount),
            extra_costs: toNumber(header.extra),
            notes: header.notes.trim() || null,
            items: lines.map((line) => ({
                product_id: line.product_id,
                variant_id: line.variant_id || null,
                quantity: parseInt(line.quantity, 10),
                unit_cost: toNumber(line.unit_cost),
                expiry_date: line.expiry_date || null,
                batch_number: line.batch_number.trim() || null,
            })),
        };
        setSaving(true);
        try {
            const savedId = await savePurchaseInvoiceDraft(input);
            setDirty(false);
            if (isNew) {
                navigate(`/purchases/${savedId}`, { replace: true });
                return;
            }
            setSuccess('تم حفظ المسودة.');
            const refreshed = await fetchPurchaseInvoice(savedId);
            if (refreshed) setInvoice(refreshed);
        } catch (err) {
            setError(errorMessage(err, 'تعذر حفظ الفاتورة.'));
        } finally {
            setSaving(false);
        }
    };

    const reloadInvoice = async () => {
        if (!id) return;
        const refreshed = await fetchPurchaseInvoice(id);
        if (!refreshed) return;
        const next = fromInvoice(refreshed);
        setInvoice(refreshed);
        setHeader(next.header);
        setLines(next.lines);
        setAttachments(refreshed.attachments);
        setDirty(false);
    };

    const approve = async () => {
        if (!id) return;
        setActing(true);
        setError(null);
        setSuccess(null);
        try {
            await approvePurchaseInvoice(id);
            await reloadInvoice();
            setSuccess('تم اعتماد الفاتورة: زاد المخزون وتحدّث متوسط التكلفة.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر اعتماد الفاتورة. أعيدي المحاولة.'));
        } finally {
            setActing(false);
        }
    };

    const voidInvoice = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        if (!voidReason.trim()) { setError('اكتبي سبب الإلغاء.'); return; }
        setActing(true);
        setError(null);
        setSuccess(null);
        try {
            await voidPurchaseInvoice(id, voidReason);
            setVoiding(false);
            setVoidReason('');
            await reloadInvoice();
            setSuccess('تم إلغاء الفاتورة.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر إلغاء الفاتورة.'));
        } finally {
            setActing(false);
        }
    };

    const onFile = async (files: FileList | null) => {
        const file = files?.[0];
        if (!file || !invoice) return;
        setUploading(true);
        setError(null);
        try {
            await uploadPurchaseAttachment({ id: invoice.id, warehouse_id: invoice.warehouse_id }, file);
            const refreshed = await fetchPurchaseInvoice(invoice.id);
            setAttachments(refreshed?.attachments ?? attachments);
            setSuccess('تم رفع المرفق.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر رفع المرفق.'));
        } finally {
            setUploading(false);
            if (fileInput.current) fileInput.current.value = '';
        }
    };

    const openAttachment = async (attachment: Attachment) => {
        setError(null);
        try {
            const url = await getAttachmentUrl(attachment.storage_path);
            window.open(url, '_blank', 'noopener,noreferrer');
        } catch (err) {
            setError(errorMessage(err, 'تعذر فتح المرفق.'));
        }
    };

    if (loading) return <Spinner label="جاري تحميل الفاتورة..." />;

    const approveHint = attachments.length === 0
        ? 'أرفقي صورة الفاتورة أو PDF قبل الاعتماد.'
        : dirty ? 'احفظي التعديلات قبل الاعتماد.' : null;

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            <Card className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 sticky top-4 z-30">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/purchases')} className="p-3 bg-slate-50 hover:bg-blue-50 hover:text-brand-blue rounded-2xl transition-all" aria-label="رجوع">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3" dir="ltr">
                            {isNew ? 'فاتورة شراء جديدة' : invoice?.invoice_number}
                            {invoice && <StatusPill tone={STATUS_TONES[invoice.status]}>{PURCHASE_STATUS_LABELS[invoice.status]}</StatusPill>}
                        </h1>
                        {invoice?.status === 'approved' && <p className="text-slate-400 text-xs font-bold mt-0.5">الفاتورة معتمدة وللعرض فقط.</p>}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {editable && (
                        <button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>
                            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null} حفظ المسودة
                        </button>
                    )}
                    {canApprove && (
                        <button type="button" onClick={() => void approve()} disabled={acting || dirty || attachments.length === 0} className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700`}>
                            {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} اعتماد
                        </button>
                    )}
                    {canVoid && !voiding && (
                        <button type="button" onClick={() => { setVoiding(true); setError(null); }} className={`${secondaryButtonClass} text-red-600`}>إلغاء الفاتورة</button>
                    )}
                </div>
            </Card>

            {approveHint && canApprove && <Notice kind="error">{approveHint}</Notice>}
            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            {voiding && (
                <Card className="p-6">
                    <form onSubmit={voidInvoice} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">إلغاء الفاتورة {invoice?.invoice_number}</h3>
                            <button type="button" onClick={() => setVoiding(false)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        {status === 'approved' && (
                            <p className="text-sm font-bold text-amber-700">
                                إلغاء فاتورة معتمدة يُخصم منها المخزون ويُنشئ مرتجعاً تلقائياً للمورد. يفشل الإلغاء إن بيعت كمية من هذه الفاتورة، وعندها أنشئي مرتجعاً جزئياً.
                            </p>
                        )}
                        <Field label="سبب الإلغاء" required>
                            <textarea value={voidReason} onChange={(e) => setVoidReason(e.target.value)} rows={3} className={inputClass} required />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setVoiding(false)} className={secondaryButtonClass}>تراجع</button>
                            <button type="submit" disabled={acting} className={`${primaryButtonClass} bg-red-600 hover:bg-red-700`}>{acting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}</button>
                        </div>
                    </form>
                </Card>
            )}

            <form onSubmit={(e) => void save(e)} className="space-y-8">
                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">بيانات الفاتورة</h3>
                    <div className="grid md:grid-cols-3 gap-6">
                        <Field label="المورد" required>
                            <select value={header.supplier_id} onChange={(e) => touchHeader('supplier_id', e.target.value)} required disabled={!editable} className={inputClass}>
                                <option value="">اختاري المورد...</option>
                                {suppliers.filter((s) => s.is_active || s.id === header.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.is_active ? s.name : `${s.name} (متوقف)`}</option>)}
                            </select>
                        </Field>
                        <Field label="المستودع" required>
                            <select value={header.warehouse_id} onChange={(e) => touchHeader('warehouse_id', e.target.value)} required disabled={!editable} className={inputClass}>
                                <option value="">اختاري المستودع...</option>
                                {warehouseOptions.filter((w) => w.is_active || w.id === header.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </Field>
                        <Field label="تاريخ الفاتورة" required>
                            <input type="date" value={header.invoice_date} onChange={(e) => touchHeader('invoice_date', e.target.value)} max={isoDate(new Date())} required disabled={!editable} className={inputClass} dir="ltr" />
                        </Field>
                        <Field label="رقم فاتورة المورد" hint="يجب ألا يتكرر لنفس المورد">
                            <input value={header.supplier_invoice_ref} onChange={(e) => touchHeader('supplier_invoice_ref', e.target.value)} disabled={!editable} className={inputClass} dir="ltr" />
                        </Field>
                        <Field label="الخصم (ج.س)">
                            <input type="number" min={0} step="0.01" value={header.discount} onChange={(e) => touchHeader('discount', e.target.value)} disabled={!editable} className={inputClass} dir="ltr" />
                        </Field>
                        <Field label="تكاليف إضافية (ج.س)" hint="شحن أو جمارك تُوزَّع على البنود">
                            <input type="number" min={0} step="0.01" value={header.extra} onChange={(e) => touchHeader('extra', e.target.value)} disabled={!editable} className={inputClass} dir="ltr" />
                        </Field>
                    </div>
                    <Field label="ملاحظات">
                        <textarea value={header.notes} onChange={(e) => touchHeader('notes', e.target.value)} rows={2} disabled={!editable} className={inputClass} />
                    </Field>
                </Card>

                <Card className="p-8 space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-lg font-black text-slate-900">البنود</h3>
                        <span className="text-xs font-bold text-slate-400">{lines.length} / {MAX_LINES}</span>
                    </div>

                    {editable && (
                        <div className="relative">
                            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input
                                type="search"
                                value={productQuery}
                                onChange={(e) => setProductQuery(e.target.value)}
                                placeholder="ابحثي عن منتج لإضافته..."
                                className={`${inputClass} pl-12`}
                            />
                            {productQuery.trim() && (
                                <div className="absolute z-20 inset-x-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto">
                                    {searching && <p className="p-4 text-sm font-bold text-slate-400">جاري البحث...</p>}
                                    {!searching && productResults.length === 0 && <p className="p-4 text-sm font-bold text-slate-400">لا توجد نتائج.</p>}
                                    {productResults.map((product) => (
                                        <button key={product.id} type="button" onClick={() => addProduct(product)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-right">
                                            <span>
                                                <span className="block text-sm font-black text-slate-900">{product.name_ar}</span>
                                                <span className="block text-[10px] font-bold text-slate-400">{product.brand ?? ''}{product.is_active ? '' : ' · متوقف'}{product.variants.length ? ` · ${product.variants.length} خيارات` : ''}</span>
                                            </span>
                                            <Plus className="w-4 h-4 text-brand-blue shrink-0" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {lines.length === 0 ? (
                        <p className="text-sm font-bold text-slate-400">لم تُضف بنود بعد.</p>
                    ) : (
                        <div className="space-y-3">
                            {lines.map((line, idx) => {
                                const options = line.variants.length > 0 ? line.variants : line.variant_id ? [{ id: line.variant_id, name_ar: line.variant_name ?? line.variant_id, name_en: '', price: null }] : [];
                                return (
                                    <div key={line.key} className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end p-4 rounded-2xl bg-slate-50/60 border border-slate-100">
                                        <div className="col-span-2 md:col-span-3">
                                            <p className="text-[10px] font-black text-slate-400 mb-1">#{idx + 1} المنتج</p>
                                            <p className="text-sm font-black text-slate-900">{line.product_name}</p>
                                        </div>
                                        <div className="col-span-2 md:col-span-2">
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`variant-${line.key}`}>الخيار{line.variants.length > 0 ? ' *' : ''}</label>
                                            {options.length > 0 ? (
                                                <select id={`variant-${line.key}`} value={line.variant_id} onChange={(e) => updateLine(line.key, { variant_id: e.target.value })} disabled={!editable} className={inputClass}>
                                                    <option value="">اختاري الخيار...</option>
                                                    {options.map((v) => <option key={v.id} value={v.id}>{v.name_ar}</option>)}
                                                </select>
                                            ) : <span className="text-xs font-bold text-slate-400">بلا خيارات</span>}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`qty-${line.key}`}>الكمية</label>
                                            <input id={`qty-${line.key}`} type="number" min={1} step="1" value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" required />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`cost-${line.key}`}>سعر الوحدة</label>
                                            <input id={`cost-${line.key}`} type="number" min={0} step="0.01" value={line.unit_cost} onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" required />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`exp-${line.key}`}>الانتهاء</label>
                                            <input id={`exp-${line.key}`} type="date" value={line.expiry_date} onChange={(e) => updateLine(line.key, { expiry_date: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`batch-${line.key}`}>رقم الدفعة</label>
                                            <input id={`batch-${line.key}`} value={line.batch_number} onChange={(e) => updateLine(line.key, { batch_number: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" />
                                        </div>
                                        <div className="flex items-center justify-between gap-2 md:col-span-1">
                                            <span className="text-sm font-black text-slate-900 whitespace-nowrap">{formatSDG(lineTotal(line))}</span>
                                            {editable && (
                                                <button type="button" onClick={() => removeLine(line.key)} className="p-2 text-red-500 hover:bg-red-50 rounded-xl" aria-label="حذف البند"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="grid md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">المجموع قبل الخصم</p><p className="text-lg font-black text-slate-900">{formatSDG(subtotal)}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">الخصم</p><p className="text-lg font-black text-slate-900">−{formatSDG(toNumber(header.discount))}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">تكاليف إضافية</p><p className="text-lg font-black text-slate-900">+{formatSDG(toNumber(header.extra))}</p></div>
                        <div><p className="text-[10px] font-black text-slate-400 uppercase">الإجمالي</p><p className="text-xl font-black text-brand-blue">{formatSDG(total)}</p></div>
                    </div>
                </Card>
            </form>

            <Card className="p-8 space-y-6">
                <div className="flex items-center justify-between flex-wrap gap-4">
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2"><Paperclip className="w-5 h-5 text-brand-blue" /> المرفقات</h3>
                    {canUpload && (
                        <div>
                            <input ref={fileInput} type="file" accept={ATTACHMENT_ACCEPT} className="hidden" onChange={(e) => void onFile(e.target.files)} />
                            <button type="button" disabled={uploading} onClick={() => fileInput.current?.click()} className={`${secondaryButtonClass} flex items-center gap-2 text-sm`}>
                                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} رفع مرفق
                            </button>
                        </div>
                    )}
                </div>
                {isNew && <p className="text-sm font-bold text-slate-400">احفظي المسودة أولاً لإضافة المرفقات.</p>}
                {!isNew && attachments.length === 0 && <p className="text-sm font-bold text-slate-400">لا توجد مرفقات بعد. الاعتماد يتطلب مرفقاً واحداً على الأقل.</p>}
                {attachments.length > 0 && (
                    <ul className="divide-y divide-slate-100">
                        {attachments.map((attachment, idx) => (
                            <li key={attachment.id} className="py-3 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm font-black text-slate-900" dir="ltr">مرفق {idx + 1}</p>
                                    <p className="text-[10px] font-bold text-slate-400">{formatDateTime(attachment.uploaded_at)}</p>
                                </div>
                                <button type="button" onClick={() => void openAttachment(attachment)} className={`${smallButtonClass} bg-blue-50 text-brand-blue`}>فتح</button>
                            </li>
                        ))}
                    </ul>
                )}
                {!isNew && invoice?.status === 'voided' && <p className="text-xs font-bold text-slate-400">سبب الإلغاء: {invoice.void_reason}</p>}
            </Card>
        </div>
    );
};
