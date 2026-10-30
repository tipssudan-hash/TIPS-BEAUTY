import { formatDate } from '../lib/format';
import React, { useEffect, useState } from 'react';
import { Star, MessageSquare, Eye, EyeOff } from 'lucide-react';
import type { AdminReview } from '../types';
import { bulkSetReviewStatus, fetchAdminReviews, moderateReview } from '../lib/catalogApi';
import { errorMessage } from '../lib/errors';
import { PAGE_SIZE } from '../lib/pagination';
import { Card, Notice, PageHeader, Spinner, Table, smallButtonClass } from '../components/ui';
import { Pagination } from '../components/Pagination';
import { BulkActionBar } from '../components/BulkActionBar';
import { useRowSelection } from '../hooks/useRowSelection';

type ReviewFilter = 'all' | 'published' | 'hidden';

const Stars: React.FC<{ rating: number }> = ({ rating }) => (
    <span className="inline-flex gap-0.5" aria-label={`${rating} من 5`}>
        {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`w-3.5 h-3.5 ${n <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
    </span>
);

export const ReviewsPage: React.FC = () => {
    const [reviews, setReviews] = useState<AdminReview[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState<ReviewFilter>('all');
    const [page, setPage] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [busy, setBusy] = useState(false);
    const selection = useRowSelection();

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        fetchAdminReviews(filter, page, PAGE_SIZE)
            .then((result) => {
                if (cancelled) return;
                setReviews(result.rows);
                setTotal(result.total);
                setError(null);
            })
            .catch((err) => {
                if (!cancelled) setError(errorMessage(err, 'تعذر تحميل التقييمات.'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [filter, page, reloadKey]);

    const changeFilter = (value: ReviewFilter) => {
        selection.clear();
        setPage(0);
        setFilter(value);
    };

    const changePage = (value: number) => {
        selection.clear();
        setPage(value);
    };

    const toggle = async (review: AdminReview) => {
        const next = review.status === 'published' ? 'hidden' : 'published';
        setBusy(true);
        setError(null);
        try {
            await moderateReview(review.id, next);
            setReloadKey((k) => k + 1);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const bulkSet = async (status: 'published' | 'hidden') => {
        setBusy(true);
        setError(null);
        try {
            await bulkSetReviewStatus(selection.selectedIds, status);
            selection.clear();
            setReloadKey((k) => k + 1);
        } catch (err) {
            setError(errorMessage(err));
        } finally {
            setBusy(false);
        }
    };

    const visibleIds = reviews.map((r) => r.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selection.selected.has(id));

    if (loading && reviews.length === 0) return <Spinner />;

    return (
        <div className="space-y-8">
            <PageHeader title="التقييمات" subtitle="تقييمات العملاء بعد استلام الطلبات. التقييم المخفي لا يظهر في المتجر ولا يُحتسب في المتوسط." icon={<MessageSquare className="w-8 h-8 text-brand-blue" />} />

            {error && <Notice kind="error">{error}</Notice>}

            <BulkActionBar count={selection.selectedIds.length} onClear={selection.clear} busy={busy}>
                <button type="button" disabled={busy} onClick={() => void bulkSet('published')} className={`${smallButtonClass} bg-emerald-50 text-emerald-700`}>نشر المحدد</button>
                <button type="button" disabled={busy} onClick={() => void bulkSet('hidden')} className={`${smallButtonClass} bg-slate-100 text-slate-700`}>إخفاء المحدد</button>
            </BulkActionBar>

            <Card className="overflow-hidden">
                <div className="p-5 border-b border-slate-50 flex flex-wrap items-center gap-2 bg-slate-50/30">
                    {([['all', 'الكل'], ['published', 'المنشورة'], ['hidden', 'المخفية']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => changeFilter(value)} className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${filter === value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>{label}</button>
                    ))}
                    <label className="mr-auto flex items-center gap-2 text-xs font-bold text-slate-600">
                        <input type="checkbox" checked={allVisibleSelected} disabled={visibleIds.length === 0} onChange={(e) => selection.toggleAll(visibleIds, e.target.checked)} />
                        تحديد الصفحة
                    </label>
                </div>
                <Table headers={['', 'المنتج', 'العميلة', 'التقييم', 'التعليق', 'التاريخ', 'الحالة', 'الإجراء']} empty={reviews.length === 0 && !loading} emptyText="لا توجد تقييمات.">
                    {reviews.map((review) => (
                        <tr key={review.id} className={`hover:bg-slate-50/50 ${review.status === 'hidden' ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-4">
                                <input type="checkbox" aria-label="تحديد التقييم" checked={selection.selected.has(review.id)} onChange={() => selection.toggle(review.id)} />
                            </td>
                            <td className="px-6 py-4 text-sm font-black text-slate-900">{review.product_name}</td>
                            <td className="px-6 py-4 text-sm font-bold text-slate-600">
                                {review.user_name || 'عميلة'}
                                {review.is_verified_purchase && <span className="block text-[10px] text-emerald-600 font-black">شراء موثّق</span>}
                            </td>
                            <td className="px-6 py-4"><Stars rating={review.rating} /></td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-md whitespace-pre-wrap">{review.comment || '—'}</td>
                            <td className="px-6 py-4 text-xs font-bold text-slate-500" dir="ltr">{formatDate(review.created_at)}</td>
                            <td className="px-6 py-4">
                                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black ${review.status === 'published' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-700'}`}>{review.status === 'published' ? 'منشور' : 'مخفي'}</span>
                            </td>
                            <td className="px-6 py-4">
                                <button type="button" disabled={busy} onClick={() => void toggle(review)} className={`${smallButtonClass} flex items-center gap-1 ${review.status === 'published' ? 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-600' : 'bg-emerald-50 text-emerald-700'}`}>
                                    {review.status === 'published' ? <><EyeOff className="w-3.5 h-3.5" /> إخفاء</> : <><Eye className="w-3.5 h-3.5" /> نشر</>}
                                </button>
                            </td>
                        </tr>
                    ))}
                </Table>
                <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPageChange={changePage} loading={loading} />
            </Card>
        </div>
    );
};
