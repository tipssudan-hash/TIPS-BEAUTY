import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Percent, Plus, Edit, Trash2, Square } from 'lucide-react';
import type { Product, Promotion } from '../types';
import { PROMOTION_STATUS_LABELS, PROMOTION_TARGET_LABELS, PROMOTION_TYPE_LABELS, deletePromotion, endPromotion, fetchAdminProducts, fetchPromotions } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { formatDateTime, formatNumber, formatSDG } from '../lib/format';
import { PAGE_SIZE } from '../lib/pagination';
import { Card, Notice, PageHeader, Spinner, Table, primaryButtonClass, smallButtonClass } from '../components/ui';
import { Pagination } from '../components/Pagination';

// Promotions are priced by the backend (effective_price / price_cart_lines); this page lists them and
// ends or deletes them. Create and edit happen in PromotionFormPage.

// Same palette as StatusPill (ui.tsx), plus a scheduled state.
const statusClass: Record<Promotion['status'], string> = {
    active: 'bg-emerald-50 text-emerald-600', scheduled: 'bg-blue-50 text-brand-blue', expired: 'bg-slate-100 text-slate-600',
};

export const PromotionsPage: React.FC = () => {
    const navigate = useNavigate();
    const [page, setPage] = useState(0);
    const [promotions, setPromotions] = useState<Promotion[]>([]);
    const [catalogue, setCatalogue] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const [rows, products] = await Promise.all([fetchPromotions(), fetchAdminProducts()]);
            setPromotions(rows);
            setCatalogue(products);
        } catch (err) {
            setError(errorMessage(err, 'تعذر تحميل العروض.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const productName = useMemo(() => new Map(catalogue.map((p) => [p.id, p.name_ar])), [catalogue]);

    const end = async (promotion: Promotion) => {
        if (!window.confirm(`إنهاء العرض "${promotion.title}" الآن؟`)) return;
        try {
            await endPromotion(promotion.id);
            await load();
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const remove = async (promotion: Promotion) => {
        if (!window.confirm(`حذف العرض "${promotion.title}"؟`)) return;
        try {
            await deletePromotion(promotion.id);
            setPromotions((prev) => prev.filter((p) => p.id !== promotion.id));
        } catch (err) {
            setError(errorMessage(err));
        }
    };

    const valueLabel = (p: Promotion) => {
        switch (p.promotion_type) {
            case 'buy_x_get_y':
                return `اشترِ ${formatNumber(p.buy_quantity)} واحصل على ${formatNumber(p.get_quantity)}${p.get_discount_percent === 100 ? ' مجاناً' : ` بخصم ${formatNumber(p.get_discount_percent)}%`}`;
            case 'quantity_tier':
                return p.tiers.map((t) => `${formatNumber(t.min_quantity)}+ ← ${formatNumber(t.percent)}%`).join(' · ');
            case 'bundle':
                return `سعر الحزمة ${formatSDG(p.bundle_price)}`;
            default:
                return p.discount_type === 'percentage' ? `${formatNumber(p.discount_value)}%` : formatSDG(p.discount_value);
        }
    };

    const targetLabel = (p: Promotion) => {
        if (p.target_kind === 'products') return `${formatNumber(p.target_product_ids.length)} منتجات`;
        if (p.target_kind === 'all') return PROMOTION_TARGET_LABELS.all;
        return `${PROMOTION_TARGET_LABELS[p.target_kind]}: ${p.target_value ?? ''}`;
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader
                title="العروض"
                subtitle="عرض مجدول يُطبَّق تلقائياً على كل المنتجات أو تصنيف أو علامة أو منتجات محددة: تخفيض مباشر أو شرائح كمية أو حزمة أو اشترِ واحصل. لا يتراكم مع خصم المنتج: الأكبر هو الذي يُطبَّق. البانرات لا تغيّر الأسعار."
                icon={<Percent className="w-8 h-8 text-brand-blue" />}
                actions={<button type="button" onClick={() => navigate('/promotions/new')} className={primaryButtonClass}><Plus className="w-5 h-5" /> إضافة عرض</button>}
            />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <Table headers={['العرض', 'النوع', 'التخفيض', 'يشمل', 'الفترة', 'الحالة', 'الإجراءات']} empty={promotions.length === 0} emptyText="لا توجد عروض بعد">
                    {promotions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                            <td className="px-6 py-4">
                                <p className="text-sm font-black text-slate-900">{p.title}</p>
                                {p.description && <p className="text-[10px] text-slate-400 font-bold">{p.description}</p>}
                            </td>
                            <td className="px-6 py-4"><span className="inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black bg-blue-50 text-brand-blue whitespace-nowrap">{PROMOTION_TYPE_LABELS[p.promotion_type]}</span></td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-700">{valueLabel(p)}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {targetLabel(p)}
                                {p.target_kind === 'products' && <span className="block text-[10px] text-slate-400 truncate max-w-[16rem]">{p.target_product_ids.map((id) => productName.get(id) ?? '…').join('، ')}</span>}
                            </td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500">
                                {formatDateTime(p.start_date)}
                                <span className="block">{p.end_date ? `حتى ${formatDateTime(p.end_date)}` : 'بلا انتهاء'}</span>
                            </td>
                            <td className="px-6 py-4"><span className={`inline-flex px-2.5 py-1 rounded-lg text-[10px] font-black ${statusClass[p.status]}`}>{PROMOTION_STATUS_LABELS[p.status]}</span></td>
                            <td className="px-6 py-4">
                                <div className="flex gap-2">
                                    <button type="button" onClick={() => navigate(`/promotions/edit/${p.id}`)} className={`${smallButtonClass} bg-blue-50 text-brand-blue flex items-center gap-1`}><Edit className="w-3.5 h-3.5" /> تعديل</button>
                                    {p.status !== 'expired' && <button type="button" onClick={() => void end(p)} className={`${smallButtonClass} bg-amber-50 text-amber-700 flex items-center gap-1`}><Square className="w-3.5 h-3.5" /> إنهاء الآن</button>}
                                    <button type="button" onClick={() => void remove(p)} className={`${smallButtonClass} bg-red-50 text-red-600 flex items-center gap-1`}><Trash2 className="w-3.5 h-3.5" /> حذف</button>
                                </div>
                            </td>
                        </tr>
                    ))}
                </Table>
                <Pagination page={page} pageSize={PAGE_SIZE} total={promotions.length} onPageChange={setPage} />
            </Card>
        </div>
    );
};
