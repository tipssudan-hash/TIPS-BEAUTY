-- 0601 Coupons & Marketers (Affiliate) Hub
-- Integrates Coupons with Marketers/Publishers, tracks marketer sales & commissions,
-- calculates revenue and income/profit percentages, and provides payout management.

-- 1. Ensure affiliate_profiles supports direct admin creation (independent marketer / publisher)
ALTER TABLE public.affiliate_profiles
  ALTER COLUMN customer_id DROP NOT NULL;

ALTER TABLE public.affiliate_profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS email text;

-- 2. Link coupons to affiliate profiles
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS affiliate_id uuid REFERENCES public.affiliate_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_coupons_affiliate_id ON public.coupons(affiliate_id);

-- 3. Marketer Payouts Table
CREATE TABLE IF NOT EXISTS public.affiliate_payouts (
  id uuid PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  affiliate_id uuid NOT NULL REFERENCES public.affiliate_profiles(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  payout_method text NOT NULL,
  reference_number text,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_affiliate_payouts_affiliate ON public.affiliate_payouts(affiliate_id, created_at DESC);

ALTER TABLE public.affiliate_payouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin manage affiliate payouts" ON public.affiliate_payouts
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Service role full affiliate payouts" ON public.affiliate_payouts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT ALL ON TABLE public.affiliate_payouts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.affiliate_payouts TO authenticated;

-- 4. Admin save coupon with optional affiliate_id
CREATE OR REPLACE FUNCTION public.admin_save_coupon(
  p_code text, p_name text, p_discount_type text, p_discount_value numeric,
  p_id uuid DEFAULT NULL, p_description text DEFAULT NULL, p_max_discount_amount numeric DEFAULT NULL,
  p_min_order_amount numeric DEFAULT 0, p_usage_limit integer DEFAULT NULL, p_per_user_limit integer DEFAULT 1,
  p_starts_at timestamp with time zone DEFAULT NULL, p_ends_at timestamp with time zone DEFAULT NULL, p_is_active boolean DEFAULT true,
  p_affiliate_id uuid DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_code text := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF v_code !~ '^[A-Z0-9-]{3,30}$' THEN RAISE EXCEPTION 'Coupon code is invalid'; END IF;
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN RAISE EXCEPTION 'Coupon name is required'; END IF;
  IF p_discount_type NOT IN ('percentage', 'fixed') THEN RAISE EXCEPTION 'Coupon type is invalid'; END IF;
  IF COALESCE(p_discount_value, 0) <= 0 OR (p_discount_type = 'percentage' AND p_discount_value > 100) THEN RAISE EXCEPTION 'Coupon value is invalid'; END IF;
  IF p_ends_at IS NOT NULL AND p_starts_at IS NOT NULL AND p_ends_at <= p_starts_at THEN RAISE EXCEPTION 'Coupon window is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.coupons c WHERE c.code = v_code AND (p_id IS NULL OR c.id <> p_id)) THEN RAISE EXCEPTION 'Coupon code already exists'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.coupons (
      code, name, description, discount_type, discount_value, max_discount_amount,
      min_order_amount, usage_limit, per_user_limit, starts_at, ends_at, is_active, affiliate_id
    ) VALUES (
      v_code, trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_discount_type, p_discount_value, p_max_discount_amount,
      COALESCE(p_min_order_amount, 0), p_usage_limit, COALESCE(p_per_user_limit, 1), COALESCE(p_starts_at, timezone('utc', now())), p_ends_at, COALESCE(p_is_active, true), p_affiliate_id
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.coupons SET
      code = v_code, name = trim(p_name), description = NULLIF(trim(COALESCE(p_description, '')), ''), discount_type = p_discount_type,
      discount_value = p_discount_value, max_discount_amount = p_max_discount_amount, min_order_amount = COALESCE(p_min_order_amount, 0),
      usage_limit = p_usage_limit, per_user_limit = COALESCE(p_per_user_limit, 1), starts_at = COALESCE(p_starts_at, starts_at), ends_at = p_ends_at,
      is_active = COALESCE(p_is_active, true), affiliate_id = p_affiliate_id
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Coupon not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_coupon(text, text, text, numeric, uuid, text, numeric, numeric, integer, integer, timestamp with time zone, timestamp with time zone, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_coupon(text, text, text, numeric, uuid, text, numeric, numeric, integer, integer, timestamp with time zone, timestamp with time zone, boolean, uuid) TO authenticated, service_role;

-- 5. Enhanced checkout_order: connects coupon to affiliate and passes affiliate_id into orders
CREATE OR REPLACE FUNCTION public.checkout_order(
  p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text,
  p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_discount numeric;
  v_stock integer;
  v_name text;
  v_active boolean;
  v_subtotal numeric := 0;
  v_base_subtotal numeric := 0;
  v_line_reductions numeric := 0;
  v_shipping numeric := 1500;
  v_order_id uuid;
  v_order_number text;
  v_warehouse_id uuid;
  v_has_warehouse_inventory boolean;
  v_coupon record;
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_discount numeric := 0;
  v_affiliate_id uuid := NULL;
  v_points integer := 0;
  v_points_discount numeric := 0;
  v_point_value numeric;
  v_minimum_points integer;
  v_items_snapshot jsonb := '[]'::jsonb;
  v_line_price numeric;
  v_category text;
  v_brand text;
  v_rule_kind text;
  v_rule_label text;
  v_promotion_id uuid;
  v_line_reduction numeric;
  v_variants jsonb;
  v_variant_id text;
  v_variant_name text;
  v_variant_price numeric;
  v_needed integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN RAISE EXCEPTION 'Phone is required'; END IF;
  IF p_shipping_address IS NULL OR length(trim(p_shipping_address)) < 5 THEN RAISE EXCEPTION 'Shipping address is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = p_payment_method AND is_active) THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
  IF p_points_to_redeem < 0 THEN RAISE EXCEPTION 'Points cannot be negative'; END IF;

  SELECT dz.fee INTO v_shipping FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1;
  v_shipping := COALESCE(v_shipping, 1500);
  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  IF v_has_warehouse_inventory THEN
    SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.is_active AND NOT EXISTS (
      SELECT 1 FROM (
        SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS quantity
        FROM jsonb_array_elements(p_items) ci GROUP BY 1
      ) need
      WHERE NOT EXISTS (
        SELECT 1 FROM public.warehouse_inventory wi
        WHERE wi.warehouse_id = w.id AND wi.product_id = need.product_id AND wi.quantity >= need.quantity
      )
    )
    ORDER BY CASE WHEN lower(w.city) = lower(coalesce(p_city, '')) THEN 0 ELSE 1 END,
             CASE WHEN lower(w.state) = lower(coalesce(p_state, '')) THEN 0 ELSE 1 END,
             w.created_at LIMIT 1;
    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock, p.name_ar, p.is_active, p.category, p.brand, p.variants
    INTO v_unit_price, v_discount, v_stock, v_name, v_active, v_category, v_brand, v_variants
    FROM public.products p WHERE p.id = v_product_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_active THEN RAISE EXCEPTION 'Product % is no longer available', v_product_id; END IF;

    SELECT vl.variant_id, vl.variant_name, vl.variant_price, vl.unit_price
    INTO v_variant_id, v_variant_name, v_variant_price, v_unit_price
    FROM public.variant_line(v_product_id, v_variants, v_item->>'variant_id', v_unit_price) vl;

    SELECT SUM((ci->>'quantity')::integer) INTO v_needed FROM jsonb_array_elements(p_items) ci WHERE (ci->>'id')::uuid = v_product_id;
    IF NOT v_has_warehouse_inventory AND COALESCE(v_stock, 0) < v_needed THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;

    SELECT ep.effective_price, ep.reduction, ep.rule_kind, ep.rule_label, ep.promotion_id
    INTO v_line_price, v_line_reduction, v_rule_kind, v_rule_label, v_promotion_id
    FROM public.effective_price(v_product_id, v_unit_price, v_discount, v_category, v_brand) ep;

    v_base_subtotal := v_base_subtotal + v_unit_price * v_quantity;
    v_line_reductions := v_line_reductions + v_line_reduction * v_quantity;
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'id', v_product_id, 'variant_id', v_variant_id, 'variant_name', v_variant_name, 'variant_price', v_variant_price,
      'quantity', v_quantity, 'name_ar', v_name, 'unit_price', round(v_unit_price, 2), 'discount_percentage', v_discount,
      'effective_unit_price', v_line_price, 'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label,
      'promotion_id', v_promotion_id, 'line_total', round(v_line_price * v_quantity, 2)
    );
  END LOOP;

  v_base_subtotal := round(v_base_subtotal, 2);
  v_line_reductions := round(v_line_reductions, 2);
  v_subtotal := v_base_subtotal - v_line_reductions;

  IF NULLIF(trim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.evaluate_coupon(p_coupon_code, v_user_id, v_base_subtotal, v_line_reductions, true);
    IF v_coupon.reason IS NOT NULL THEN RAISE EXCEPTION 'Coupon refused: %', v_coupon.reason; END IF;
    v_coupon_id := v_coupon.coupon_id;
    v_coupon_code := v_coupon.code;
    v_coupon_discount := v_coupon.reduction;

    -- Look up associated affiliate/marketer if assigned to coupon
    SELECT c.affiliate_id INTO v_affiliate_id FROM public.coupons c WHERE c.id = v_coupon_id;

    v_subtotal := v_base_subtotal;
    SELECT jsonb_agg(
      l || jsonb_build_object('effective_unit_price', (l->>'unit_price')::numeric, 'pricing_rule_kind', NULL, 'pricing_rule_label', NULL, 'promotion_id', NULL,
                              'line_total', round((l->>'unit_price')::numeric * (l->>'quantity')::integer, 2))
      ORDER BY ord)
    INTO v_items_snapshot FROM jsonb_array_elements(v_items_snapshot) WITH ORDINALITY AS t(l, ord);
  END IF;

  SELECT beauty_points INTO v_points FROM public.profiles WHERE id = v_user_id FOR UPDATE;
  SELECT currency_per_point, minimum_redemption_points INTO v_point_value, v_minimum_points FROM public.loyalty_settings WHERE id = true;
  IF p_points_to_redeem > 0 THEN
    IF p_points_to_redeem < v_minimum_points THEN RAISE EXCEPTION 'Minimum points for redemption was not reached'; END IF;
    IF p_points_to_redeem > COALESCE(v_points, 0) THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF;
    v_points_discount := LEAST(p_points_to_redeem * v_point_value, GREATEST(v_subtotal - v_coupon_discount, 0));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_has_warehouse_inventory THEN
      UPDATE public.warehouse_inventory SET quantity = quantity - v_quantity, updated_at = timezone('utc', now())
      WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF;
    ELSE
      UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id;
    END IF;
  END LOOP;

  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.orders (
    customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method,
    payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id,
    coupon_code, discount_amount, points_redeemed, points_discount, affiliate_id, affiliate_code
  ) VALUES (
    v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot,
    round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2),
    v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state,
    v_order_number, v_warehouse_id, v_coupon_code, round(v_coupon_discount, 2), p_points_to_redeem,
    round(v_points_discount, 2), v_affiliate_id, v_coupon_code
  ) RETURNING id INTO v_order_id;

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon_id;
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount)
    VALUES (v_coupon_id, v_order_id, v_user_id, v_coupon_discount);
  END IF;

  IF p_points_to_redeem > 0 THEN
    UPDATE public.profiles SET beauty_points = beauty_points - p_points_to_redeem WHERE id = v_user_id;
    INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by)
    VALUES (v_user_id, v_order_id, -p_points_to_redeem, 'redeem', 'استبدال نقاط عند إنشاء الطلب', v_user_id);
  END IF;

  IF v_has_warehouse_inventory THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
      VALUES (v_warehouse_id, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id);
    END LOOP;
  END IF;

  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);

  RETURN QUERY SELECT v_order_id, v_order_number, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, round(v_coupon_discount, 2), round(v_points_discount, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer) TO service_role;

-- 6. Updated award_growth_rewards to guarantee commissions are calculated on order delivery
CREATE OR REPLACE FUNCTION public.award_growth_rewards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_reward_id uuid;
  v_affiliate public.affiliate_profiles%ROWTYPE;
  v_commission numeric;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'delivered') THEN
    -- Referral Bonus
    IF NEW.referral_referrer_id IS NOT NULL THEN
      INSERT INTO public.referral_rewards(referrer_id, referred_customer_id, order_id, points_awarded, status)
      VALUES(NEW.referral_referrer_id, NEW.customer_id, NEW.id, 100, 'available')
      ON CONFLICT(referred_customer_id) DO NOTHING RETURNING id INTO v_reward_id;
      IF v_reward_id IS NOT NULL THEN
        UPDATE public.profiles SET beauty_points = COALESCE(beauty_points, 0) + 100 WHERE id = NEW.referral_referrer_id;
        INSERT INTO public.loyalty_ledger(customer_id, order_id, points_delta, event_type, note)
        VALUES(NEW.referral_referrer_id, NEW.id, 100, 'referral_bonus', 'مكافأة إحالة عميلة جديدة');
        PERFORM public.create_customer_notification(NEW.referral_referrer_id, 'referral_reward', 'مكافأة إحالة جديدة', 'حصلتِ على 100 نقطة جمال بعد اكتمال أول طلب من عميلتك المُحالة.', NEW.id, NULL, jsonb_build_object('url', '/referrals'));
      END IF;
    END IF;

    -- Affiliate / Marketer Commission
    IF NEW.affiliate_id IS NOT NULL THEN
      SELECT * INTO v_affiliate FROM public.affiliate_profiles WHERE id = NEW.affiliate_id AND status = 'active';
      IF FOUND THEN
        v_commission := round(GREATEST(NEW.total - COALESCE(NEW.shipping_fee, 0), 0) * v_affiliate.commission_rate / 100, 2);
        IF v_commission > 0 THEN
          INSERT INTO public.affiliate_commissions(affiliate_id, customer_id, order_id, commission_rate, commission_amount, status)
          VALUES(v_affiliate.id, NEW.customer_id, NEW.id, v_affiliate.commission_rate, v_commission, 'approved')
          ON CONFLICT(order_id) DO UPDATE SET
            commission_amount = EXCLUDED.commission_amount,
            commission_rate = EXCLUDED.commission_rate,
            status = 'approved';
          IF v_affiliate.customer_id IS NOT NULL THEN
            PERFORM public.create_customer_notification(v_affiliate.customer_id, 'affiliate_commission', 'عمولة مسوق جديدة', 'تم تسجيل عمولة بقيمة ' || to_char(v_commission, 'FM999G999G990D00') || ' ج.س بعد اكتمال تسليم الطلب.', NEW.id, NULL, jsonb_build_object('url', '/affiliate'));
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7. Admin Marketer/Affiliate Management RPCs

-- 7.1 List all marketers with full sales, commissions, discounts, and payout balances
CREATE OR REPLACE FUNCTION public.admin_get_affiliates()
RETURNS TABLE (
  id uuid,
  display_name text,
  code text,
  phone text,
  email text,
  status text,
  commission_rate numeric,
  minimum_payout numeric,
  payout_method text,
  payout_details text,
  admin_note text,
  total_orders bigint,
  total_sales numeric,
  total_discount_given numeric,
  total_commission_earned numeric,
  total_payouts_paid numeric,
  pending_balance numeric,
  coupons_count bigint,
  created_at timestamp with time zone
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  RETURN QUERY
  SELECT
    ap.id,
    ap.display_name,
    ap.code,
    ap.phone,
    ap.email,
    ap.status,
    ap.commission_rate,
    ap.minimum_payout,
    ap.payout_method,
    ap.payout_details,
    ap.admin_note,
    COALESCE(ord.total_orders, 0)::bigint AS total_orders,
    COALESCE(ord.total_sales, 0)::numeric AS total_sales,
    COALESCE(ord.total_discount, 0)::numeric AS total_discount_given,
    COALESCE(comm.total_commission, 0)::numeric AS total_commission_earned,
    COALESCE(pay.total_paid, 0)::numeric AS total_payouts_paid,
    GREATEST(COALESCE(comm.total_commission, 0) - COALESCE(pay.total_paid, 0), 0)::numeric AS pending_balance,
    COALESCE(coup.coupons_count, 0)::bigint AS coupons_count,
    ap.created_at
  FROM public.affiliate_profiles ap
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS total_orders,
      sum(GREATEST(o.total - COALESCE(o.shipping_fee, 0), 0)) AS total_sales,
      sum(COALESCE(o.discount_amount, 0)) AS total_discount
    FROM public.orders o
    WHERE o.affiliate_id = ap.id AND o.status = 'delivered'
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(ac.commission_amount) AS total_commission
    FROM public.affiliate_commissions ac
    WHERE ac.affiliate_id = ap.id AND ac.status IN ('approved', 'paid')
  ) comm ON true
  LEFT JOIN LATERAL (
    SELECT
      sum(p.amount) AS total_paid
    FROM public.affiliate_payouts p
    WHERE p.affiliate_id = ap.id
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS coupons_count
    FROM public.coupons c
    WHERE c.affiliate_id = ap.id
  ) coup ON true
  ORDER BY ap.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_affiliates() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliates() TO authenticated, service_role;

-- 7.2 Save or Create Marketer / Publisher Profile
CREATE OR REPLACE FUNCTION public.admin_save_affiliate(
  p_id uuid DEFAULT NULL,
  p_display_name text DEFAULT '',
  p_code text DEFAULT '',
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_commission_rate numeric DEFAULT 5,
  p_minimum_payout numeric DEFAULT 0,
  p_payout_method text DEFAULT NULL,
  p_payout_details text DEFAULT NULL,
  p_admin_note text DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_code text := upper(trim(COALESCE(p_code, '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF trim(p_display_name) = '' THEN RAISE EXCEPTION 'Marketer display name is required'; END IF;
  IF v_code !~ '^[A-Z0-9-]{3,30}$' THEN RAISE EXCEPTION 'Marketer code must be 3-30 alphanumeric characters'; END IF;
  IF COALESCE(p_commission_rate, 0) < 0 OR p_commission_rate > 100 THEN RAISE EXCEPTION 'Commission rate must be between 0 and 100 percent'; END IF;
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  IF EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE code = v_code AND (p_id IS NULL OR id <> p_id)) THEN
    RAISE EXCEPTION 'Marketer code is already in use';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.affiliate_profiles (
      display_name, code, phone, email, commission_rate, minimum_payout,
      payout_method, payout_details, admin_note, status, approved_by, approved_at
    ) VALUES (
      trim(p_display_name), v_code, NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_email, '')), ''),
      COALESCE(p_commission_rate, 5), COALESCE(p_minimum_payout, 0), NULLIF(trim(COALESCE(p_payout_method, '')), ''),
      NULLIF(trim(COALESCE(p_payout_details, '')), ''), NULLIF(trim(COALESCE(p_admin_note, '')), ''),
      p_status, CASE WHEN p_status = 'active' THEN auth.uid() ELSE NULL END,
      CASE WHEN p_status = 'active' THEN timezone('utc', now()) ELSE NULL END
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.affiliate_profiles SET
      display_name = trim(p_display_name),
      code = v_code,
      phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
      email = NULLIF(trim(COALESCE(p_email, '')), ''),
      commission_rate = COALESCE(p_commission_rate, commission_rate),
      minimum_payout = COALESCE(p_minimum_payout, 0),
      payout_method = NULLIF(trim(COALESCE(p_payout_method, '')), ''),
      payout_details = NULLIF(trim(COALESCE(p_payout_details, '')), ''),
      admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
      status = p_status,
      approved_by = CASE WHEN p_status = 'active' AND approved_by IS NULL THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN p_status = 'active' AND approved_at IS NULL THEN timezone('utc', now()) ELSE approved_at END,
      updated_at = timezone('utc', now())
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Marketer profile not found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_affiliate(uuid, text, text, text, text, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_affiliate(uuid, text, text, text, text, numeric, numeric, text, text, text, text) TO authenticated, service_role;

-- 7.3 Record Marketer Payout ("Give him his money" / Payout Settlement)
CREATE OR REPLACE FUNCTION public.admin_record_affiliate_payout(
  p_affiliate_id uuid,
  p_amount numeric,
  p_payout_method text,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payout_id uuid;
  v_admin_id uuid := auth.uid();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'Payout amount must be greater than zero'; END IF;
  IF trim(p_payout_method) = '' THEN RAISE EXCEPTION 'Payout method is required'; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE id = p_affiliate_id) THEN
    RAISE EXCEPTION 'Marketer not found';
  END IF;

  INSERT INTO public.affiliate_payouts (
    affiliate_id, amount, payout_method, reference_number, notes, created_by
  ) VALUES (
    p_affiliate_id, round(p_amount, 2), trim(p_payout_method),
    NULLIF(trim(COALESCE(p_reference_number, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_admin_id
  ) RETURNING id INTO v_payout_id;

  -- Mark existing approved commissions for this affiliate as paid
  UPDATE public.affiliate_commissions
  SET status = 'paid', paid_at = timezone('utc', now())
  WHERE affiliate_id = p_affiliate_id AND status = 'approved';

  RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_affiliate_payout(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_affiliate_payout(uuid, numeric, text, text, text) TO authenticated, service_role;

-- 7.4 Detailed Marketer Profile View: Orders, Commissions, Payouts, Coupons
CREATE OR REPLACE FUNCTION public.admin_get_affiliate_details(p_affiliate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_coupons jsonb;
  v_orders jsonb;
  v_commissions jsonb;
  v_payouts jsonb;
  v_stats record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_profile FROM public.affiliate_profiles WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found'; END IF;

  -- Coupons assigned to this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'name', c.name,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'max_discount_amount', c.max_discount_amount,
    'usage_count', c.usage_count,
    'is_active', c.is_active,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_coupons
  FROM public.coupons c
  WHERE c.affiliate_id = p_affiliate_id;

  -- Orders brought by this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'total', o.total,
    'discount_amount', o.discount_amount,
    'coupon_code', o.coupon_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'created_at', o.created_at
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM public.orders o
  WHERE o.affiliate_id = p_affiliate_id;

  -- Commissions history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ac.id,
    'order_id', ac.order_id,
    'order_number', o.order_number,
    'commission_amount', ac.commission_amount,
    'commission_rate', ac.commission_rate,
    'status', ac.status,
    'created_at', ac.created_at,
    'paid_at', ac.paid_at
  ) ORDER BY ac.created_at DESC), '[]'::jsonb)
  INTO v_commissions
  FROM public.affiliate_commissions ac
  LEFT JOIN public.orders o ON o.id = ac.order_id
  WHERE ac.affiliate_id = p_affiliate_id;

  -- Payouts history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ap.id,
    'amount', ap.amount,
    'payout_method', ap.payout_method,
    'reference_number', ap.reference_number,
    'notes', ap.notes,
    'created_at', ap.created_at
  ) ORDER BY ap.created_at DESC), '[]'::jsonb)
  INTO v_payouts
  FROM public.affiliate_payouts ap
  WHERE ap.affiliate_id = p_affiliate_id;

  -- Aggregated stats
  SELECT
    COUNT(DISTINCT CASE WHEN o.status = 'delivered' THEN o.id END) AS total_delivered_orders,
    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN GREATEST(o.total - COALESCE(o.shipping_fee, 0), 0) ELSE 0 END), 0) AS total_delivered_sales,
    COALESCE(SUM(CASE WHEN o.status = 'delivered' THEN COALESCE(o.discount_amount, 0) ELSE 0 END), 0) AS total_delivered_discounts,
    COALESCE(SUM(ac.commission_amount), 0) AS total_commission_earned,
    COALESCE(SUM(ap.amount), 0) AS total_paid
  INTO v_stats
  FROM (SELECT p_affiliate_id AS id) p
  LEFT JOIN public.orders o ON o.affiliate_id = p.id
  LEFT JOIN public.affiliate_commissions ac ON ac.affiliate_id = p.id AND ac.status IN ('approved', 'paid')
  LEFT JOIN public.affiliate_payouts ap ON ap.affiliate_id = p.id;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'code', v_profile.code,
      'phone', v_profile.phone,
      'email', v_profile.email,
      'status', v_profile.status,
      'commission_rate', v_profile.commission_rate,
      'minimum_payout', v_profile.minimum_payout,
      'payout_method', v_profile.payout_method,
      'payout_details', v_profile.payout_details,
      'admin_note', v_profile.admin_note,
      'created_at', v_profile.created_at
    ),
    'stats', jsonb_build_object(
      'total_orders', v_stats.total_delivered_orders,
      'total_sales', v_stats.total_delivered_sales,
      'total_discount_given', v_stats.total_delivered_discounts,
      'total_commission_earned', v_stats.total_commission_earned,
      'total_payouts_paid', v_stats.total_paid,
      'pending_balance', GREATEST(v_stats.total_commission_earned - v_stats.total_paid, 0)
    ),
    'coupons', v_coupons,
    'orders', v_orders,
    'commissions', v_commissions,
    'payouts', v_payouts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_affiliate_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliate_details(uuid) TO authenticated, service_role;
