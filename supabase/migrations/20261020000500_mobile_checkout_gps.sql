-- The mobile checkout wrapper called the ten-argument checkout_order_safe stub, which always raises.
-- It now forwards to the twelve-argument checkout_order_safe and requires the customer's GPS pin.

DROP FUNCTION IF EXISTS public.checkout_order_with_growth(text, text, text, text, text, text, jsonb, text, integer, text, text);
DROP FUNCTION IF EXISTS public.checkout_order_with_growth(text, text, text, text, text, text, jsonb, text, integer, text, text, text);

CREATE OR REPLACE FUNCTION public.checkout_order_with_growth(
  p_customer_name text,
  p_phone text,
  p_shipping_address text,
  p_city text,
  p_state text,
  p_payment_method text,
  p_items jsonb,
  p_coupon_code text DEFAULT NULL,
  p_points_to_redeem integer DEFAULT 0,
  p_referral_code text DEFAULT NULL,
  p_affiliate_code text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_customer_lat numeric DEFAULT NULL,
  p_customer_lng numeric DEFAULT NULL
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_order record;
  v_user uuid := auth.uid();
  v_referrer uuid;
  v_affiliate uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_customer_lat IS NULL OR p_customer_lng IS NULL
     OR p_customer_lat NOT BETWEEN -90 AND 90
     OR p_customer_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Valid customer GPS coordinates are required';
  END IF;

  IF NULLIF(trim(COALESCE(p_referral_code, '')), '') IS NOT NULL THEN
    SELECT id INTO v_referrer FROM public.profiles WHERE referral_code = upper(trim(p_referral_code)) AND id <> v_user;
    IF v_referrer IS NULL THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  END IF;
  IF NULLIF(trim(COALESCE(p_affiliate_code, '')), '') IS NOT NULL THEN
    SELECT id INTO v_affiliate FROM public.affiliate_profiles WHERE code = upper(trim(p_affiliate_code)) AND status = 'active' AND customer_id <> v_user;
    IF v_affiliate IS NULL THEN RAISE EXCEPTION 'Invalid affiliate code'; END IF;
  END IF;

  SELECT * INTO v_order FROM public.checkout_order_safe(
    p_customer_name, p_phone, p_shipping_address, p_city, p_state, p_payment_method,
    p_items, p_customer_lat, p_customer_lng, p_coupon_code, p_points_to_redeem, p_idempotency_key
  );

  UPDATE public.orders
  SET referral_code = COALESCE(referral_code, NULLIF(upper(trim(COALESCE(p_referral_code, ''))), '')),
      referral_referrer_id = COALESCE(referral_referrer_id, v_referrer),
      affiliate_code = COALESCE(affiliate_code, NULLIF(upper(trim(COALESCE(p_affiliate_code, ''))), '')),
      affiliate_id = COALESCE(affiliate_id, v_affiliate)
  WHERE id = v_order.order_id;

  IF v_referrer IS NOT NULL THEN
    UPDATE public.profiles SET referred_by = v_referrer WHERE id = v_user AND referred_by IS NULL;
  END IF;

  RETURN QUERY SELECT v_order.order_id, v_order.order_number, v_order.total,
                      v_order.shipping_fee, v_order.discount_amount, v_order.points_discount;
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_order_with_growth(text, text, text, text, text, text, jsonb, text, integer, text, text, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_with_growth(text, text, text, text, text, text, jsonb, text, integer, text, text, text, numeric, numeric) TO authenticated, service_role;

-- DOWN (manual):
--   Restore checkout_order_with_growth from 20260920000000_baseline.sql (12-argument overload), then:
--   DROP FUNCTION public.checkout_order_with_growth(text, text, text, text, text, text, jsonb, text, integer, text, text, text, numeric, numeric);
