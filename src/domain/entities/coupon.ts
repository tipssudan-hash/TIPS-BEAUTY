export type CouponRefusal = 'unknown' | 'inactive' | 'not_started' | 'expired' | 'used_up' | 'customer_limit' | 'below_minimum' | 'not_best';

export interface CouponPreview {
  ok: boolean;
  reason: CouponRefusal | null;
  code: string | null;
  name: string | null;
  reduction: number;
  baseSubtotal: number;
  lineReductions: number;
}
