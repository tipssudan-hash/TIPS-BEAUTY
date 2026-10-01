-- GPS-02: calculate_delivery_quote RPC + checkout_order integration.
-- Spec: docs/specs/gps-delivery-pricing.md. Ticket: GitHub #36. Depends on GPS-01 (#35).

-- 0. Two schema gaps found while implementing this ticket, patched here rather than going
--    back to amend the already-open GPS-01 PR:
--    - GPS-01 gave warehouses a GPS point but not delivery_zones (Localities) — haversine
--      needs two points, and GPS-02's RPC takes a zone id, so the zone needs one too.
--    - No average-speed coefficient existed for turning distance into a delivery window
--      (user story 6) — "zero hardcoded prices" extends to timing, so it lives in config
--      rather than as a literal in the function body.
ALTER TABLE public.delivery_zones
  ADD COLUMN IF NOT EXISTS latitude numeric(9,6),
  ADD COLUMN IF NOT EXISTS longitude numeric(9,6);

ALTER TABLE public.delivery_zones
  ADD CONSTRAINT delivery_zones_latitude_check
    CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90)),
  ADD CONSTRAINT delivery_zones_longitude_check
    CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));

COMMENT ON COLUMN public.delivery_zones.latitude IS 'Locality reference point (centroid or a staff-chosen landmark), for GPS-02''s haversine distance calculation. Null until staff set it — calculate_delivery_quote falls back to the flat fee until then.';
COMMENT ON COLUMN public.delivery_zones.longitude IS 'See latitude.';

ALTER TABLE public.delivery_pricing_config
  ADD COLUMN IF NOT EXISTS avg_speed_kmh numeric(6,2) NOT NULL DEFAULT 30;

ALTER TABLE public.delivery_pricing_config
  ADD CONSTRAINT delivery_pricing_config_avg_speed_kmh_check CHECK (avg_speed_kmh > 0);

COMMENT ON COLUMN public.delivery_pricing_config.avg_speed_kmh IS 'Assumed average speed for converting distance into an estimated delivery window (no routing engine in this stack to derive a real transit time).';

-- Per-State rollout flag, off by default everywhere: dynamic pricing ships dark. GPS-03's
-- admin page edits this array; calculate_delivery_quote reads it to decide whether to run the
-- formula at all for a given order's state.
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS dynamic_pricing_states text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.app_settings.dynamic_pricing_states IS 'States where calculate_delivery_quote runs the dynamic formula. Any other state keeps today''s flat delivery_zones.fee. Empty by default — Phase 1 ships dark.';

-- 1. The quote function.
-- Picks the most specific delivery_pricing_config row (zone override > warehouse+state
-- default > one global default), computes haversine distance x rate x road multiplier +
-- base + weight multiplier, clamps to the config's min/max, and always has a safe fallback:
-- no matching warehouse/zone, no coordinates, no config row, or the zone's state not in
-- app_settings.dynamic_pricing_states all fall through to today's flat delivery_zones.fee.
-- Callable by authenticated customers directly (Checkout's live preview, GPS-04) and by
-- checkout_order internally (the frozen, authoritative charge).
CREATE OR REPLACE FUNCTION public.calculate_delivery_quote(
  p_warehouse_id uuid,
  p_delivery_zone_id uuid,
  p_order_weight numeric DEFAULT 0
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse public.warehouses%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_config public.delivery_pricing_config%ROWTYPE;
  v_dynamic_states text[];
  v_distance_km numeric;
  v_fee numeric;
BEGIN
  SELECT * INTO v_zone FROM public.delivery_zones WHERE id = p_delivery_zone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery zone not found';
  END IF;

  -- Fallback floor for every early-return below: today's flat fee, no warehouse-specific ETA.
  IF p_warehouse_id IS NULL THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), NULL::integer, 'flat_fee'::text;
    RETURN;
  END IF;

  SELECT * INTO v_warehouse FROM public.warehouses WHERE id = p_warehouse_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), NULL::integer, 'flat_fee'::text;
    RETURN;
  END IF;

  SELECT dynamic_pricing_states INTO v_dynamic_states FROM public.app_settings WHERE id = true;
  IF v_zone.state IS NULL OR NOT (v_zone.state = ANY(COALESCE(v_dynamic_states, '{}'))) THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), v_warehouse.base_dispatch_minutes, 'flat_fee'::text;
    RETURN;
  END IF;

  IF v_warehouse.latitude IS NULL OR v_warehouse.longitude IS NULL
     OR v_zone.latitude IS NULL OR v_zone.longitude IS NULL THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), v_warehouse.base_dispatch_minutes, 'flat_fee_missing_coordinates'::text;
    RETURN;
  END IF;

  -- Most specific matching active config row: exact (warehouse, zone) override, then
  -- (warehouse, state) default, then the single global default row.
  SELECT * INTO v_config
  FROM public.delivery_pricing_config
  WHERE is_active
    AND (
      (warehouse_id = p_warehouse_id AND delivery_zone_id = p_delivery_zone_id)
      OR (warehouse_id = p_warehouse_id AND delivery_zone_id IS NULL AND state = v_zone.state)
      OR (warehouse_id IS NULL AND delivery_zone_id IS NULL AND state IS NULL)
    )
  ORDER BY
    (delivery_zone_id IS NOT NULL) DESC,
    (warehouse_id IS NOT NULL) DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), v_warehouse.base_dispatch_minutes, 'flat_fee_missing_config'::text;
    RETURN;
  END IF;

  -- Haversine distance in km between the warehouse and the zone's reference point.
  v_distance_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(v_zone.latitude - v_warehouse.latitude) / 2), 2) +
    cos(radians(v_warehouse.latitude)) * cos(radians(v_zone.latitude)) *
    power(sin(radians(v_zone.longitude - v_warehouse.longitude) / 2), 2)
  ));

  v_fee := v_config.base_fee
    + (v_distance_km * v_config.per_km_rate * v_config.road_multiplier)
    + (GREATEST(COALESCE(p_order_weight, 0), 0) * v_config.weight_multiplier);

  -- Caps are enforced here, inside the function, regardless of what the config table holds —
  -- never just a suggestion the admin UI happens to respect.
  v_fee := GREATEST(v_config.min_fee, v_fee);
  IF v_config.max_fee IS NOT NULL THEN
    v_fee := LEAST(v_config.max_fee, v_fee);
  END IF;

  RETURN QUERY SELECT
    round(v_fee, 2),
    v_warehouse.base_dispatch_minutes + ceil(v_distance_km / v_config.avg_speed_kmh * 60)::integer,
    'dynamic'::text;
END;
$$;

ALTER FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric) TO authenticated, service_role;

-- 2. checkout_order: freeze the quote into the order instead of trusting the checkout page.
-- Identical to the version in 20260930000100_coupons_affiliate_hub.sql except: the warehouse
-- lookup now runs before the shipping-fee lookup (the quote needs to know which warehouse is
-- fulfilling), and the shipping fee is resolved via calculate_delivery_quote instead of a
-- direct delivery_zones.fee read. calculate_delivery_quote's own fallback chain (see above)
-- already reduces to the exact previous behaviour whenever no warehouse can fulfil the order,
-- no zone matches p_city, or the order's state isn't in app_settings.dynamic_pricing_states —
-- which is every state today, since that list ships empty (GPS-03 is what ever changes it).
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
  v_zone_id uuid;
  v_quote record;
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

  SELECT dz.id, dz.fee INTO v_zone_id, v_shipping FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1;
  IF v_zone_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
    SELECT * INTO v_quote FROM public.calculate_delivery_quote(v_warehouse_id, v_zone_id, 0);
    v_shipping := v_quote.fee;
  END IF;
  v_shipping := COALESCE(v_shipping, 1500);

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

-- DOWN (manual):
--   Recreate public.checkout_order from 20260930000100_coupons_affiliate_hub.sql (restores the
--   direct delivery_zones.fee lookup and the original warehouse-resolution ordering).
--   DROP FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric);
--   ALTER TABLE public.app_settings DROP COLUMN dynamic_pricing_states;
--   ALTER TABLE public.delivery_pricing_config
--     DROP CONSTRAINT delivery_pricing_config_avg_speed_kmh_check, DROP COLUMN avg_speed_kmh;
--   ALTER TABLE public.delivery_zones
--     DROP CONSTRAINT delivery_zones_latitude_check, DROP CONSTRAINT delivery_zones_longitude_check,
--     DROP COLUMN latitude, DROP COLUMN longitude;
