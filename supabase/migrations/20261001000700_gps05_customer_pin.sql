-- GPS-05: optional customer GPS pin for delivery pricing.
-- When a valid (lat, lng) pair is supplied, calculate_delivery_quote measures the haversine
-- distance from the warehouse to that pin instead of the zone's reference point. Everything else
-- (state rollout flag, config lookup, caps, flat-fee fallbacks) is unchanged.
--
-- Postgres treats a signature change as a new overload, and no existing function is dropped here.
-- The new overloads therefore declare the pin parameters WITHOUT defaults, so every existing
-- caller (positional or named, 3/9/10 args) still resolves unambiguously to the old signature,
-- which is rewritten below as a thin wrapper passing a NULL pin to the new implementation.

-- 1. calculate_delivery_quote
CREATE OR REPLACE FUNCTION public.calculate_delivery_quote(
  p_warehouse_id uuid,
  p_delivery_zone_id uuid,
  p_order_weight numeric,
  p_customer_lat numeric,
  p_customer_lng numeric
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse public.warehouses%ROWTYPE;
  v_zone public.delivery_zones%ROWTYPE;
  v_config public.delivery_pricing_config%ROWTYPE;
  v_dynamic_states text[];
  v_ref_lat numeric;
  v_ref_lng numeric;
  v_distance_km numeric;
  v_fee numeric;
BEGIN
  SELECT * INTO v_zone FROM public.delivery_zones WHERE id = p_delivery_zone_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Delivery zone not found';
  END IF;

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

  IF p_customer_lat IS NOT NULL AND p_customer_lng IS NOT NULL
     AND p_customer_lat BETWEEN -90 AND 90 AND p_customer_lng BETWEEN -180 AND 180 THEN
    v_ref_lat := p_customer_lat;
    v_ref_lng := p_customer_lng;
  ELSE
    v_ref_lat := v_zone.latitude;
    v_ref_lng := v_zone.longitude;
  END IF;

  IF v_warehouse.latitude IS NULL OR v_warehouse.longitude IS NULL
     OR v_ref_lat IS NULL OR v_ref_lng IS NULL THEN
    RETURN QUERY SELECT COALESCE(v_zone.fee, 0), v_warehouse.base_dispatch_minutes, 'flat_fee_missing_coordinates'::text;
    RETURN;
  END IF;

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

  v_distance_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(v_ref_lat - v_warehouse.latitude) / 2), 2) +
    cos(radians(v_warehouse.latitude)) * cos(radians(v_ref_lat)) *
    power(sin(radians(v_ref_lng - v_warehouse.longitude) / 2), 2)
  ));

  v_fee := v_config.base_fee
    + (v_distance_km * v_config.per_km_rate * v_config.road_multiplier)
    + (GREATEST(COALESCE(p_order_weight, 0), 0) * v_config.weight_multiplier);

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

ALTER FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric, numeric, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calculate_delivery_quote(
  p_warehouse_id uuid,
  p_delivery_zone_id uuid,
  p_order_weight numeric DEFAULT 0
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.calculate_delivery_quote(p_warehouse_id, p_delivery_zone_id, p_order_weight, NULL::numeric, NULL::numeric);
END;
$$;

-- 2. preview_delivery_quote
CREATE OR REPLACE FUNCTION public.preview_delivery_quote(
  p_city text,
  p_state text,
  p_items jsonb,
  p_customer_lat numeric,
  p_customer_lng numeric
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse_id uuid;
  v_has_warehouse_inventory boolean;
  v_zone_id uuid;
  v_zone_fee numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

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
  END IF;

  SELECT dz.id, dz.fee INTO v_zone_id, v_zone_fee FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1;

  IF v_zone_id IS NOT NULL AND v_warehouse_id IS NOT NULL THEN
    RETURN QUERY SELECT * FROM public.calculate_delivery_quote(v_warehouse_id, v_zone_id, 0, p_customer_lat, p_customer_lng);
    RETURN;
  END IF;

  RETURN QUERY SELECT COALESCE(v_zone_fee, 1500), NULL::integer, 'flat_fee'::text;
END;
$$;

ALTER FUNCTION public.preview_delivery_quote(text, text, jsonb, numeric, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.preview_delivery_quote(text, text, jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_delivery_quote(text, text, jsonb, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.preview_delivery_quote(
  p_city text,
  p_state text,
  p_items jsonb
) RETURNS TABLE(fee numeric, eta_minutes integer, source text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.preview_delivery_quote(p_city, p_state, p_items, NULL::numeric, NULL::numeric);
END;
$$;

-- 3. checkout_order: identical to 20261001000200 except the quote receives the customer pin.
CREATE OR REPLACE FUNCTION public.checkout_order(
  p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text,
  p_payment_method text, p_items jsonb, p_coupon_code text, p_points_to_redeem integer,
  p_customer_lat numeric, p_customer_lng numeric
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
    SELECT * INTO v_quote FROM public.calculate_delivery_quote(v_warehouse_id, v_zone_id, 0, p_customer_lat, p_customer_lng);
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

ALTER FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer, numeric, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer, numeric, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.checkout_order(
  p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text,
  p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.checkout_order(
    p_customer_name, p_phone, p_shipping_address, p_city, p_state,
    p_payment_method, p_items, p_coupon_code, p_points_to_redeem, NULL::numeric, NULL::numeric
  );
END;
$$;

-- 4. checkout_order_safe: same idempotency + line-merging flow, forwarding the pin to checkout_order.
CREATE OR REPLACE FUNCTION public.checkout_order_safe(
  p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text,
  p_payment_method text, p_items jsonb, p_coupon_code text, p_points_to_redeem integer,
  p_idempotency_key text, p_customer_lat numeric, p_customer_lng numeric
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_reservation public.checkout_idempotency%ROWTYPE;
  v_result record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NULL THEN RAISE EXCEPTION 'An idempotency key is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_strip_nulls(jsonb_build_object('id', item.product_id, 'variant_id', item.variant_id, 'quantity', item.total_quantity)) ORDER BY item.product_id, item.variant_id),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT (entry.value->>'id')::uuid AS product_id,
           NULLIF(trim(COALESCE(entry.value->>'variant_id', '')), '') AS variant_id,
           SUM((entry.value->>'quantity')::integer)::integer AS total_quantity
    FROM jsonb_array_elements(p_items) AS entry(value)
    GROUP BY 1, 2
  ) item;

  IF jsonb_array_length(v_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  INSERT INTO public.checkout_idempotency(customer_id, idempotency_key)
  VALUES (v_user_id, trim(p_idempotency_key))
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_reservation;

  IF NOT FOUND THEN
    SELECT * INTO v_reservation
    FROM public.checkout_idempotency
    WHERE customer_id = v_user_id AND idempotency_key = trim(p_idempotency_key);

    IF v_reservation.order_id IS NULL THEN
      RAISE EXCEPTION 'Checkout is already being processed';
    END IF;

    SELECT o.id AS order_id, o.order_number, o.total, o.shipping_fee,
           o.discount_amount, o.points_discount
    INTO v_result
    FROM public.orders o
    WHERE o.id = v_reservation.order_id;

    RETURN QUERY SELECT v_result.order_id, v_result.order_number, v_result.total,
                        v_result.shipping_fee, v_result.discount_amount, v_result.points_discount;
    RETURN;
  END IF;

  SELECT * INTO v_result
  FROM public.checkout_order(
    p_customer_name, p_phone, p_shipping_address, p_city, p_state,
    p_payment_method, v_items, p_coupon_code, p_points_to_redeem, p_customer_lat, p_customer_lng
  );

  UPDATE public.checkout_idempotency
  SET order_id = v_result.order_id
  WHERE customer_id = v_user_id AND idempotency_key = trim(p_idempotency_key);

  RETURN QUERY SELECT v_result.order_id, v_result.order_number, v_result.total,
                      v_result.shipping_fee, v_result.discount_amount, v_result.points_discount;
END;
$$;

ALTER FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text, numeric, numeric) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text, numeric, numeric) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.checkout_order_safe(p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0, p_idempotency_key text DEFAULT NULL::text) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.checkout_order_safe(
    p_customer_name, p_phone, p_shipping_address, p_city, p_state,
    p_payment_method, p_items, p_coupon_code, p_points_to_redeem, p_idempotency_key, NULL::numeric, NULL::numeric
  );
END;
$$;

-- DOWN (manual):
--   Restore the original bodies of the three-argument calculate_delivery_quote
--   (20261001000200), three-argument preview_delivery_quote (20261001000300), nine-argument
--   checkout_order (20261001000200) and ten-argument checkout_order_safe (20260920001700), then:
--   DROP FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text, numeric, numeric);
--   DROP FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer, numeric, numeric);
--   DROP FUNCTION public.preview_delivery_quote(text, text, jsonb, numeric, numeric);
--   DROP FUNCTION public.calculate_delivery_quote(uuid, uuid, numeric, numeric, numeric);