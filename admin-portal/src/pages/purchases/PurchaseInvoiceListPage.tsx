import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import type { PurchaseInvoiceStatus, PurchaseInvoiceSummary, Supplier, Warehouse } from '../../types';
import { fetchWarehouses } from '../../lib/catalogApi';
import { PURCHASE_STATUS_LABELS, fetchPurchaseInvoices, fetchSuppliers, type PurchaseInvoiceFilters } from '../../lib/purchasesApi';
import { errorMessage } from '../../lib/errors';
import { formatNumber, formatSDG } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { Card, Notice, PageHeader, Spinner, StatusPill, Table, primaryButtonClass, type StatusTone } from '../../components/ui';

const PURCHASE_STATUS_TONES: Record<PurchaseInvoiceStatus, StatusTone> = { draft: 'neutral', approved: 'success', voided: 'danger' };

const filterControl = 'bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold';

export const PurchaseInvoiceListPage: React.FC = () => {
    const { isAdmin, managedWarehouses } = useAuth();
    const [invoices, setInvoices] = useState<PurchaseInvoiceSummary[]>([]);
    const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filters, setFilters] = useState<PurchaseInvoiceFilters>({ status: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadOptions = isAdmin
            ? fetchWarehouses().then((list: Warehouse[]) => list.map((w) => ({ id: w.id, name: w.name })))
            : Promise.resolve(managedWarehouses.map((w) => ({ id: w.id, name: w.name })));
        Promise.all([loadOptions, fetchSuppliers()])
            .then(([warehouseList, supplierList]) => {
                if (cancelled) return;
                setWarehouses(warehouseList);
                setSuppliers(supplierList);
            })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل خيارات التصفية.')); });
        return () => { cancelled = true; };
    }, [isAdmin, managedWarehouses]);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        fetchPurchaseInvoices(filters)
            .then((rows) => { if (!cancelled) setInvoices(rows); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل فواتير الشراء.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filters]);

    const update = (patch: Partial<PurchaseInvoiceFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

    return (
        <div className="space-y-8">
            <PageHeader
                title="فواتير الشراء"
                subtitle="فواتير الموردين. الفاتورة المعتمدة تزيد المخزون وتحدّث متوسط التكلفة."
                icon={<FileText className="w-8 h-8 text-brand-blue" />}
                actions={<Link to="/purchases/new" className={primaryButtonClass}><Plus className="w-5 h-5" /> فاتورة جديدة</Link>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 bg-slate-50/30 flex flex-wrap items-center gap-3">
                    <select aria-label="الحالة" value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value as PurchaseInvoiceStatus | '' })} className={filterControl}>
                        <option value="">كل الحالات</option>
                        {(Object.keys(PURCHASE_STATUS_LABELS) as PurchaseInvoiceStatus[]).map((s) => <option key={s} value={s}>{PURCHASE_STATUS_LABELS[s]}</option>)}
                    </select>
                    <select aria-label="المستودع" value={filters.warehouseId ?? ''} onChange={(e) => update({ warehouseId: e.target.value })} className={filterControl}>
                        <option value="">كل المستودعات</option>
                        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <select aria-label="المورد" value={filters.supplierId ?? ''} onChange={(e) => update({ supplierId: e.target.value })} className={filterControl}>
                        <option value="">كل الموردين</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.is_active ? '' : ' (متوقف)'}</option>)}
                    </select>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        من
                        <input type="date" value={filters.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} className={filterControl} dir="ltr" />
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-500">
                        إلى
                        <input type="date" value={filters.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} className={filterControl} dir="ltr" />
                    </label>
                </div>

                {loading ? <Spinner label="جاري تحميل الفواتير..." /> : (
                    <Table headers={['رقم الفاتورة', 'المورد', 'المستودع', 'رقم فاتورة المورد', 'التاريخ', 'الإجمالي', 'الحالة']} empty={invoices.length === 0} emptyText="لا توجد فواتير مطابقة">
                        {invoices.map((invoice) => (
                            <tr key={invoice.id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4"><Link to={`/purchases/${invoice.id}`} className="text-sm font-black text-brand-blue hover:underline" dir="ltr">{invoice.invoice_number}</Link></td>
                                <td className="px-6 py-4 text-sm font-black text-slate-900">{invoice.supplier_name}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600">{invoice.warehouse_name}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-500" dir="ltr">{invoice.supplier_invoice_ref || '—'}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{invoice.invoice_date}</td>
                                <td className="px-6 py-4 text-sm font-black text-slate-900">{formatSDG(invoice.total)}</td>
                                <td className="px-6 py-4"><StatusPill tone={PURCHASE_STATUS_TONES[invoice.status]}>{PURCHASE_STATUS_LABELS[invoice.status]}</StatusPill></td>
                            </tr>
                        ))}
                    </Table>
                )}
                {!loading && <p className="px-6 py-3 text-xs text-slate-400 font-bold border-t border-slate-50">عدد الفواتير المعروضة: {formatNumber(invoices.length)} (حد أقصى 300)</p>}
            </Card>
        </div>
    );
};
