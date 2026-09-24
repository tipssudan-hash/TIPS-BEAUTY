import React, { useState, useEffect, useCallback } from 'react';
import { Star, User, Calendar, BadgeCheck } from 'lucide-react';
import { Review, ReviewableItem } from '@domain/entities';
import { useAuth } from '../../context/AuthContext';
import { fetchProductReviews, fetchReviewableItems, submitReview } from '@infrastructure/repositories';
import { errorMessage } from '@application/errors';
import { formatDate } from '@application/services/format';

interface ReviewSectionProps {
    productId: string;
}

const MAX_COMMENT = 1000;

export const ReviewSection: React.FC<ReviewSectionProps> = ({ productId }) => {
    const { user } = useAuth();
    const [reviews, setReviews] = useState<Review[]>([]);
    const [loading, setLoading] = useState(true);
    const [eligible, setEligible] = useState<ReviewableItem | null>(null);
    const [rating, setRating] = useState(5);
    const [comment, setComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const loadReviews = useCallback(async () => {
        try {
            setReviews(await fetchProductReviews(productId));
        } catch (err) {
            console.error('Error fetching reviews:', err);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    const loadEligibility = useCallback(async () => {
        if (!user) {
            setEligible(null);
            return;
        }
        try {
            const items = await fetchReviewableItems();
            setEligible(items.find(i => i.productId === productId && !i.alreadyReviewed) ?? null);
        } catch (err) {
            console.error('Error fetching reviewable items:', err);
            setEligible(null);
        }
    }, [user, productId]);

    useEffect(() => { void loadReviews(); }, [loadReviews]);
    useEffect(() => { void loadEligibility(); }, [loadEligibility]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!eligible) return;
        setSubmitting(true);
        setError(null);
        try {
            await submitReview(eligible.orderId, productId, rating, comment.trim());
            setComment('');
            setRating(5);
            setSuccess(true);
            await Promise.all([loadReviews(), loadEligibility()]);
        } catch (err) {
            setError(errorMessage(err, 'فشل إرسال التقييم، حاولي مرة أخرى.'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
                تقييمات العملاء
                <span className="text-sm font-normal text-gray-500">({reviews.length})</span>
            </h2>

            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    {loading ? (
                        <p className="text-gray-500">جاري التحميل...</p>
                    ) : reviews.length === 0 ? (
                        <div className="bg-gray-50 p-6 rounded-xl text-center text-gray-500">
                            لا توجد تقييمات بعد.
                        </div>
                    ) : (
                        reviews.map((review) => (
                            <div key={review.id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                                <div className="flex justify-between items-start mb-2 gap-2">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="w-8 h-8 rounded-full bg-brand-blue-soft flex items-center justify-center text-brand-blue">
                                            <User className="w-4 h-4" />
                                        </div>
                                        <span className="font-bold text-gray-800">{review.reviewerLabel}</span>
                                        {review.verifiedPurchase && (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-green-700 bg-green-50 border border-green-100 rounded-full px-2 py-0.5">
                                                <BadgeCheck className="w-3 h-3" /> عملية شراء موثقة
                                            </span>
                                        )}
                                    </div>
                                    <span className="text-xs text-gray-400 flex items-center gap-1 whitespace-nowrap">
                                        <Calendar className="w-3 h-3" />
                                        {formatDate(review.createdAt)}
                                    </span>
                                </div>
                                <div className="flex text-yellow-400 mb-2" aria-label={`${review.rating} من 5`}>
                                    {[...Array(5)].map((_, i) => (
                                        <Star key={i} className={`w-4 h-4 ${i < review.rating ? 'fill-current' : 'text-gray-200'}`} />
                                    ))}
                                </div>
                                {review.comment && <p className="text-gray-600 text-sm whitespace-pre-wrap">{review.comment}</p>}
                            </div>
                        ))
                    )}
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-sm border border-brand-blue-soft h-fit">
                    <h3 className="font-bold text-lg mb-4">أضيفي تقييمك</h3>
                    {eligible ? (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100">{error}</div>
                            )}
                            <p className="text-xs text-gray-500">الطلب: {eligible.orderNumber}</p>
                            <div>
                                <label className="text-sm font-bold text-gray-700 block mb-1">التقييم</label>
                                <div className="flex gap-2">
                                    {[1, 2, 3, 4, 5].map((star) => (
                                        <button
                                            key={star}
                                            type="button"
                                            aria-label={`${star} نجوم`}
                                            onClick={() => setRating(star)}
                                            className="focus:outline-none transition-transform hover:scale-110"
                                        >
                                            <Star className={`w-8 h-8 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`} />
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <label htmlFor="review-comment" className="text-sm font-bold text-gray-700 block mb-1">تعليقك</label>
                                <textarea
                                    id="review-comment"
                                    value={comment}
                                    maxLength={MAX_COMMENT}
                                    onChange={e => setComment(e.target.value)}
                                    className="w-full bg-gray-50 border border-gray-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-brand-blue"
                                    rows={3}
                                    placeholder="اكتبي تجربتك مع المنتج..."
                                />
                                <p className="text-[10px] text-gray-400 text-left">{comment.length}/{MAX_COMMENT}</p>
                            </div>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="w-full bg-brand-blue hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-100 disabled:opacity-50"
                            >
                                {submitting ? 'جاري الإرسال...' : 'نشر التقييم'}
                            </button>
                        </form>
                    ) : success ? (
                        <div className="bg-green-50 text-green-700 p-4 rounded-xl text-sm border border-green-100">شكراً لتقييمك!</div>
                    ) : (
                        <p className="text-sm text-gray-500">يمكن تقييم المنتج بعد استلام طلب يحتوي عليه</p>
                    )}
                </div>
            </div>
        </div>
    );
};
