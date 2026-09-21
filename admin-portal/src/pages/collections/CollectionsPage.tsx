import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layers, Plus, Edit, Trash2 } from 'lucide-react';
import type { Collection } from '../../types';
import { COLLECTION_RULE_LABELS, deleteCollection, fetchCollections } from '../../lib/catalogApi';
import { errorMessage } from '../../lib/errors';
import { Card, Notice, PageHeader, Spinner, StatusPill, Table, primaryButtonClass, smallButtonClass } from '../../components/ui';

export const CollectionsPage: React.FC = () => {
    const [collections, setCollections] = useState<Collection[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            setCollections(await fetchCollections());
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل التشكيلات.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const remove = async (collection: Collection) => {
        if (!window.confirm(`حذف تشكيلة "${collection.name_ar}"؟`)) return;
        try {
            await deleteCollection(collection.id);
            setCollections((prev) => prev.filter((c) => c.id !== collection.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="التشكيلات"
                subtitle="تشكيلات مختارة تظهر في الصفحة الرئيسية للمتجر، مستقلة عن التصنيف."
                icon={<Layers className="w-8 h-8 text-brand-blue" />}
                actions={<Link to="/collections/new" className={`${primaryButtonClass} inline-flex`}><Plus className="w-5 h-5" /> إضافة تشكيلة</Link>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <Table headers={['التشكيلة', 'المعرّف', 'القاعدة', 'الترتيب', 'الحالة', 'الإجراءات']} empty={collections.length === 0} emptyText="لا توجد تشكيلات بعد">
                    {collections.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900">{c.name_ar}</p>
                                {c.description_ar && <p className="text-[10px] text-slate-400 font-bold">{c.description_ar}</p>}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{c.slug}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-600">{COLLECTION_RULE_LABELS[c.rule_type]}{c.rule_type === 'manual' ? ` (${c.product_ids.length})` : ''}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">{c.display_order}</td>
                            <td className="px-6 py-4"><StatusPill active={c.is_active} activeText="ظاهرة" inactiveText="متوقفة" /></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <Link to={`/collections/edit/${c.id}`} className={`${smallButtonClass} bg-blue-50 text-brand-blue inline-flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</Link>
                                    <button type="button" onClick={() => void remove(c)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
