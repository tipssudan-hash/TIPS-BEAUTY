import { supabase } from './supabase';
import type { Json } from './database.types';
import { downscaleImage, mapVariants, validateImage } from './catalogApi';
import type {
    ProductVariant,
    ProfitReport,
    PurchaseInvoice,
    PurchaseInvoiceAttachment,
    PurchaseInvoiceItem,
    PurchaseInvoiceStatus,
    PurchaseInvoiceSummary,
    Supplier,
    SupplierInput,
    SupplierReturn,
    SupplierReturnItem,
    SupplierReturnStatus,
    SupplierReturnSummary,
} from '../types';

// Suppliers, purchase invoices, supplier returns and the profit report. Every write is an RPC that
// checks access and state server-side; the reads run under RLS (managers see their warehouses only).

type Related<T> = T | T[] | null;

function related<T>(value: Related<T>): T | null {
    if (Array.isArray(value)) return value[0] ?? null;
    return value ?? null;
}

function optionalText(value: string | null | undefined): string | undefined {
    return value?.trim() || undefined;
}

export function isoDate(date: Date): string {
    return date.toLocaleDateString('en-CA');
}

export const PURCHASE_STATUS_LABELS: Record<PurchaseInvoiceStatus, string> = { draft: 'مسودة', approved: 'معتمدة', voided: 'ملغاة' };
export const SUPPLIER_RETURN_STATUS_LABELS: Record<SupplierReturnStatus, string> = { draft: 'مسودة', approved: 'معتمد', cancelled: 'ملغى' };

// Suppliers ----------------------------------------------------------------------------

export async function fetchSuppliers(): Promise<Supplier[]> {
    const { data, error } = await supabase.from('suppliers').select('id,name,phone,email,address,tax_number,notes,is_active').order('name');
    if (error) throw error;
    return data ?? [];
}

export async function saveSupplier(id: string | null, input: SupplierInput): Promise<string> {
    const { data, error } = await supabase.rpc('staff_save_supplier', {
        p_name: input.name.trim(),
        p_id: id ?? undefined,
        p_phone: optionalText(input.phone),
        p_email: optionalText(input.email),
        p_address: optionalText(input.address),
        p_tax_number: optionalText(input.tax_number),
        p_notes: optionalText(input.notes),
        p_is_active: input.is_active,
    });
    if (error) throw error;
    return data;
}

// Product search for staff (no cost fields) ----------------------------------------------

export interface StaffProductOption {
    id: string;
    name_ar: string;
    brand: string | null;
    image: string | null;
    variants: ProductVariant[];
    is_active: boolean;
}

export async function searchStaffProducts(query: string, limit = 30): Promise<StaffProductOption[]> {
    const { data, error } = await supabase.rpc('staff_search_products', { p_query: query.trim() || undefined, p_limit: limit });
    if (error) throw error;
    return (data ?? []).map((row) => ({
        id: row.id,
        name_ar: row.name_ar,
        brand: row.brand ?? null,
        image: row.image ?? null,
        variants: mapVariants(row.variants),
        is_active: row.is_active,
    }));
}

// Purchase invoices --------------------------------------------------------------------

interface SummaryRow {
    id: string;
    invoice_number: string;
    supplier_id: string;
    warehouse_id: string;
    supplier_invoice_ref: string | null;
    invoice_date: string;
    status: string;
    total: number;
    suppliers: Related<{ name: string }>;
    warehouses: Related<{ name: string }>;
}

interface ItemRow {
    id: string;
    line_no: number;
    product_id: string;
    variant_id: string | null;
    variant_name: string | null;
    quantity: number;
    unit_cost: number;
    line_total: number;
    landed_unit_cost: number | null;
    expiry_date: string | null;
    batch_number: string | null;
    products: Related<{ name_ar: string }>;
}

interface DetailRow extends SummaryRow {
    subtotal: number;
    discount_amount: number;
    extra_costs: number;
    notes: string | null;
    created_at: string;
    approved_at: string | null;
    voided_at: string | null;
    void_reason: string | null;
    purchase_invoice_items: ItemRow[];
    purchase_invoice_attachments: { id: string; storage_path: string; uploaded_at: string }[];
}

const INVOICE_SUMMARY_SELECT = 'id,invoice_number,supplier_id,warehouse_id,supplier_invoice_ref,invoice_date,status,total,suppliers(name),warehouses(name)';
const INVOICE_DETAIL_SELECT = `${INVOICE_SUMMARY_SELECT},subtotal,discount_amount,extra_costs,notes,created_at,approved_at,voided_at,void_reason,purchase_invoice_items(id,line_no,product_id,variant_id,variant_name,quantity,unit_cost,line_total,landed_unit_cost,expiry_date,batch_number,products(name_ar)),purchase_invoice_attachments(id,storage_path,uploaded_at)`;

function toSummary(row: SummaryRow): PurchaseInvoiceSummary {
    return {
        id: row.id,
        invoice_number: row.invoice_number,
        supplier_id: row.supplier_id,
        supplier_name: related(row.suppliers)?.name ?? '—',
        warehouse_id: row.warehouse_id,
        warehouse_name: related(row.warehouses)?.name ?? '—',
        supplier_invoice_ref: row.supplier_invoice_ref,
        invoice_date: row.invoice_date,
        status: row.status as PurchaseInvoiceStatus,
        total: Number(row.total),
    };
}

function toItem(row: ItemRow): PurchaseInvoiceItem {
    return {
        id: row.id,
        line_no: row.line_no,
        product_id: row.product_id,
        product_name: related(row.products)?.name_ar ?? '—',
        variant_id: row.variant_id,
        variant_name: row.variant_name,
        quantity: Number(row.quantity),
        unit_cost: Number(row.unit_cost),
        line_total: Number(row.line_total),
        landed_unit_cost: row.landed_unit_cost == null ? null : Number(row.landed_unit_cost),
        expiry_date: row.expiry_date,
        batch_number: row.batch_number,
    };
}

export interface PurchaseInvoiceFilters {
    status?: PurchaseInvoiceStatus | '';
    warehouseId?: string;
    supplierId?: string;
    from?: string;
    to?: string;
}

export async function fetchPurchaseInvoices(filters: PurchaseInvoiceFilters): Promise<PurchaseInvoiceSummary[]> {
    let query = supabase.from('purchase_invoices').select(INVOICE_SUMMARY_SELECT).order('invoice_date', { ascending: false }).order('created_at', { ascending: false }).limit(300);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
    if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId);
    if (filters.from) query = query.gte('invoice_date', filters.from);
    if (filters.to) query = query.lte('invoice_date', filters.to);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as SummaryRow[]).map(toSummary);
}

export async function fetchPurchaseInvoice(id: string): Promise<PurchaseInvoice | null> {
    const { data, error } = await supabase.from('purchase_invoices').select(INVOICE_DETAIL_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as DetailRow;
    const attachments: PurchaseInvoiceAttachment[] = row.purchase_invoice_attachments.map((a) => ({ id: a.id, storage_path: a.storage_path, uploaded_at: a.uploaded_at }));
    return {
        ...toSummary(row),
        subtotal: Number(row.subtotal),
        discount_amount: Number(row.discount_amount),
        extra_costs: Number(row.extra_costs),
        notes: row.notes,
        created_at: row.created_at,
        approved_at: row.approved_at,
        voided_at: row.voided_at,
        void_reason: row.void_reason,
        items: row.purchase_invoice_items.map(toItem).sort((a, b) => a.line_no - b.line_no),
        attachments,
    };
}

export interface PurchaseInvoiceLineInput {
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_cost: number;
    expiry_date: string | null;
    batch_number: string | null;
}

export interface PurchaseInvoiceDraftInput {
    id: string | null;
    supplier_id: string;
    warehouse_id: string;
    invoice_date: string;
    supplier_invoice_ref: string | null;
    discount_amount: number;
    extra_costs: number;
    notes: string | null;
    items: PurchaseInvoiceLineInput[];
}

export async function savePurchaseInvoiceDraft(input: PurchaseInvoiceDraftInput): Promise<string> {
    const items: Json = input.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        ...(item.variant_id ? { variant_id: item.variant_id } : {}),
        ...(item.expiry_date ? { expiry_date: item.expiry_date } : {}),
        ...(item.batch_number ? { batch_number: item.batch_number } : {}),
    }));
    const { data, error } = await supabase.rpc('save_purchase_invoice_draft', {
        p_supplier_id: input.supplier_id,
        p_warehouse_id: input.warehouse_id,
        p_invoice_date: input.invoice_date,
        p_items: items,
        p_id: input.id ?? undefined,
        p_supplier_invoice_ref: input.supplier_invoice_ref ?? undefined,
        p_discount_amount: input.discount_amount,
        p_extra_costs: input.extra_costs,
        p_notes: input.notes ?? undefined,
    });
    if (error) throw error;
    return data;
}

export async function approvePurchaseInvoice(id: string): Promise<void> {
    const { error } = await supabase.rpc('approve_purchase_invoice', { p_invoice_id: id });
    if (error) throw error;
}

export async function voidPurchaseInvoice(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('void_purchase_invoice', { p_invoice_id: id, p_reason: reason.trim() });
    if (error) throw error;
}

// Attachments: private bucket, one object per file, registered by an RPC that checks the path prefix.

const ATTACHMENT_EXTENSIONS: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
};
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const INVOICE_IMAGE_MAX_WIDTH = 2000;

export function validateAttachment(file: File): string | null {
    if (!(file.type in ATTACHMENT_EXTENSIONS)) return 'الملفات المسموحة: JPG أو PNG أو WebP أو PDF.';
    if (file.type === 'application/pdf') return file.size > PDF_MAX_BYTES ? 'حجم ملف PDF يجب ألا يتجاوز 10 ميجابايت.' : null;
    return validateImage(file);
}

export async function uploadPurchaseAttachment(invoice: { id: string; warehouse_id: string }, file: File): Promise<string> {
    const problem = validateAttachment(file);
    if (problem) throw new Error(problem);
    const prepared = file.type.startsWith('image/') ? await downscaleImage(file, INVOICE_IMAGE_MAX_WIDTH) : file;
    const path = `${invoice.warehouse_id}/${invoice.id}/${Date.now()}.${ATTACHMENT_EXTENSIONS[prepared.type]}`;
    const { error: uploadError } = await supabase.storage.from('purchase-invoices').upload(path, prepared, { contentType: prepared.type, upsert: false });
    if (uploadError) throw uploadError;
    const { data, error } = await supabase.rpc('add_purchase_invoice_attachment', { p_invoice_id: invoice.id, p_storage_path: path });
    if (error) throw error;
    return data;
}

export async function getAttachmentUrl(path: string): Promise<string> {
    const { data, error } = await supabase.storage.from('purchase-invoices').createSignedUrl(path, 300);
    if (error) throw error;
    return data.signedUrl;
}

// Supplier returns ---------------------------------------------------------------------

interface ReturnSummaryRow {
    id: string;
    return_number: string;
    supplier_id: string;
    warehouse_id: string;
    purchase_invoice_id: string | null;
    status: string;
    reason: string;
    is_void_reversal: boolean;
    created_at: string;
    approved_at: string | null;
    suppliers: Related<{ name: string }>;
    warehouses: Related<{ name: string }>;
    purchase_invoices: Related<{ invoice_number: string }>;
}

interface ReturnItemRow {
    id: string;
    purchase_invoice_item_id: string | null;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_cost: number;
    products: Related<{ name_ar: string }>;
}

interface ReturnDetailRow extends ReturnSummaryRow {
    notes: string | null;
    supplier_return_items: ReturnItemRow[];
}

const RETURN_SUMMARY_SELECT = 'id,return_number,supplier_id,warehouse_id,purchase_invoice_id,status,reason,is_void_reversal,created_at,approved_at,suppliers(name),warehouses(name),purchase_invoices(invoice_number)';
const RETURN_DETAIL_SELECT = `${RETURN_SUMMARY_SELECT},notes,supplier_return_items(id,purchase_invoice_item_id,product_id,variant_id,quantity,unit_cost,products(name_ar))`;

function toReturnSummary(row: ReturnSummaryRow): SupplierReturnSummary {
    return {
        id: row.id,
        return_number: row.return_number,
        supplier_id: row.supplier_id,
        supplier_name: related(row.suppliers)?.name ?? '—',
        warehouse_id: row.warehouse_id,
        warehouse_name: related(row.warehouses)?.name ?? '—',
        purchase_invoice_id: row.purchase_invoice_id,
        invoice_number: related(row.purchase_invoices)?.invoice_number ?? null,
        status: row.status as SupplierReturnStatus,
        reason: row.reason,
        is_void_reversal: row.is_void_reversal,
        created_at: row.created_at,
        approved_at: row.approved_at,
    };
}

export interface SupplierReturnFilters {
    status?: SupplierReturnStatus | '';
    warehouseId?: string;
    supplierId?: string;
}

export async function fetchSupplierReturns(filters: SupplierReturnFilters): Promise<SupplierReturnSummary[]> {
    let query = supabase.from('supplier_returns').select(RETURN_SUMMARY_SELECT).order('created_at', { ascending: false }).limit(300);
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.warehouseId) query = query.eq('warehouse_id', filters.warehouseId);
    if (filters.supplierId) query = query.eq('supplier_id', filters.supplierId);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as ReturnSummaryRow[]).map(toReturnSummary);
}

export async function fetchSupplierReturn(id: string): Promise<SupplierReturn | null> {
    const { data, error } = await supabase.from('supplier_returns').select(RETURN_DETAIL_SELECT).eq('id', id).maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const row = data as unknown as ReturnDetailRow;
    const items: SupplierReturnItem[] = row.supplier_return_items.map((item) => ({
        id: item.id,
        purchase_invoice_item_id: item.purchase_invoice_item_id,
        product_id: item.product_id,
        product_name: related(item.products)?.name_ar ?? '—',
        variant_id: item.variant_id,
        quantity: Number(item.quantity),
        unit_cost: Number(item.unit_cost),
    }));
    return { ...toReturnSummary(row), notes: row.notes, items };
}

export interface SupplierReturnLineInput {
    purchase_invoice_item_id: string | null;
    product_id: string;
    variant_id: string | null;
    quantity: number;
    unit_cost: number | null;
}

export interface SupplierReturnDraftInput {
    id: string | null;
    supplier_id: string;
    warehouse_id: string;
    reason: string;
    purchase_invoice_id: string | null;
    notes: string | null;
    items: SupplierReturnLineInput[];
}

export async function saveSupplierReturnDraft(input: SupplierReturnDraftInput): Promise<string> {
    const items: Json = input.items.map((item) => ({
        product_id: item.product_id,
        quantity: item.quantity,
        ...(item.purchase_invoice_item_id ? { purchase_invoice_item_id: item.purchase_invoice_item_id } : {}),
        ...(item.variant_id ? { variant_id: item.variant_id } : {}),
        ...(item.unit_cost != null ? { unit_cost: item.unit_cost } : {}),
    }));
    const { data, error } = await supabase.rpc('save_supplier_return_draft', {
        p_supplier_id: input.supplier_id,
        p_warehouse_id: input.warehouse_id,
        p_reason: input.reason.trim(),
        p_items: items,
        p_id: input.id ?? undefined,
        p_purchase_invoice_id: input.purchase_invoice_id ?? undefined,
        p_notes: optionalText(input.notes),
    });
    if (error) throw error;
    return data;
}

export async function approveSupplierReturn(id: string): Promise<void> {
    const { error } = await supabase.rpc('approve_supplier_return', { p_return_id: id });
    if (error) throw error;
}

export async function cancelSupplierReturn(id: string, reason: string): Promise<void> {
    const { error } = await supabase.rpc('cancel_supplier_return', { p_return_id: id, p_reason: reason.trim() });
    if (error) throw error;
}

// Profit report (admin) ------------------------------------------------------------------

export async function fetchProfitReport(start: string, end: string, warehouseId: string | null): Promise<ProfitReport> {
    const { data, error } = await supabase.rpc('admin_profit_report', { p_start: start, p_end: end, p_warehouse_id: warehouseId ?? undefined });
    if (error) throw error;
    const raw = (data ?? {}) as unknown as Partial<ProfitReport>;
    const percent = (value: number | null | undefined) => (value == null ? null : Number(value));
    return {
        revenue: Number(raw.revenue ?? 0),
        cogs: Number(raw.cogs ?? 0),
        gross_profit: Number(raw.gross_profit ?? 0),
        margin_pct: percent(raw.margin_pct),
        missing_cost_lines: Number(raw.missing_cost_lines ?? 0),
        estimated_cost_lines: Number(raw.estimated_cost_lines ?? 0),
        cogs_reversed: Number(raw.cogs_reversed ?? 0),
        by_product: (Array.isArray(raw.by_product) ? raw.by_product : []).map((p) => ({
            product_id: p.product_id,
            product_name: p.product_name ?? '—',
            quantity: Number(p.quantity ?? 0),
            revenue: Number(p.revenue ?? 0),
            cogs: Number(p.cogs ?? 0),
            gross_profit: Number(p.gross_profit ?? 0),
            margin_pct: p.margin_pct != null ? Number(p.margin_pct) : (Number(p.revenue ?? 0) > 0 ? Math.round((Number(p.revenue) - Number(p.cogs ?? 0)) / Number(p.revenue) * 10000) / 100 : null),
        })),
    };
}
