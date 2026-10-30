import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import type { ProductVariant, PurchaseInvoice, PurchaseInvoiceSummary, Supplier, SupplierReturn, SupplierReturnStatus } from '../../types';
import { fetchWarehouses } from '../../lib/catalogApi';
import {
    SUPPLIER_RETURN_STATUS_LABELS,
    approveSupplierReturn,
    cancelSupplierReturn,
    fetchPurchaseInvoice,
    fetchPurchaseInvoices,
    fetchSupplierReturn,
    fetchSuppliers,
    saveSupplierReturnDraft,
    searchStaffProducts,
    type StaffProductOption,
    type SupplierReturnDraftInput,
} from '../../lib/purchasesApi';
import { errorMessage } from '../../lib/errors';
import { useAuth } from '../../context/AuthContext';
import { Card, Field, Notice, Spinner, StatusPill, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass, type StatusTone } from '../../components/ui';

const STATUS_TONES: Record<SupplierReturnStatus, StatusTone> = { draft: 'neutral', approved: 'success', cancelled: 'danger' };

interface WarehouseChoice { id: string; name: string; is_active: boolean }

interface HeaderForm {
    supplier_id: string;
    warehouse_id: string;
    reason: string;
    purchase_invoice_id: string;
    notes: string;
}

interface Line {
    key: string;
    purchase_invoice_item_id: string | null;
    product_id: string;
    product_name: string;
    variant_id: string;
    variant_name: string | null;
    variants: ProductVariant[];
    quantity: string;
    unit_cost: string;
    received_quantity: number | null;
}

function toNumber(value: string): number {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
}

export const SupplierReturnFormPage: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const isNew = !id;
    const { isAdmin, managedWarehouses } = useAuth();

    const [ret, setRet] = useState<SupplierReturn | null>(null);
    const [loading, setLoading] = useState(!isNew);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [acting, setActing] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [cancelReason, setCancelReason] = useState('');

    const [header, setHeader] = useState<HeaderForm>({ supplier_id: '', warehouse_id: '', reason: '', purchase_invoice_id: '', notes: '' });
    const [lines, setLines] = useState<Line[]>([]);

    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [allWarehouses, setAllWarehouses] = useState<WarehouseChoice[]>([]);
    const [approvedInvoices, setApprovedInvoices] = useState<PurchaseInvoiceSummary[]>([]);
    const [invoice, setInvoice] = useState<PurchaseInvoice | null>(null);

    const [productQuery, setProductQuery] = useState('');
    const [productResults, setProductResults] = useState<StaffProductOption[]>([]);
    const [searching, setSearching] = useState(false);

    const managedIds = useMemo(() => new Set(managedWarehouses.map((w) => w.id)), [managedWarehouses]);
    const warehouseOptions: WarehouseChoice[] = useMemo(
        () => (isAdmin ? allWarehouses : managedWarehouses.map((w) => ({ id: w.id, name: w.name, is_active: true }))),
        [isAdmin, allWarehouses, managedWarehouses],
    );

    const status: SupplierReturnStatus = ret?.status ?? 'draft';
    const editable = (isNew || status === 'draft') && (isAdmin || managedIds.has(header.warehouse_id));
    const canApprove = !isNew && status === 'draft' && (isAdmin || managedIds.has(ret?.warehouse_id ?? ''));
    const canCancel = !isNew && status === 'draft' && (isAdmin || managedIds.has(ret?.warehouse_id ?? ''));
    const totalQuantity = lines.reduce((sum, line) => sum + Math.max(0, Math.trunc(toNumber(line.quantity))), 0);

    useEffect(() => {
        let cancelled = false;
        fetchSuppliers()
            .then((list) => { if (!cancelled) setSuppliers(list); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل الموردين.')); });
        if (isAdmin) {
            fetchWarehouses()
                .then((list) => { if (!cancelled) setAllWarehouses(list.map((w) => ({ id: w.id, name: w.name, is_active: w.is_active }))); })
                .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المستودعات.')); });
        }
        return () => { cancelled = true; };
    }, [isAdmin]);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchSupplierReturn(id)
            .then(async (loaded) => {
                if (cancelled) return;
                if (!loaded) { setError('المرتجع غير موجود.'); return; }
                setRet(loaded);
                setHeader({
                    supplier_id: loaded.supplier_id,
                    warehouse_id: loaded.warehouse_id,
                    reason: loaded.reason,
                    purchase_invoice_id: loaded.purchase_invoice_id ?? '',
                    notes: loaded.notes ?? '',
                });
                const mapped: Line[] = loaded.items.map((item) => ({
                    key: item.id,
                    purchase_invoice_item_id: item.purchase_invoice_item_id,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    variant_id: item.variant_id ?? '',
                    variant_name: null,
                    variants: [],
                    quantity: String(item.quantity),
                    unit_cost: String(item.unit_cost),
                    received_quantity: null,
                }));
                if (loaded.status === 'draft') {
                    const names = [...new Set(mapped.map((line) => line.product_name))];
                    const found = await Promise.all(names.map((name) => searchStaffProducts(name, 30).catch(() => [] as StaffProductOption[])));
                    const variantsById = new Map(found.flat().map((p) => [p.id, p.variants]));
                    if (!cancelled) setLines(mapped.map((line) => ({ ...line, variants: variantsById.get(line.product_id) ?? [] })));
                } else if (!cancelled) {
                    setLines(mapped);
                }
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل المرتجع.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [id]);

    useEffect(() => {
        if (!isNew || header.warehouse_id) return;
        const first = warehouseOptions.find((w) => w.is_active);
        if (first) setHeader((prev) => ({ ...prev, warehouse_id: first.id }));
    }, [isNew, header.warehouse_id, warehouseOptions]);

    useEffect(() => {
        if (!editable || !header.supplier_id || !header.warehouse_id) {
            setApprovedInvoices([]);
            return;
        }
        let cancelled = false;
        fetchPurchaseInvoices({ status: 'approved', supplierId: header.supplier_id, warehouseId: header.warehouse_id })
            .then((rows) => { if (!cancelled) setApprovedInvoices(rows); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل فواتير الشراء المعتمدة.')); });
        return () => { cancelled = true; };
    }, [editable, header.supplier_id, header.warehouse_id]);

    useEffect(() => {
        if (!header.purchase_invoice_id) {
            setInvoice(null);
            return;
        }
        let cancelled = false;
        fetchPurchaseInvoice(header.purchase_invoice_id)
            .then((loaded) => { if (!cancelled) setInvoice(loaded); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل بنود الفاتورة.')); });
        return () => { cancelled = true; };
    }, [header.purchase_invoice_id]);

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

    const setField = <K extends keyof HeaderForm>(key: K, value: HeaderForm[K]) => setHeader((prev) => ({ ...prev, [key]: value }));

    // Lines copied from an invoice belong to that invoice, so they go whenever the supplier, warehouse or invoice changes.
    const changeScope = (patch: Partial<HeaderForm>) => {
        setHeader((prev) => ({ ...prev, purchase_invoice_id: '', ...patch }));
        setLines((prev) => prev.filter((line) => !line.purchase_invoice_item_id));
    };

    const updateLine = (key: string, patch: Partial<Line>) => setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)));

    const addInvoiceItem = (item: PurchaseInvoice['items'][number]) => {
        setLines((prev) => [...prev, {
            key: crypto.randomUUID(),
            purchase_invoice_item_id: item.id,
            product_id: item.product_id,
            product_name: item.product_name,
            variant_id: item.variant_id ?? '',
            variant_name: item.variant_name,
            variants: [],
            quantity: '1',
            unit_cost: String(item.landed_unit_cost ?? item.unit_cost),
            received_quantity: item.quantity,
        }]);
    };

    const addProduct = (product: StaffProductOption) => {
        setLines((prev) => [...prev, {
            key: crypto.randomUUID(),
            purchase_invoice_item_id: null,
            product_id: product.id,
            product_name: product.name_ar,
            variant_id: product.variants.length === 1 ? product.variants[0].id : '',
            variant_name: null,
            variants: product.variants,
            quantity: '1',
            unit_cost: '',
            received_quantity: null,
        }]);
        setProductQuery('');
        setProductResults([]);
    };

    const validate = (): string | null => {
        if (!header.supplier_id) return 'اختاري المورد.';
        if (!header.warehouse_id) return 'اختاري المستودع.';
        if (!header.reason.trim()) return 'اكتبي سبب الإرجاع.';
        if (lines.length === 0) return 'أضيفي بنداً واحداً على الأقل.';
        for (const line of lines) {
            const quantity = toNumber(line.quantity);
            if (!Number.isInteger(quantity) || quantity < 1) return `الكمية في «${line.product_name}» يجب أن تكون عدداً صحيحاً أكبر من صفر.`;
            if (line.received_quantity != null && quantity > line.received_quantity) return `الكمية في «${line.product_name}» تتجاوز المستلم (${line.received_quantity}).`;
            if (line.variants.length > 0 && !line.variant_id) return `اختاري الخيار للمنتج «${line.product_name}».`;
            if (line.unit_cost.trim() && toNumber(line.unit_cost) < 0) return `تكلفة «${line.product_name}» لا يمكن أن تكون سالبة.`;
        }
        return null;
    };

    const save = async (e?: React.FormEvent) => {
        e?.preventDefault();
        setError(null);
        setSuccess(null);
        const problem = validate();
        if (problem) { setError(problem); return; }
        const input: SupplierReturnDraftInput = {
            id: id ?? null,
            supplier_id: header.supplier_id,
            warehouse_id: header.warehouse_id,
            reason: header.reason,
            purchase_invoice_id: header.purchase_invoice_id || null,
            notes: header.notes.trim() || null,
            items: lines.map((line) => ({
                purchase_invoice_item_id: line.purchase_invoice_item_id,
                product_id: line.product_id,
                variant_id: line.variant_id || null,
                quantity: parseInt(line.quantity, 10),
                unit_cost: line.unit_cost.trim() ? toNumber(line.unit_cost) : null,
            })),
        };
        setSaving(true);
        try {
            const savedId = await saveSupplierReturnDraft(input);
            if (isNew) {
                navigate(`/supplier-returns/${savedId}`, { replace: true });
                return;
            }
            setSuccess('تم حفظ المسودة.');
            const refreshed = await fetchSupplierReturn(savedId);
            if (refreshed) setRet(refreshed);
        } catch (err) {
            setError(errorMessage(err, 'تعذر حفظ المرتجع.'));
        } finally {
            setSaving(false);
        }
    };

    const approve = async () => {
        if (!id) return;
        setActing(true);
        setError(null);
        setSuccess(null);
        try {
            await approveSupplierReturn(id);
            const refreshed = await fetchSupplierReturn(id);
            if (refreshed) setRet(refreshed);
            setSuccess('تم اعتماد المرتجع: خُصم المخزون وحُدّث متوسط التكلفة.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر اعتماد المرتجع.'));
        } finally {
            setActing(false);
        }
    };

    const cancel = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!id) return;
        if (!cancelReason.trim()) { setError('اكتبي سبب الإلغاء.'); return; }
        setActing(true);
        setError(null);
        try {
            await cancelSupplierReturn(id, cancelReason);
            setCancelling(false);
            setCancelReason('');
            const refreshed = await fetchSupplierReturn(id);
            if (refreshed) setRet(refreshed);
            setSuccess('تم إلغاء المرتجع.');
        } catch (err) {
            setError(errorMessage(err, 'تعذر إلغاء المرتجع.'));
        } finally {
            setActing(false);
        }
    };

    if (loading) return <Spinner label="جاري تحميل المرتجع..." />;

    const invoiceItemsAvailable = invoice?.items.filter((item) => !lines.some((line) => line.purchase_invoice_item_id === item.id)) ?? [];

    return (
        <div className="max-w-6xl mx-auto space-y-8 pb-20">
            <Card className="flex flex-col md:flex-row md:items-center justify-between gap-6 p-5 sticky top-4 z-30">
                <div className="flex items-center gap-4">
                    <button type="button" onClick={() => navigate('/supplier-returns')} className="p-3 bg-slate-50 hover:bg-blue-50 hover:text-brand-blue rounded-2xl transition-all" aria-label="رجوع">
                        <ArrowRight className="w-6 h-6" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3" dir="ltr">
                            {isNew ? 'مرتجع مورد جديد' : ret?.return_number}
                            {ret && <StatusPill tone={STATUS_TONES[ret.status]}>{SUPPLIER_RETURN_STATUS_LABELS[ret.status]}</StatusPill>}
                        </h1>
                        {ret?.is_void_reversal && <p className="text-red-600 text-xs font-black mt-0.5">مرتجع عكسي من إلغاء فاتورة شراء.</p>}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {editable && (
                        <button type="button" onClick={() => void save()} disabled={saving} className={primaryButtonClass}>
                            {saving && <Loader2 className="w-5 h-5 animate-spin" />} حفظ المسودة
                        </button>
                    )}
                    {canApprove && (
                        <button type="button" onClick={() => void approve()} disabled={acting} className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700`}>
                            {acting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />} اعتماد
                        </button>
                    )}
                    {canCancel && !cancelling && (
                        <button type="button" onClick={() => { setCancelling(true); setError(null); }} className={`${secondaryButtonClass} text-red-600`}>إلغاء المرتجع</button>
                    )}
                </div>
            </Card>

            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            {cancelling && (
                <Card className="p-6">
                    <form onSubmit={cancel} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">إلغاء المرتجع {ret?.return_number}</h3>
                            <button type="button" onClick={() => setCancelling(false)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <Field label="سبب الإلغاء" required>
                            <textarea value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} rows={3} className={inputClass} required />
                        </Field>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setCancelling(false)} className={secondaryButtonClass}>تراجع</button>
                            <button type="submit" disabled={acting} className={`${primaryButtonClass} bg-red-600 hover:bg-red-700`}>{acting ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}</button>
                        </div>
                    </form>
                </Card>
            )}

            <form onSubmit={(e) => void save(e)} className="space-y-8">
                <Card className="p-8 space-y-6">
                    <h3 className="text-lg font-black text-slate-900">بيانات المرتجع</h3>
                    <div className="grid md:grid-cols-2 gap-6">
                        <Field label="المورد" required>
                            <select value={header.supplier_id} onChange={(e) => changeScope({ supplier_id: e.target.value })} required disabled={!editable} className={inputClass}>
                                <option value="">اختاري المورد...</option>
                                {suppliers.filter((s) => s.is_active || s.id === header.supplier_id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </Field>
                        <Field label="المستودع" required>
                            <select value={header.warehouse_id} onChange={(e) => changeScope({ warehouse_id: e.target.value })} required disabled={!editable} className={inputClass}>
                                <option value="">اختاري المستودع...</option>
                                {warehouseOptions.filter((w) => w.is_active || w.id === header.warehouse_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </Field>
                        <Field label="فاتورة الشراء المرتبطة" hint="اختياري: يُسحب منها بنود بتكلفتها الفعلية">
                            <select value={header.purchase_invoice_id} onChange={(e) => changeScope({ purchase_invoice_id: e.target.value })} disabled={!editable || !header.supplier_id} className={inputClass} dir="ltr">
                                <option value="">بدون فاتورة</option>
                                {approvedInvoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_number} · {inv.invoice_date}</option>)}
                                {header.purchase_invoice_id && !approvedInvoices.some((inv) => inv.id === header.purchase_invoice_id) && <option value={header.purchase_invoice_id}>{invoice?.invoice_number ?? header.purchase_invoice_id}</option>}
                            </select>
                        </Field>
                        <Field label="السبب" required>
                            <input value={header.reason} onChange={(e) => setField('reason', e.target.value)} disabled={!editable} required className={inputClass} />
                        </Field>
                    </div>
                    <Field label="ملاحظات">
                        <textarea value={header.notes} onChange={(e) => setField('notes', e.target.value)} rows={2} disabled={!editable} className={inputClass} />
                    </Field>
                </Card>

                <Card className="p-8 space-y-6">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                        <h3 className="text-lg font-black text-slate-900">البنود</h3>
                        <span className="text-xs font-bold text-slate-400">إجمالي الكميات: {totalQuantity}</span>
                    </div>

                    {editable && invoice && invoiceItemsAvailable.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-xs font-black text-slate-500">من بنود {invoice.invoice_number}:</p>
                            <div className="flex flex-wrap gap-2">
                                {invoiceItemsAvailable.map((item) => (
                                    <button key={item.id} type="button" onClick={() => addInvoiceItem(item)} className={`${smallButtonClass} bg-slate-100 text-slate-700 flex items-center gap-1`}>
                                        <Plus className="w-3.5 h-3.5" /> {item.product_name}{item.variant_name ? ` — ${item.variant_name}` : ''} ({item.quantity})
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {editable && (
                        <div className="relative">
                            <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                            <input
                                type="search"
                                value={productQuery}
                                onChange={(e) => setProductQuery(e.target.value)}
                                placeholder="أو ابحثي عن منتج لإرجاعه بلا فاتورة..."
                                className={`${inputClass} pl-12`}
                            />
                            {productQuery.trim() && (
                                <div className="absolute z-20 inset-x-0 top-full mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-72 overflow-y-auto">
                                    {searching && <p className="p-4 text-sm font-bold text-slate-400">جاري البحث...</p>}
                                    {!searching && productResults.length === 0 && <p className="p-4 text-sm font-bold text-slate-400">لا توجد نتائج.</p>}
                                    {productResults.map((product) => (
                                        <button key={product.id} type="button" onClick={() => addProduct(product)} className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50 text-right">
                                            <span className="text-sm font-black text-slate-900">{product.name_ar}</span>
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
                            {lines.map((line) => {
                                const options = line.variants.length > 0 ? line.variants : line.variant_id ? [{ id: line.variant_id, name_ar: line.variant_name ?? line.variant_id, name_en: '', price: null }] : [];
                                return (
                                    <div key={line.key} className="grid grid-cols-2 md:grid-cols-12 gap-3 items-end p-4 rounded-2xl bg-slate-50/60 border border-slate-100">
                                        <div className="col-span-2 md:col-span-3">
                                            <p className="text-[10px] font-black text-slate-400 mb-1">{line.purchase_invoice_item_id ? 'من الفاتورة' : 'منتج بلا فاتورة'}</p>
                                            <p className="text-sm font-black text-slate-900">{line.product_name}</p>
                                        </div>
                                        <div className="col-span-2 md:col-span-3">
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`rvariant-${line.key}`}>الخيار{line.variants.length > 0 ? ' *' : ''}</label>
                                            {options.length > 0 && !line.purchase_invoice_item_id ? (
                                                <select id={`rvariant-${line.key}`} value={line.variant_id} onChange={(e) => updateLine(line.key, { variant_id: e.target.value })} disabled={!editable} className={inputClass}>
                                                    <option value="">اختاري الخيار...</option>
                                                    {options.map((v) => <option key={v.id} value={v.id}>{v.name_ar}</option>)}
                                                </select>
                                            ) : <span className="text-xs font-bold text-slate-500">{line.variant_name ?? (line.variant_id ? 'خيار محدد' : '—')}</span>}
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`rqty-${line.key}`}>الكمية{line.received_quantity != null ? ` (المستلم ${line.received_quantity})` : ''}</label>
                                            <input id={`rqty-${line.key}`} type="number" min={1} step="1" max={line.received_quantity ?? undefined} value={line.quantity} onChange={(e) => updateLine(line.key, { quantity: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" required />
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-black text-slate-400 mb-1 block" htmlFor={`rcost-${line.key}`}>التكلفة للوحدة</label>
                                            <input id={`rcost-${line.key}`} type="number" min={0} step="0.01" placeholder="متوسط التكلفة" value={line.unit_cost} onChange={(e) => updateLine(line.key, { unit_cost: e.target.value })} disabled={!editable} className={inputClass} dir="ltr" />
                                        </div>
                                        <div className="flex justify-end">
                                            {editable && (
                                                <button type="button" onClick={() => setLines((prev) => prev.filter((l) => l.key !== line.key))} className="p-2 text-red-500 hover:bg-red-50 rounded-xl" aria-label="حذف البند"><Trash2 className="w-4 h-4" /></button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </form>
        </div>
    );
};
