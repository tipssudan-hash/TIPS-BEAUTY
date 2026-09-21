-- 0016 Coupons (T2-08).
-- A Coupon is an Order-level Pricing Rule. One internal evaluator decides whether a code applies
-- and by how much; preview_coupon exposes it to the Checkout page and checkout_order uses it
-- under a row lock so total and per-customer limits hold under concurrency. Competition rule
-- (CONTEXT.md "Pricing Rule"): the Coupon's reduction on the base subtotal is compared with the
-- sum of the line reductions (Discounts/Promotions) already applied; the larger wins and the
-- other is dropped entirely — nothing stacks. A losing Coupon is refused with reason 'not_best'
-- so the customer sees why before placing the Order. Cancellation reversal is unchanged
-- (release_order_resources, tested in T2-04).

-- Internal evaluator ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.evaluate_coupon(
  p_code text, p_customer_id uuid, p_base_subtotal numeric, p_line_reductions numeric, p_lock boolean
) RETURNS TABLE(coupon_id uuid, code text, name text, reduction numeric, reason text)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_code, '')));
  v_coupon public.coupons%ROWTYPE;
  v_now timestamp with time zone := now();
  v_reduction numeric := 0;
  v_reason text := NULL;
BEGIN
  IF v_code = '' THEN RETURN QUERY SELECT NULL::uuid, NULL::text, NULL::text, 0::numeric, 'unknown'::text; RETURN; END IF;
  IF p_lock THEN
    SELECT * INTO v_coupon FROM public.coupons c WHERE c.code = v_code FOR UPDATE;
  ELSE
    SELECT * INTO v_coupon FROM public.coupons c WHERE c.code = v_code;
  END IF;
  IF NOT FOUND THEN RETURN QUERY SELECT NULL::uuid, v_code, NULL::text, 0::numeric, 'unknown'::text; RETURN; END IF;

  IF NOT v_coupon.is_active THEN v_reason := 'inactive';
  ELSIF v_coupon.starts_at > v_now THEN v_reason := 'not_started';
  ELSIF v_coupon.ends_at IS NOT NULL AND v_coupon.ends_at < v_now THEN v_reason := 'expired';
  ELSIF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN v_reason := 'used_up';
  ELSIF p_customer_id IS NOT NULL AND (SELECT count(*) FROM public.coupon_redemptions r WHERE r.coupon_id = v_coupon.id AND r.customer_id = p_customer_id) >= v_coupon.per_user_limit THEN v_reason := 'customer_limit';
  ELSIF COALESCE(p_base_subtotal, 0) < v_coupon.min_order_amount THEN v_reason := 'below_minimum';
  ELSE
    v_reduction := CASE WHEN v_coupon.discount_type = 'percentage'
                        THEN COALESCE(p_base_subtotal, 0) * v_coupon.discount_value / 100
                        ELSE v_coupon.discount_value END;
    IF v_coupon.max_discount_amount IS NOT NULL THEN v_reduction := LEAST(v_reduction, v_coupon.max_discount_amount); END IF;
    v_reduction := round(LEAST(v_reduction, COALESCE(p_base_subtotal, 0)), 2);
    IF v_reduction <= COALESCE(p_line_reductions, 0) THEN v_reason := 'not_best'; END IF;
  END IF;
  RETURN QUERY SELECT v_coupon.id, v_coupon.code, v_coupon.name, v_reduction, v_reason;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_coupon(text, uuid, numeric, numeric, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_coupon(text, uuid, numeric, numeric, boolean) TO service_role;

-- Checkout preview -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_items jsonb)
RETURNS TABLE(ok boolean, reason text, code text, name text, reduction numeric, base_subtotal numeric, line_reductions numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_base numeric := 0;
  v_lines numeric := 0;
  v_item jsonb;
  v_qty integer;
  v_p record;
  v_ep record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    SELECT p.price, COALESCE(p.discount_percentage, 0) AS discount_percentage, p.category, p.brand, p.is_active INTO v_p
    FROM public.products p WHERE p.id = (v_item->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_p.is_active THEN RAISE EXCEPTION 'Product % is no longer available', (v_item->>'id'); END IF;
    SELECT * INTO v_ep FROM public.effective_price((v_item->>'id')::uuid, v_p.price, v_p.discount_percentage, v_p.category, v_p.brand);
    v_base := v_base + v_p.price * v_qty;
    v_lines := v_lines + v_ep.reduction * v_qty;
  END LOOP;
  RETURN QUERY
    SELECT e.reason IS NULL, e.reason, e.code, e.name, e.reduction, round(v_base, 2), round(v_lines, 2)
    FROM public.evaluate_coupon(p_code, v_user_id, round(v_base, 2), round(v_lines, 2), false) e;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_coupon(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coupon(text, jsonb) TO authenticated, service_role;

-- Admin read -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_coupons() RETURNS SETOF public.coupons
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.* FROM public.coupons c WHERE public.is_admin() ORDER BY c.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_coupons() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_coupons() TO authenticated, service_role;

-- Admin write ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_save_coupon(
  p_code text, p_name text, p_discount_type text, p_discount_value numeric,
  p_id uuid DEFAULT NULL, p_description text DEFAULT NULL, p_max_discount_amount numeric DEFAULT NULL,
  p_min_order_amount numeric DEFAULT 0, p_usage_limit integer DEFAULT NULL, p_per_user_limit integer DEFAULT 1,
  p_starts_at timestamp with time zone DEFAULT NULL, p_ends_at timestamp with time zone DEFAULT NULL, p_is_active boolean DEFAULT true
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
    INSERT INTO public.coupons (code, name, description, discount_type, discount_value, max_discount_amount, min_order_amount, usage_limit, per_user_limit, starts_at, ends_at, is_active)
    VALUES (v_code, trim(p_name), NULLIF(trim(COALESCE(p_description, '')), ''), p_discount_type, p_discount_value, p_max_discount_amount,
            COALESCE(p_min_order_amount, 0), p_usage_limit, COALESCE(p_per_user_limit, 1), COALESCE(p_starts_at, timezone('utc', now())), p_ends_at, COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.coupons SET
      code = v_code, name = trim(p_name), description = NULLIF(trim(COALESCE(p_description, '')), ''), discount_type = p_discount_type,
      discount_value = p_discount_value, max_discount_amount = p_max_discount_amount, min_order_amount = COALESCE(p_min_order_amount, 0),
      usage_limit = p_usage_limit, per_user_limit = COALESCE(p_per_user_limit, 1), starts_at = COALESCE(p_starts_at, starts_at), ends_at = p_ends_at,
      is_active = COALESCE(p_is_active, true)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Coupon not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_coupon(text, text, text, numeric, uuid, text, numeric, numeric, integer, integer, timestamp with time zone, timestamp with time zone, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_coupon(text, text, text, numeric, uuid, text, numeric, numeric, integer, integer, timestamp with time zone, timestamp with time zone, boolean) TO authenticated, service_role;

-- A Coupon that was never redeemed may be removed; one with redemptions is deactivated instead.
CREATE OR REPLACE FUNCTION public.admin_delete_coupon(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.coupon_redemptions r WHERE r.coupon_id = p_id) THEN
    RAISE EXCEPTION 'Coupon has redemptions and cannot be deleted; deactivate it instead';
  END IF;
  DELETE FROM public.coupons WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Coupon not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_coupon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_coupon(uuid) TO authenticated, service_role;

-- Coupons are eligibility data: staff write only through the RPCs above (reads stay under the admin policy).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.coupons FROM authenticated;

-- checkout_order: identical to 0015 except the Coupon goes through evaluate_coupon (row lock) and
-- competes with the line reductions; when it wins the lines are charged at their base price.
CREATE OR REPLACE FUNCTION public.checkout_order(p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_item jsonb; v_product_id uuid; v_quantity integer; v_unit_price numeric; v_discount numeric; v_stock integer; v_name text; v_active boolean; v_subtotal numeric := 0; v_base_subtotal numeric := 0; v_line_reductions numeric := 0; v_shipping numeric := 1500; v_order_id uuid; v_order_number text; v_warehouse_id uuid; v_has_warehouse_inventory boolean; v_coupon record; v_coupon_id uuid; v_coupon_code text; v_coupon_discount numeric := 0; v_points integer := 0; v_points_discount numeric := 0; v_point_value numeric; v_minimum_points integer; v_items_snapshot jsonb := '[]'::jsonb; v_line_price numeric; v_category text; v_brand text; v_rule_kind text; v_rule_label text; v_promotion_id uuid; v_line_reduction numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN RAISE EXCEPTION 'Phone is required'; END IF;
  IF p_shipping_address IS NULL OR length(trim(p_shipping_address)) < 5 THEN RAISE EXCEPTION 'Shipping address is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = p_payment_method AND is_active) THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
  IF p_points_to_redeem < 0 THEN RAISE EXCEPTION 'Points cannot be negative'; END IF;
  SELECT dz.fee INTO v_shipping FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1; v_shipping := COALESCE(v_shipping, 1500); SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;
  IF v_has_warehouse_inventory THEN SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.is_active AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) ci WHERE NOT EXISTS (SELECT 1 FROM public.warehouse_inventory wi WHERE wi.warehouse_id = w.id AND wi.product_id = (ci->>'id')::uuid AND wi.quantity >= (ci->>'quantity')::integer)) ORDER BY CASE WHEN lower(w.city) = lower(coalesce(p_city, '')) THEN 0 ELSE 1 END, CASE WHEN lower(w.state) = lower(coalesce(p_state, '')) THEN 0 ELSE 1 END, w.created_at LIMIT 1; IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock, p.name_ar, p.is_active, p.category, p.brand INTO v_unit_price, v_discount, v_stock, v_name, v_active, v_category, v_brand FROM public.products p WHERE p.id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_active THEN RAISE EXCEPTION 'Product % is no longer available', v_product_id; END IF;
    IF NOT v_has_warehouse_inventory AND v_stock < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;
    -- The same Pricing Rule resolution the catalogue showed (T2-07).
    SELECT ep.effective_price, ep.reduction, ep.rule_kind, ep.rule_label, ep.promotion_id INTO v_line_price, v_line_reduction, v_rule_kind, v_rule_label, v_promotion_id
    FROM public.effective_price(v_product_id, v_unit_price, v_discount, v_category, v_brand) ep;
    v_base_subtotal := v_base_subtotal + v_unit_price * v_quantity;
    v_line_reductions := v_line_reductions + v_line_reduction * v_quantity;
    v_items_snapshot := v_items_snapshot || jsonb_build_object('id', v_product_id, 'quantity', v_quantity, 'name_ar', v_name, 'unit_price', round(v_unit_price, 2), 'discount_percentage', v_discount, 'effective_unit_price', v_line_price, 'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label, 'promotion_id', v_promotion_id, 'line_total', round(v_line_price * v_quantity, 2));
  END LOOP;
  v_base_subtotal := round(v_base_subtotal, 2); v_line_reductions := round(v_line_reductions, 2);
  v_subtotal := v_base_subtotal - v_line_reductions;
  -- Coupon (T2-08): competes with the line reductions; the larger single reduction wins.
  IF NULLIF(trim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.evaluate_coupon(p_coupon_code, v_user_id, v_base_subtotal, v_line_reductions, true);
    -- The typed reason travels to the Storefront, which owns the one Arabic map (couponRefusalMessage).
    IF v_coupon.reason IS NOT NULL THEN RAISE EXCEPTION 'Coupon refused: %', v_coupon.reason; END IF;
    v_coupon_id := v_coupon.coupon_id; v_coupon_code := v_coupon.code; v_coupon_discount := v_coupon.reduction;
    -- The Coupon won: lines are charged at their base price and carry no line rule.
    v_subtotal := v_base_subtotal;
    SELECT jsonb_agg(
      l || jsonb_build_object('effective_unit_price', (l->>'unit_price')::numeric, 'pricing_rule_kind', NULL, 'pricing_rule_label', NULL, 'promotion_id', NULL,
                              'line_total', round((l->>'unit_price')::numeric * (l->>'quantity')::integer, 2))
      ORDER BY ord)
    INTO v_items_snapshot FROM jsonb_array_elements(v_items_snapshot) WITH ORDINALITY AS t(l, ord);
  END IF;
  SELECT beauty_points INTO v_points FROM public.profiles WHERE id = v_user_id FOR UPDATE; SELECT currency_per_point, minimum_redemption_points INTO v_point_value, v_minimum_points FROM public.loyalty_settings WHERE id = true; IF p_points_to_redeem > 0 THEN IF p_points_to_redeem < v_minimum_points THEN RAISE EXCEPTION 'Minimum points for redemption was not reached'; END IF; IF p_points_to_redeem > COALESCE(v_points, 0) THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF; v_points_discount := LEAST(p_points_to_redeem * v_point_value, GREATEST(v_subtotal - v_coupon_discount, 0)); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer; IF v_has_warehouse_inventory THEN UPDATE public.warehouse_inventory SET quantity = quantity - v_quantity, updated_at = timezone('utc', now()) WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND quantity >= v_quantity; IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF; ELSE UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id; END IF; END LOOP;
  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.orders (customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method, payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id, coupon_code, discount_amount, points_redeemed, points_discount) VALUES (v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state, v_order_number, v_warehouse_id, v_coupon_code, round(v_coupon_discount, 2), p_points_to_redeem, round(v_points_discount, 2)) RETURNING id INTO v_order_id;
  IF v_coupon_id IS NOT NULL THEN UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon_id; INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount) VALUES (v_coupon_id, v_order_id, v_user_id, v_coupon_discount); END IF;
  IF p_points_to_redeem > 0 THEN UPDATE public.profiles SET beauty_points = beauty_points - p_points_to_redeem WHERE id = v_user_id; INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by) VALUES (v_user_id, v_order_id, -p_points_to_redeem, 'redeem', 'استبدال نقاط عند إنشاء الطلب', v_user_id); END IF;
  IF v_has_warehouse_inventory THEN FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by) VALUES (v_warehouse_id, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id); END LOOP; END IF;
  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);
  RETURN QUERY SELECT v_order_id, v_order_number, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, round(v_coupon_discount, 2), round(v_points_discount, 2);
END; $$;

-- DOWN:
--   recreate checkout_order from 20260920001500;
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.coupons TO authenticated;
--   DROP FUNCTION public.admin_delete_coupon(uuid);
--   DROP FUNCTION public.admin_get_coupons();
--   DROP FUNCTION public.admin_save_coupon(text, text, text, numeric, uuid, text, numeric, numeric, integer, integer, timestamp with time zone, timestamp with time zone, boolean);
--   DROP FUNCTION public.preview_coupon(text, jsonb);
--   DROP FUNCTION public.evaluate_coupon(text, uuid, numeric, numeric, boolean);
