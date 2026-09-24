import { supabase } from '../supabase/client';
import type { Review, ReviewableItem } from '../../domain/entities';

export async function fetchProductReviews(productId: string): Promise<Review[]> {
    const { data, error } = await supabase.rpc('get_public_product_reviews', { p_product_id: productId });
    if (error) throw error;
    return (data ?? []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment ?? '',
        reviewerLabel: r.reviewer_label ?? '',
        createdAt: r.created_at,
        verifiedPurchase: Boolean(r.verified_purchase),
    }));
}

export async function fetchReviewableItems(): Promise<ReviewableItem[]> {
    const { data, error } = await supabase.rpc('get_reviewable_order_items');
    if (error) throw error;
    return (data ?? []).map((r) => ({
        orderId: r.order_id,
        orderNumber: r.order_number,
        productId: r.product_id,
        productName: r.product_name_ar,
        alreadyReviewed: Boolean(r.has_review),
    }));
}

export async function submitReview(orderId: string, productId: string, rating: number, comment: string): Promise<void> {
    const { error } = await supabase.rpc('submit_purchased_product_review', {
        p_order_id: orderId,
        p_product_id: productId,
        p_rating: rating,
        p_comment: comment || undefined,
    });
    if (error) throw error;
}
