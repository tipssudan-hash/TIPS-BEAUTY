export type LoyaltyTier = 'bronze' | 'silver' | 'gold';

export interface LoyaltyProfile {
  beautyPoints: number;
  loyaltyTier: LoyaltyTier;
  lifetimePoints: number;
  referralCode: string;
}
