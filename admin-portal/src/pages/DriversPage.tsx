import React, { useEffect, useState } from 'react';
import { Truck, Plus, Edit, X } from 'lucide-react';
import type { Driver, DriverStatus, Warehouse } from '../types';
import { fetchDrivers, fetchWarehouses, saveDriver, type DriverInput } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { Card, Field, Notice, PageHeader, Spinner, Table, inputClass, primaryButtonClass, secondaryButtonClass, smallButtonClass } from '../components/ui';

const STATUS_LABELS: Record<DriverStatus, string> = { active: 'متاح', busy: 'مشغول', offline: 'غير متاح' };
const STATUS_STYLES: Record<DriverStatus, string> = { active: 'bg-emerald-50 text-emerald-600', busy: 'bg-amber-50 text-amber-600', offline: 'bg-slate-100 text-slate-700' };

const emptyDriver: DriverInput = { name: '', phone: '', company: null, status: 'active', warehouse_id: null, vehicle: null };

export const DriversPage: React.FC = () => {
    const [drivers, setDrivers] = useState<Driver[]>([]);
    const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editing, setEditing] = useState<{ id: string | null; data: DriverInput } | null>(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [d, w] = await Promise.all([fetchDrivers(), fetchWarehouses()]);
            setDrivers(d);
            setWarehouses(w);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل المندوبين.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const update = (patch: Partial<DriverInput>) => editing && setEditing({ ...editing, data: { ...editing.data, ...patch } });

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editing) return;
        if (editing.data.name.trim().length < 2 || editing.data.phone.trim().length < 5) { setError('الاسم ورقم الهاتف مطلوبان.'); return; }
        setSaving(true);
        setError(null);
        try {
            await saveDriver(editing.id, {
                ...editing.data,
                name: editing.data.name.trim(),
                phone: editing.data.phone.trim(),
                company: editing.data.company?.trim() || null,
                vehicle: editing.data.vehicle?.trim() || null,
            });
            setEditing(null);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setSaving(false);
        }
    };

    const setStatus = async (driver: Driver, status: DriverStatus) => {
        setError(null);
        try {
            await saveDriver(driver.id, { name: driver.name, phone: driver.phone, company: driver.company, status, warehouse_id: driver.warehouse_id, vehicle: driver.vehicle });
            setDrivers((prev) => prev.map((d) => d.id === driver.id ? { ...d, status } : d));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const warehouseName = (id: string | null) => warehouses.find((w) => w.id === id)?.name ?? '—';

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="المندوبون"
                subtitle="لا يمكن شحن طلب إلا بتعيين مندوب حالته «متاح» أو «مشغول»."
                icon={<Truck className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => setEditing({ id: null, data: emptyDriver })} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة مندوب</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            {editing && (
                <Card className="p-6">
                    <form onSubmit={submit} className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="font-black text-slate-900">{editing.id ? 'تعديل مندوب' : 'مندوب جديد'}</h3>
                            <button type="button" onClick={() => setEditing(null)} className="p-2 text-slate-400 hover:text-slate-600" aria-label="إغلاق"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="grid md:grid-cols-3 gap-4">
                            <Field label="الاسم" required><input value={editing.data.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} required /></Field>
                            <Field label="الهاتف" required><input value={editing.data.phone} onChange={(e) => update({ phone: e.target.value })} className={inputClass} dir="ltr" required /></Field>
                            <Field label="الحالة" required>
                                <select value={editing.data.status} onChange={(e) => update({ status: e.target.value as DriverStatus })} className={inputClass} required>
                                    {(Object.keys(STATUS_LABELS) as DriverStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                            </Field>
                            <Field label="المخزن">
                                <select value={editing.data.warehouse_id ?? ''} onChange={(e) => update({ warehouse_id: e.target.value || null })} className={inputClass}>
                                    <option value="">أي مخزن</option>
                                    {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                            </Field>
                            <Field label="المركبة"><input value={editing.data.vehicle ?? ''} onChange={(e) => update({ vehicle: e.target.value })} className={inputClass} /></Field>
                            <Field label="الشركة (إن وجدت)"><input value={editing.data.company ?? ''} onChange={(e) => update({ company: e.target.value })} className={inputClass} /></Field>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={() => setEditing(null)} className={secondaryButtonClass}>إلغاء</button>
                            <button type="submit" disabled={saving} className={primaryButtonClass}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button>
                        </div>
                    </form>
                </Card>
            )}

            <Card className="overflow-hidden">
                <Table headers={['المندوب', 'الهاتف', 'المخزن', 'المركبة', 'الحالة', 'الإجراءات']} empty={drivers.length === 0} emptyText="لا يوجد مندوبون بعد — أضيفي مندوباً واحداً على الأقل قبل شحن الطلبات.">
                    {drivers.map((driver) => (
                        <tr key={driver.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900">{driver.name}</p>
                                {driver.company && <p className="text-[10px] text-slate-400 font-bold">{driver.company}</p>}
                            </td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600" dir="ltr">{driver.phone}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{warehouseName(driver.warehouse_id)}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{driver.vehicle ?? '—'}</td>
                            <td className="px-6 py-4">
                                <select value={driver.status} onChange={(e) => void setStatus(driver, e.target.value as DriverStatus)} className={`rounded-full px-3 py-1 text-[11px] font-black border-0 ${STATUS_STYLES[driver.status]}`} aria-label="حالة المندوب">
                                    {(Object.keys(STATUS_LABELS) as DriverStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
                                </select>
                            </td>
                            <td className="px-6 py-4">
                                <button type="button" onClick={() => setEditing({ id: driver.id, data: { name: driver.name, phone: driver.phone, company: driver.company, status: driver.status, warehouse_id: driver.warehouse_id, vehicle: driver.vehicle } })} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
