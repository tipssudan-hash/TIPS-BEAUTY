// A running Promotion as the public sees it (get_active_promotions): what, how much, on what,
// until when, and up to eight matching Products to show.
export interface Offer {
  id: string;
  title: string;
  description: string | null;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  targetKind: 'all' | 'category' | 'brand' | 'products';
  targetValue: string | null;
  endsAt: string | null;
  productIds: string[];
}
