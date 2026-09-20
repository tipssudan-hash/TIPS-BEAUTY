import React, { useEffect, useMemo, useState } from 'react';
import { Star, MessageSquare, Eye, EyeOff } from 'lucide-react';
import type { AdminReview } from '../types';
import { fetchAdminReviews, moderateReview, errorMessage } from '../lib/catalogApi';
import { Card, Notice, PageHeader, Spinner, Table, smallButtonClass } from '../components/ui';

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
    <span className="inline-flex gap-0.5" aria-label={`${rating} من 5`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
    </span>
);

export const ReviewsPage: React.FC = () => {
    const [reviews, setReviews] = useState<AdminReview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'published' | 'hidden'>('all');
    const [busyId, setBusyId] = useState<string | null>(null);

    useEffect(() => {
        fetchAdminReviews()
            .then(setReviews)
            .catch((err) => setError(errorMessage(err, 'تعذر تحميل التقييمات.')))
            .finally(() => setLoading(false));
    }, []);

    const visible = useMemo(() => reviews.filter((r) => filter === 'all' || r.status === filter), [reviews, filter]);

    const toggle = async (review: AdminReview) => {
        const next = review.status === 'published' ? 'hidden' : 'published';
        setBusyId(review.id);
        setError(null);
        try {
            await moderateReview(review.id, next);
            setReviews((prev) => prev.map((r) => r.id === review.id ? { ...r, status: next } : r));
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusyId(null);
        }
    };

    if (loading) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader title="التقييمات" subtitle="تقييمات العملاء بعد استلام الطلبات. التقييم المخفي لا يظهر في المتجر ولا يُحتسب في المتوسط." icon={<MessageSquare className="w-8 h-8 text-brand-blue" />} />

            {error && <Notice kind="error">{error}</Notice>}

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex gap-2 bg-slate-50/30">
                    {([['all', 'الكل'], ['published', 'المنشورة'], ['hidden', 'المخفية']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setFilter(value)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
                    ))}
                </div>
                <Table headers={['المنتج', 'العميلة', 'التقييم', 'التعليق', 'التاريخ', 'الحالة', 'الإجراء']} empty={visible.length === 0} emptyText="لا توجد تقييمات.">
                    {visible.map((review) => (
                        <tr key={review.id} className={`hover:bg-slate-50/50 ${review.status === 'hidden' ? 'opacity-60' : ''}`}>
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{review.product_name}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">
                                {review.user_name || 'عميلة'}
                                {review.is_verified_purchase && <span className="block text-[10px] text-emerald-600 font-black">شراء موثّق</span>}
                            </td>
                            <td className="px-6 py-4"><Stars rating={review.rating} /></td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-md whitespace-pre-wrap">{review.comment || '—'}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{new Date(review.created_at).toLocaleDateString('ar-EG')}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${review.status === 'published' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>{review.status === 'published' ? 'منشور' : 'مخفي'}</span>
                            </td>
                            <td className="px-6 py-4">
                                <button type="button" disabled={busyId === review.id} onClick={() => void toggle(review)} className={`${smallButtonClass} flex items-center gap-1 ${review.status === 'published' ? 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {review.status === 'published' ? <><EyeOff className="w-3.5 h-3.5" /> إخفاء</> : <><Eye className="w-3.5 h-3.5" /> نشر</>}
                                </button>
                            </td>
                        </tr>
                    ))}
                </Table>
            </Card>
        </div>
    );
};
