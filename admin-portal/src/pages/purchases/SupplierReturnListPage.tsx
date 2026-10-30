import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { PackageX, Plus } from 'lucide-react';
import type { Supplier, SupplierReturnStatus, SupplierReturnSummary, Warehouse } from '../../types';
import { fetchWarehouses } from '../../lib/catalogApi';
import { SUPPLIER_RETURN_STATUS_LABELS, fetchSupplierReturns, fetchSuppliers, type SupplierReturnFilters } from '../../lib/purchasesApi';
import { errorMessage } from '../../lib/errors';
import { formatDateTime } from '../../lib/format';
import { useAuth } from '../../context/AuthContext';
import { Card, Notice, PageHeader, Spinner, StatusPill, Table, primaryButtonClass, type StatusTone } from '../../components/ui';

const RETURN_STATUS_TONES: Record<SupplierReturnStatus, StatusTone> = { draft: 'neutral', approved: 'success', cancelled: 'danger' };

const filterControl = 'bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold';

export const SupplierReturnListPage: React.FC = () => {
    const { isAdmin, managedWarehouses } = useAuth();
    const [returns, setReturns] = useState<SupplierReturnSummary[]>([]);
    const [warehouses, setWarehouses] = useState<{ id: string; name: string }[]>([]);
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [filters, setFilters] = useState<SupplierReturnFilters>({ status: '' });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        const loadWarehouses = isAdmin
            ? fetchWarehouses().then((list: Warehouse[]) => list.map((w) => ({ id: w.id, name: w.name })))
            : Promise.resolve(managedWarehouses.map((w) => ({ id: w.id, name: w.name })));
        Promise.all([loadWarehouses, fetchSuppliers()])
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
        fetchSupplierReturns(filters)
            .then((rows) => { if (!cancelled) setReturns(rows); })
            .catch((err) => { if (!cancelled) setError(errorMessage(err, 'تعذر تحميل مرتجعات الموردين.')); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [filters]);

    const update = (patch: Partial<SupplierReturnFilters>) => setFilters((prev) => ({ ...prev, ...patch }));

    return (
        <div className="space-y-8">
            <PageHeader
                title="مرتجعات الموردين"
                subtitle="البضاعة المُعادة إلى المورد. المعتمد منها يخفض المخزون ويُعدّل متوسط التكلفة."
                icon={<PackageX className="w-8 h-8 text-brand-blue" />}
                actions={<Link to="/supplier-returns/new" className={primaryButtonClass}><Plus className="w-5 h-5" /> مرتجع جديد</Link>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 bg-slate-50/30 flex flex-wrap items-center gap-3">
                    <select aria-label="الحالة" value={filters.status ?? ''} onChange={(e) => update({ status: e.target.value as SupplierReturnStatus | '' })} className={filterControl}>
                        <option value="">كل الحالات</option>
                        {(Object.keys(SUPPLIER_RETURN_STATUS_LABELS) as SupplierReturnStatus[]).map((s) => <option key={s} value={s}>{SUPPLIER_RETURN_STATUS_LABELS[s]}</option>)}
                    </select>
                    <select aria-label="المستودع" value={filters.warehouseId ?? ''} onChange={(e) => update({ warehouseId: e.target.value })} className={filterControl}>
                        <option value="">كل المستودعات</option>
                        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <select aria-label="المورد" value={filters.supplierId ?? ''} onChange={(e) => update({ supplierId: e.target.value })} className={filterControl}>
                        <option value="">كل الموردين</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                </div>

                {loading ? <Spinner label="جاري تحميل المرتجعات..." /> : (
                    <Table headers={['رقم المرتجع', 'المورد', 'المستودع', 'فاتورة الشراء', 'السبب', 'التاريخ', 'الحالة']} empty={returns.length === 0} emptyText="لا توجد مرتجعات مطابقة">
                        {returns.map((ret) => (
                            <tr key={ret.id} className="hover:bg-slate-50/50">
                                <td className="px-6 py-4">
                                    <Link to={`/supplier-returns/${ret.id}`} className="text-sm font-black text-brand-blue hover:underline" dir="ltr">{ret.return_number}</Link>
                                    {ret.is_void_reversal && <span className="block text-[10px] font-black text-red-600">عكس إلغاء فاتورة</span>}
                                </td>
                                <td className="px-6 py-4 text-sm font-black text-slate-900">{ret.supplier_name}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-600">{ret.warehouse_name}</td>
                                <td className="px-6 py-4 text-sm font-bold text-slate-500" dir="ltr">{ret.invoice_number ?? '—'}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500 max-w-xs truncate">{ret.reason}</td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500">{formatDateTime(ret.created_at)}</td>
                                <td className="px-6 py-4"><StatusPill tone={RETURN_STATUS_TONES[ret.status]}>{SUPPLIER_RETURN_STATUS_LABELS[ret.status]}</StatusPill></td>
                            </tr>
                        ))}
                    </Table>
                )}
            </Card>
        </div>
    );
};
