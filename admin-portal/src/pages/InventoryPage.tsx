import React, { useEffect, useMemo, useState } from 'react';
import { Boxes, ArrowLeftRight, Diff, X } from 'lucide-react';
import type { InventoryRow, Warehouse } from '../types';
import { adjustInventory, fetchInventory, fetchWarehouses, transferInventory } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { Card, Field, Notice, PageHeader, Spinner, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

type Dialog =
    | { kind: 'adjust'; row: InventoryRow; delta: string; reorder: string; note: string }
    | { kind: 'transfer'; row: InventoryRow; toId: string; quantity: string; note: string };

export const InventoryPage: React.FC = () => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [rows, setRows] = useState<InventoryRow[]>([]);
    const [warehouseId, setWarehouseId] = useState('');
    const [search, setSearch] = useState('');
    const [lowOnly, setLowOnly] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [dialog, setDialog] = useState<Dialog | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchWarehouses().then((w) => {
            setWarehouses(w);
            if (w.length && !warehouseId) setWarehouseId(w[0].id);
        }).catch((err) => setError(errorMessage(err, 'تعذر تحميل المخازن.')));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const load = async (id: string) => {
        setLoading(true);
        setError(null);
        try {
            setRows(await fetchInventory(id));
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المخزون.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { if (warehouseId) void load(warehouseId); }, [warehouseId]);

    const visible = useMemo(() => rows.filter((r) => (!lowOnly || r.quantity <= r.reorder_level) && (!search.trim() || r.product_name.includes(search.trim()))), [rows, lowOnly, search]);
    const lowCount = rows.filter((r) => r.quantity <= r.reorder_level).length;
    const warehouseName = (id: string) => warehouses.find((w) => w.id === id)?.name ?? '';

    const submitDialog = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!dialog) return;
        setSaving(true);
        setError(null);
        setSuccess(null);
        try {
            if (dialog.kind === 'adjust') {
                const delta = parseInt(dialog.delta, 10);
                if (!Number.isFinite(delta) || delta === 0) { setError('أدخلي تغييراً في الكمية مختلفاً عن صفر (موجب للإضافة، سالب للخصم).'); return; }
                const reorder = dialog.reorder.trim() === '' ? undefined : Math.max(0, parseInt(dialog.reorder, 10) || 0);
                await adjustInventory(dialog.row.warehouse_id, dialog.row.product_id, delta, dialog.note, reorder);
                setSuccess(`تم تعديل مخزون «${dialog.row.product_name}».`);
            } else {
                const quantity = parseInt(dialog.quantity, 10);
                if (!dialog.toId) { setError('اختاري مخزن الوجهة.'); return; }
                if (!Number.isFinite(quantity) || quantity < 1) { setError('كمية التحويل يجب أن تكون أكبر من صفر.'); return; }
                await transferInventory(dialog.row.warehouse_id, dialog.toId, dialog.row.product_id, quantity, dialog.note);
                setSuccess(`تم تحويل ${quantity} من «${dialog.row.product_name}» إلى ${warehouseName(dialog.toId)}.`);
            }
            setDialog(null);
            await load(warehouseId);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-8">
            <PageHeader
                title="المخزون"
                subtitle="الكمية لكل منتج في كل مخزن. مخزون المنتج الظاهر للعملاء هو مجموع المخازن."
                icon={<Boxes className="w-8 h-8 text-brand-blue" />}
            />

            {error && <Notice kind="error">{error}</Notice>}
            {success && <Notice kind="success">{success}</Notice>}

            {dialog && (
                <Card className="p-6">
                    <form onSubmit={submitDialog} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{dialog.kind === 'adjust' ? 'تعديل الكمية' : 'تحويل بين المخازن'} — {dialog.row.product_name}</h3>
                            <button type="button" onClick={() => setDialog(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <p className="text-sm font-bold text-slate-500">الكمية الحالية في {warehouseName(dialog.row.warehouse_id)}: <span className="text-slate-900">{dialog.row.quantity}</span></p>
                        {dialog.kind === 'adjust' ? (
                            <div className="grid md:grid-cols-3 gap-4">
                                <Field label="التغيير في الكمية" required hint="موجب للإضافة، سالب للخصم">
                                    <input type="number" step="1" value={dialog.delta} onChange={(e) => setDialog({ ...dialog, delta: e.target.value })} className={inputClass} required dir="ltr" />
                                </Field>
                                <Field label="حد إعادة الطلب" hint="اتركيه فارغاً للإبقاء على الحالي">
                                    <input type="number" min={0} step="1" value={dialog.reorder} onChange={(e) => setDialog({ ...dialog, reorder: e.target.value })} className={inputClass} dir="ltr" />
                                </Field>
                                <Field label="ملاحظة"><input value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} className={inputClass} /></Field>
                            </div>
                        ) : (
                            <div className="grid md:grid-cols-3 gap-4">
                                <Field label="إلى مخزن" required>
                                    <select value={dialog.toId} onChange={(e) => setDialog({ ...dialog, toId: e.target.value })} className={inputClass} required>
                                        <option value="">اختاري...</option>
                                        {warehouses.filter((w) => w.id !== dialog.row.warehouse_id && w.is_active).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </Field>
                                <Field label="الكمية" required>
                                    <input type="number" min={1} max={dialog.row.quantity} step="1" value={dialog.quantity} onChange={(e) => setDialog({ ...dialog, quantity: e.target.value })} className={inputClass} required dir="ltr" />
                                </Field>
                                <Field label="ملاحظة"><input value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} className={inputClass} /></Field>
                            </div>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setDialog(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'جاري التنفيذ...' : 'تأكيد'}</button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex flex-col md:flex-row md:items-center gap-4 bg-slate-50/30">
                    <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold" aria-label="المخزن">
                        {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}{w.is_active ? '' : ' (متوقف)'}</option>)}
                    </select>
                    <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم المنتج..." className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium" />
                    <label className="flex items-center gap-2 text-sm font-bold text-slate-600 cursor-pointer whitespace-nowrap">
                        <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} className="w-4 h-4 accent-brand-blue" /> المنخفض فقط ({lowCount})
                    </label>
                </div>
                {loading ? <Spinner /> : (
                    <Table headers={['المنتج', 'الكمية', 'حد إعادة الطلب', 'الإجراءات']} empty={visible.length === 0} emptyText="لا توجد سجلات مخزون لهذا المخزن.">
                        {visible.map((row) => {
                            const low = row.quantity <= row.reorder_level;
                            return (
                                <tr key={`${row.warehouse_id}-${row.product_id}`} className={`hover:bg-slate-50/50 ${low ? 'bg-amber-50/40' : ''}`}>
                                    <td className="px-6 py-4 text-sm font-black text-slate-900">{row.product_name}</td>
                                    <td className="px-6 py-4">
                                        <span className={`text-sm font-black ${row.quantity === 0 ? 'text-red-600' : low ? 'text-amber-700' : 'text-slate-900'}`}>{row.quantity}</span>
                                        {low && <span className="mr-2 text-[10px] font-black text-amber-700">منخفض</span>}
                                    </td>
                                    <td className="px-6 py-4 text-sm font-bold text-slate-600">{row.reorder_level}</td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => setDialog({ kind: 'adjust', row, delta: '', reorder: '', note: '' })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Diff className="w-3.5 h-3.5" /> تعديل</button>
                                            <button type="button" disabled={row.quantity === 0 || warehouses.length < 2} onClick={() => setDialog({ kind: 'transfer', row, toId: '', quantity: '', note: '' })} className={`${smallButtonClass} bg-slate-100 text-slate-700 flex items-center gap-1`}><ArrowLeftRight className="w-3.5 h-3.5" /> تحويل</button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </Table>
                )}
            </Card>
        </div>
    );
};
