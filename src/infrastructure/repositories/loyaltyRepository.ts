import { supabase } from '../supabase/client';
import type { LoyaltyProfile, LoyaltyTier } from '../../domain/entities';

// The same profile read the mobile app uses for its points balance and referral code.
export async function fetchLoyaltyProfile(userId: string): Promise<LoyaltyProfile> {
    const { data, error } = await supabase
        .from('profiles')
        .select('beauty_points,loyalty_tier,loyalty_lifetime_points,referral_code')
        .eq('id', userId)
        .maybeSingle();
    if (error) throw error;
    return {
        beautyPoints: Number(data?.beauty_points ?? 0),
        loyaltyTier: (data?.loyalty_tier ?? 'bronze') as LoyaltyTier,
        lifetimePoints: Number(data?.loyalty_lifetime_points ?? 0),
        referralCode: data?.referral_code ?? '',
    };
}

export async function subscribeRestock(productId: string): Promise<void> {
    const { error } = await supabase.rpc('subscribe_restock', { p_product_id: productId });
    if (error) throw error;
}
