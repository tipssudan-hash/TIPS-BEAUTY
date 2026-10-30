import { supabase } from '../supabase/client';
import type { Review, ReviewableItem } from '../../domain/entities';

export const REVIEW_PAGE_SIZE = 10;

export interface ReviewPage {
    reviews: Review[];
    total: number;
}

// A null limit returns the first 50 reviews (the server caps a page at 100); the total comes back with each page.
export async function fetchProductReviews(productId: string, limit: number | null = null, offset = 0): Promise<ReviewPage> {
    const { data, error } = await supabase.rpc('get_public_product_reviews', {
        p_product_id: productId,
        p_limit: limit ?? undefined,
        p_offset: offset,
    });
    if (error) throw error;
    const rows = data ?? [];
    return {
        reviews: rows.map((r) => ({
            id: r.id,
            rating: r.rating,
            comment: r.comment ?? '',
            reviewerLabel: r.reviewer_label ?? '',
            createdAt: r.created_at,
            verifiedPurchase: Boolean(r.verified_purchase),
        })),
        total: Number(rows[0]?.total_count ?? 0),
    };
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
