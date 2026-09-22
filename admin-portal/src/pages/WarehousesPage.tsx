import React, { useEffect, useState } from 'react';
import { Warehouse as WarehouseIcon, Plus, Edit, X } from 'lucide-react';
import type { Warehouse } from '../types';
import { SUDANESE_STATES } from '../types';
import { fetchWarehouses, saveWarehouse, type WarehouseInput } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { Card, Field, Notice, PageHeader, Spinner, StatusPill, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const emptyWarehouse: WarehouseInput = { name: '', code: '', state: 'الخرطوم', city: '', address: null, phone: null, is_active: true };

export const WarehousesPage: React.FC = () => {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: WarehouseInput } | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setWarehouses(await fetchWarehouses());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المخازن.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const update = (patch: Partial<WarehouseInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        const data = editing.data;
        if (!data.name.trim() || !data.code.trim() || !data.city.trim()) { setError('الاسم والرمز والمحلية مطلوبة.'); return; }
        setSaving(true);
        setError(null);
        try {
            await saveWarehouse(editing.id, {
                ...data,
                name: data.name.trim(),
                code: data.code.trim().toUpperCase(),
                city: data.city.trim(),
                address: data.address?.trim() || null,
                phone: data.phone?.trim() || null,
            });
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المخازن"
                subtitle="عند إضافة مخزن جديد تُنشأ له سجلات مخزون بقيمة صفر لكل المنتجات تلقائياً. اجعلي المحلية مطابقة لأسماء محليات التوصيل ليُفضَّل المخزن الأقرب."
                icon={<WarehouseIcon className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyWarehouse })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة مخزن</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل مخزن' : 'مخزن جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم" required><input value={editing.data.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} required /></Field>
                            <Field label="الرمز" required hint="مثال: KRT"><input value={editing.data.code} onChange={(e) => update({ code: e.target.value })} className={inputClass} dir="ltr" required disabled={Boolean(editing.id)} /></Field>
                            <Field label="الولاية" required>
                                <select value={editing.data.state} onChange={(e) => update({ state: e.target.value })} className={inputClass} required>
                                    {SUDANESE_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="المحلية" required><input value={editing.data.city} onChange={(e) => update({ city: e.target.value })} className={inputClass} required /></Field>
                            <Field label="العنوان"><input value={editing.data.address ?? ''} onChange={(e) => update({ address: e.target.value })} className={inputClass} /></Field>
                            <Field label="الهاتف"><input value={editing.data.phone ?? ''} onChange={(e) => update({ phone: e.target.value })} className={inputClass} dir="ltr" /></Field>
                        </div>
                        <div className="flex items-center justify-between flex-wrap gap-3">
                            <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                                <input type="checkbox" checked={editing.data.is_active} onChange={(e) => update({ is_active: e.target.checked })} className="w-4 h-4 accent-brand-blue" /> نشط
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
                <Table headers={['المخزن', 'الرمز', 'الموقع', 'الهاتف', 'الحالة', 'الإجراءات']} empty={warehouses.length === 0}>
                    {warehouses.map((w) => (
                        <tr key={w.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{w.name}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{w.code}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{w.state} · {w.city}{w.address ? ` · ${w.address}` : ''}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{w.phone ?? '—'}</td>
                            <td className="px-6 py-4"><StatusPill tone={w.is_active ? 'success' : 'neutral'}>{w.is_active ? 'نشط' : 'متوقف'}</StatusPill></td>
                            <td className="px-6 py-4">
                                <button type="button" onClick={() => setEditing({ id: w.id, data: { name: w.name, code: w.code, state: w.state, city: w.city, address: w.address, phone: w.phone, is_active: w.is_active } })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
