import React, { useEffect, useState } from 'react';
import { MapPin, Plus, Edit, Trash2, X } from 'lucide-react';
import type { DeliveryZone, Warehouse } from '../types';
import { SUDANESE_STATES } from '../types';
import { deleteDeliveryZone, fetchDeliveryZones, fetchWarehouses, saveDeliveryZone, errorMessage, type DeliveryZoneInput } from '../lib/catalogApi';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const emptyZone: DeliveryZoneInput = { name: '', fee: 0, is_active: true, state: 'الخرطوم', warehouse_id: null };

export const DeliveryZonesPage: React.FC = () => {
    const [zones, setZones] = useState<DeliveryZone[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: DeliveryZoneInput } | null>(null);
    const [saving, setSaving] = useState(false);
    const [stateFilter, setStateFilter] = useState('');

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [z, w] = await Promise.all([fetchDeliveryZones(), fetchWarehouses()]);
            setZones(z);
            setWarehouses(w);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل مناطق التوصيل.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        if (!editing.data.name.trim()) { setError('اسم المنطقة مطلوب.'); return; }
        if (editing.data.fee < 0) { setError('رسوم التوصيل لا يمكن أن تكون سالبة.'); return; }
        setSaving(true);
        setError(null);
        try {
            await saveDeliveryZone(editing.id, { ...editing.data, name: editing.data.name.trim() });
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const remove = async (zone: DeliveryZone) => {
        if (!window.confirm(`حذف المنطقة "${zone.name}"؟ الطلبات السابقة لن تتأثر.`)) return;
        setError(null);
        try {
            await deleteDeliveryZone(zone.id);
            setZones((prev) => prev.filter((z) => z.id !== zone.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const warehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? '—';
    const visible = zones.filter((z) => !stateFilter || z.state === stateFilter);

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="مناطق التوصيل"
                subtitle="اسم المنطقة هو ما يختاره العميل عند الدفع، والرسوم تُحسب منه تلقائياً. منطقة «افتراضي» لكل ولاية هي الرسوم البديلة."
                icon={<MapPin className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyZone })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة منطقة</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل منطقة' : 'منطقة جديدة'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-4 gap-4">
                            <Field label="الولاية" required>
                                <select value={editing.data.state ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, state: e.target.value } })} className={inputClass} required>
                                    {SUDANESE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="اسم المنطقة" required><input value={editing.data.name} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, name: e.target.value } })} className={inputClass} required /></Field>
                            <Field label="رسوم التوصيل (ج.س)" required><input type="number" min={0} step="1" value={editing.data.fee} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, fee: Number(e.target.value) || 0 } })} className={inputClass} required /></Field>
                            <Field label="المخزن المسؤول">
                                <select value={editing.data.warehouse_id ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, warehouse_id: e.target.value || null } })} className={inputClass}>
                                    <option value="">بدون</option>
                                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, is_active: e.target.checked } })} className="w-4 h-4 accent-brand-blue" /> نشطة
                            </label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                                <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                            </div>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex items-center gap-3 bg-slate-50/30">
                    <label className="text-xs font-black text-slate-500">الولاية:</label>
                    <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold">
                        <option value="">الكل</option>
                        {SUDANESE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <Table headers={['الولاية', 'المنطقة', 'الرسوم', 'المخزن', 'الحالة', 'الإجراءات']} empty={visible.length === 0}>
                    {visible.map((zone) => (
                        <tr key={zone.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{zone.state ?? '—'}</td>
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{zone.name}</td>
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{zone.fee.toLocaleString('ar-EG')} ج.س</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{warehouseName(zone.warehouse_id)}</td>
                            <td className="px-6 py-4"><StatusPill active={zone.is_active} /></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setEditing({ id: zone.id, data: { name: zone.name, fee: zone.fee, is_active: zone.is_active, state: zone.state, warehouse_id: zone.warehouse_id } })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    <button type="button" onClick={() => void remove(zone)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
