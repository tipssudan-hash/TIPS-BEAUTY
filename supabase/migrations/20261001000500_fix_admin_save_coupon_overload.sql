-- Fixes a live schema defect found by running the backend test suite for the first time this
-- session (previously blocked by a stale admin test credential, unrelated to this fix):
--
-- 20260930000100_coupons_affiliate_hub.sql added a new admin_save_coupon(..., p_affiliate_id)
-- overload via CREATE OR REPLACE FUNCTION, but a different parameter list makes Postgres treat
-- it as a SEPARATE function rather than replacing the original 13-arg one from
-- 20260920001600_coupons.sql — unlike 20260930000200_affiliate_auto_code.sql, which correctly
-- DROPped its old admin_save_affiliate overload first, this migration never dropped the old
-- admin_save_coupon signature. With both overloads live, PostgREST cannot disambiguate any call
-- that omits p_affiliate_id — which is the common case, since JSON.stringify drops undefined
-- keys and admin-portal's saveCoupon() sends exactly that shape for a coupon with no linked
-- affiliate. Observed live as: "Could not choose the best candidate function between:
-- admin_save_coupon(13 args), admin_save_coupon(14 args)" — breaking every plain coupon save.
DROP FUNCTION IF EXISTS public.admin_save_coupon(
  text, text, text, numeric, uuid, text, numeric, numeric, integer, integer,
  timestamp with time zone, timestamp with time zone, boolean
);

-- DOWN (manual):
--   Recreate the 13-arg overload from 20260920001600_coupons.sql if ever needed (it shouldn't be —
--   the 14-arg version from 20260930000100_coupons_affiliate_hub.sql is a strict superset).
