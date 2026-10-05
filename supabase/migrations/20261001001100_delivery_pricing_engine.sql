-- Delivery Pricing Engine: GPS-mandatory, weight- and multi-warehouse-aware delivery fees.
-- Docs: docs/delivery-pricing-engine.md
--
--   fee      = base_fee + road_km * per_km_rate + weight_kg * per_kg_rate
--              + extra_warehouses * per_extra_warehouse_fee + handling_fee, clamped to [min_fee, max_fee]
--   road_km  = straight-line distance * road_multiplier
--   distance = haversine(wh, customer)                                     (one warehouse)
--            = sum(haversine(wh_i, central_wh)) + haversine(central_wh, customer)   (several)
--   central_wh = the fulfilling warehouse closest to the customer.
--
-- Overloads: the new quote/preview/checkout functions have signatures that no existing function
-- shares, so nothing the legacy flow still calls is replaced. The one exception is the twelve-argument
-- checkout_order_safe from GPS-05: its parameter NAMES equal the new function's, which PostgREST cannot
-- tell apart (PGRST203), and it accepted a NULL pin, which this engine forbids. It is dropped; the
-- ten-argument legacy signature stays as a wrapper that raises a clear error.

-- A. Pricing coefficients -----------------------------------------------------------------------
ALTER TABLE public.delivery_pricing_config
  ADD COLUMN IF NOT EXISTS per_kg_rate numeric(12,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_extra_warehouse_fee numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS handling_fee numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.delivery_pricing_config
  DROP CONSTRAINT IF EXISTS delivery_pricing_config_per_kg_rate_check,
  DROP CONSTRAINT IF EXISTS delivery_pricing_config_per_extra_warehouse_fee_check,
  DROP CONSTRAINT IF EXISTS delivery_pricing_config_handling_fee_check;

ALTER TABLE public.delivery_pricing_config
  ADD CONSTRAINT delivery_pricing_config_per_kg_rate_check CHECK (per_kg_rate >= 0),
  ADD CONSTRAINT delivery_pricing_config_per_extra_warehouse_fee_check CHECK (per_extra_warehouse_fee >= 0),
  ADD CONSTRAINT delivery_pricing_config_handling_fee_check CHECK (handling_fee >= 0);

COMMENT ON COLUMN public.delivery_pricing_config.per_kg_rate IS 'SDG per kg of total order weight. 0 = weight not factored.';
COMMENT ON COLUMN public.delivery_pricing_config.per_extra_warehouse_fee IS 'Extra fee per additional warehouse beyond the first (consolidation cost).';
COMMENT ON COLUMN public.delivery_pricing_config.handling_fee IS 'Fixed handling/packing fee applied to every order regardless of distance or weight.';

-- B. Deprecations (columns kept; nothing in the new engine reads them) --------------------------
COMMENT ON COLUMN public.delivery_zones.latitude IS 'Deprecated: GPS-05+ uses customer GPS pin directly. No longer used by calculate_delivery_quote.';
COMMENT ON COLUMN public.delivery_zones.longitude IS 'Deprecated: see latitude.';
COMMENT ON COLUMN public.app_settings.dynamic_pricing_states IS 'Deprecated: new delivery engine (20261001001100) uses GPS coordinates directly. This column is no longer checked.';

-- C. Great-circle distance ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.haversine_km(
  p_lat1 numeric, p_lng1 numeric, p_lat2 numeric, p_lng2 numeric
) RETURNS numeric
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $$
DECLARE
  c_earth_radius_km constant double precision := 6371;
BEGIN
  RETURN (2 * c_earth_radius_km * asin(least(1, sqrt(
    power(sin(radians(p_lat2 - p_lat1) / 2), 2) +
    cos(radians(p_lat1)) * cos(radians(p_lat2)) *
    power(sin(radians(p_lng2 - p_lng1) / 2), 2)
  ))))::numeric;
END;
$$;

REVOKE ALL ON FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haversine_km(numeric, numeric, numeric, numeric) TO authenticated, service_role;

-- D. calculate_delivery_quote -------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_delivery_quote(
  p_warehouse_ids      uuid[],
  p_customer_lat       numeric,
  p_customer_lng       numeric,
  p_order_weight_grams numeric DEFAULT 0
) RETURNS TABLE(
  fee              numeric,
  eta_minutes      integer,
  source           text,
  warehouses_count integer,
  distance_km      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  c_grams_per_kg     constant numeric := 1000;
  c_minutes_per_hour constant numeric := 60;
  v_config           public.delivery_pricing_config%ROWTYPE;
  v_central          public.warehouses%ROWTYPE;
  v_wh_ids           uuid[];
  v_wh_count         integer;
  v_usable_count     integer;
  v_extra_wh         integer;
  v_central_leg_km   numeric;
  v_feeder_legs_km   numeric;
  v_road_km          numeric;
  v_weight_kg        numeric;
  v_fee              numeric;
  v_eta              integer;
BEGIN
  IF p_customer_lat IS NULL OR p_customer_lng IS NULL
     OR p_customer_lat NOT BETWEEN -90 AND 90
     OR p_customer_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Valid customer GPS coordinates are required';
  END IF;

  SELECT array_agg(DISTINCT id) INTO v_wh_ids FROM unnest(p_warehouse_ids) AS t(id) WHERE id IS NOT NULL;
  v_wh_count := COALESCE(cardinality(v_wh_ids), 0);
  IF v_wh_count = 0 THEN
    RAISE EXCEPTION 'At least one warehouse is required';
  END IF;

  SELECT count(*) INTO v_usable_count
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids) AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL;
  IF v_usable_count <> v_wh_count THEN
    RAISE EXCEPTION 'Warehouse not found or missing GPS coordinates';
  END IF;

  SELECT * INTO v_config
  FROM public.delivery_pricing_config
  WHERE is_active AND warehouse_id IS NULL AND delivery_zone_id IS NULL AND state IS NULL
  ORDER BY updated_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No delivery pricing configuration found. Please configure pricing in the admin portal.';
  END IF;

  SELECT w.* INTO v_central
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids)
  ORDER BY public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng), w.created_at, w.id
  LIMIT 1;

  v_central_leg_km := public.haversine_km(v_central.latitude, v_central.longitude, p_customer_lat, p_customer_lng);

  SELECT COALESCE(sum(public.haversine_km(w.latitude, w.longitude, v_central.latitude, v_central.longitude)), 0)
  INTO v_feeder_legs_km
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids) AND w.id <> v_central.id;

  v_road_km := (v_feeder_legs_km + v_central_leg_km) * v_config.road_multiplier;
  v_weight_kg := GREATEST(COALESCE(p_order_weight_grams, 0), 0) / c_grams_per_kg;
  v_extra_wh := GREATEST(v_wh_count - 1, 0);

  v_fee := v_config.base_fee
    + (v_road_km * v_config.per_km_rate)
    + (v_weight_kg * v_config.per_kg_rate)
    + (v_extra_wh * v_config.per_extra_warehouse_fee)
    + v_config.handling_fee;

  v_fee := GREATEST(v_config.min_fee, v_fee);
  IF v_config.max_fee IS NOT NULL THEN
    v_fee := LEAST(v_config.max_fee, v_fee);
  END IF;

  v_eta := v_central.base_dispatch_minutes + ceil(v_road_km / v_config.avg_speed_kmh * c_minutes_per_hour)::integer;

  RETURN QUERY SELECT
    round(v_fee, 2),
    v_eta,
    CASE WHEN v_wh_count = 1 THEN 'dynamic_single' ELSE 'dynamic_multi' END,
    v_wh_count,
    round(v_road_km, 2);
END;
$$;

ALTER FUNCTION public.calculate_delivery_quote(uuid[], numeric, numeric, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.calculate_delivery_quote(uuid[], numeric, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_quote(uuid[], numeric, numeric, numeric) TO authenticated, service_role;

-- E. resolve_fulfillment_warehouses -------------------------------------------------------------
-- Strategies: 'single' (one warehouse holds the whole cart, or no warehouse inventory exists at all
-- and the nearest GPS-equipped warehouse prices the order), 'multi' (greedy cover, a product is never
-- split across warehouses), 'partial_unfulfillable' (some product no active warehouse can supply).
-- The optional customer pin only breaks ties towards the nearest warehouse; without it the oldest wins.
CREATE OR REPLACE FUNCTION public.resolve_fulfillment_warehouses(
  p_items        jsonb,
  p_customer_lat numeric DEFAULT NULL,
  p_customer_lng numeric DEFAULT NULL
) RETURNS TABLE(warehouse_ids uuid[], strategy text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_pin   boolean := p_customer_lat IS NOT NULL AND p_customer_lng IS NOT NULL;
  v_wh_id     uuid;
  v_wh_ids    uuid[] := '{}';
  v_remaining uuid[];
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.warehouse_inventory) THEN
    SELECT w.id INTO v_wh_id
    FROM public.warehouses w
    WHERE w.is_active AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
    ORDER BY CASE WHEN v_has_pin THEN public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng) END, w.created_at, w.id
    LIMIT 1;
    IF FOUND THEN
      RETURN QUERY SELECT ARRAY[v_wh_id], 'single'::text;
    ELSE
      RETURN QUERY SELECT v_wh_ids, 'partial_unfulfillable'::text;
    END IF;
    RETURN;
  END IF;

  WITH need AS (
    SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS qty
    FROM jsonb_array_elements(p_items) ci GROUP BY 1
  )
  SELECT w.id INTO v_wh_id
  FROM public.warehouses w
  WHERE w.is_active AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM need n
      WHERE NOT EXISTS (
        SELECT 1 FROM public.warehouse_inventory wi
        WHERE wi.warehouse_id = w.id AND wi.product_id = n.product_id AND wi.quantity >= n.qty
      )
    )
  ORDER BY CASE WHEN v_has_pin THEN public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng) END, w.created_at, w.id
  LIMIT 1;

  IF FOUND THEN
    RETURN QUERY SELECT ARRAY[v_wh_id], 'single'::text;
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT (ci->>'id')::uuid) INTO v_remaining FROM jsonb_array_elements(p_items) ci;

  WHILE COALESCE(cardinality(v_remaining), 0) > 0 LOOP
    WITH need AS (
      SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS qty
      FROM jsonb_array_elements(p_items) ci GROUP BY 1
    )
    SELECT w.id INTO v_wh_id
    FROM public.warehouse_inventory wi
    JOIN public.warehouses w ON w.id = wi.warehouse_id
    JOIN need n ON n.product_id = wi.product_id
    WHERE w.is_active AND w.latitude IS NOT NULL AND w.longitude IS NOT NULL
      AND wi.product_id = ANY(v_remaining)
      AND wi.quantity >= n.qty
    GROUP BY w.id
    ORDER BY count(*) DESC,
             CASE WHEN v_has_pin THEN public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng) END,
             w.created_at, w.id
    LIMIT 1;

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_wh_ids, 'partial_unfulfillable'::text;
      RETURN;
    END IF;

    v_wh_ids := array_append(v_wh_ids, v_wh_id);

    WITH need AS (
      SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS qty
      FROM jsonb_array_elements(p_items) ci GROUP BY 1
    )
    SELECT array_agg(r.product_id) INTO v_remaining
    FROM unnest(v_remaining) AS r(product_id)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.warehouse_inventory wi
      JOIN need n ON n.product_id = wi.product_id
      WHERE wi.warehouse_id = v_wh_id AND wi.product_id = r.product_id AND wi.quantity >= n.qty
    );
  END LOOP;

  RETURN QUERY SELECT v_wh_ids, 'multi'::text;
END;
$$;

ALTER FUNCTION public.resolve_fulfillment_warehouses(jsonb, numeric, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_fulfillment_warehouses(jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_fulfillment_warehouses(jsonb, numeric, numeric) TO authenticated, service_role;

-- F. preview_delivery_quote ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_delivery_quote(
  p_items        jsonb,
  p_customer_lat numeric,
  p_customer_lng numeric
) RETURNS TABLE(fee numeric, eta_minutes integer, source text, warehouses_count integer, distance_km numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_wh_ids   uuid[];
  v_strategy text;
  v_weight   numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_customer_lat IS NULL OR p_customer_lng IS NULL THEN
    RAISE EXCEPTION 'Customer GPS coordinates are required';
  END IF;

  SELECT f.warehouse_ids, f.strategy INTO v_wh_ids, v_strategy
  FROM public.resolve_fulfillment_warehouses(p_items, p_customer_lat, p_customer_lng) f;
  IF v_strategy = 'partial_unfulfillable' THEN
    RAISE EXCEPTION 'No active warehouse can fulfill this order';
  END IF;

  SELECT COALESCE(sum(COALESCE(p.weight_grams, 0) * (e.value->>'quantity')::integer), 0) INTO v_weight
  FROM jsonb_array_elements(p_items) AS e(value)
  JOIN public.products p ON p.id = (e.value->>'id')::uuid;

  RETURN QUERY
  SELECT q.fee, q.eta_minutes, q.source, q.warehouses_count, q.distance_km
  FROM public.calculate_delivery_quote(v_wh_ids, p_customer_lat, p_customer_lng, v_weight) q;
END;
$$;

ALTER FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric) TO authenticated, service_role;

-- G. checkout_order_safe (GPS mandatory) --------------------------------------------------------
-- Replaces the GPS-05 twelve-argument overload (see header). Inlines the former checkout_order flow
-- because that function prices a single warehouse; warehouse_inventory is debited from whichever
-- selected warehouse holds each product, and every reservation row records its own warehouse so
-- release_order_resources restores stock where it was taken from.
DROP FUNCTION IF EXISTS public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text, numeric, numeric);

CREATE OR REPLACE FUNCTION public.checkout_order_safe(
  p_customer_name    text,
  p_phone            text,
  p_shipping_address text,
  p_city             text,
  p_state            text,
  p_payment_method   text,
  p_items            jsonb,
  p_customer_lat     numeric,
  p_customer_lng     numeric,
  p_coupon_code      text DEFAULT NULL,
  p_points_to_redeem integer DEFAULT 0,
  p_idempotency_key  text DEFAULT NULL
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric, warehouses_count integer, distance_km numeric)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_items jsonb;
  v_reservation public.checkout_idempotency%ROWTYPE;
  v_replay record;
  v_replay_warehouses integer;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_discount numeric;
  v_stock integer;
  v_name text;
  v_active boolean;
  v_line_weight numeric;
  v_weight_grams numeric := 0;
  v_subtotal numeric := 0;
  v_base_subtotal numeric := 0;
  v_line_reductions numeric := 0;
  v_shipping numeric;
  v_total numeric;
  v_order_id uuid;
  v_order_number text;
  v_has_warehouse_inventory boolean;
  v_wh_ids uuid[];
  v_strategy text;
  v_assign jsonb := '{}'::jsonb;
  v_line_wh uuid;
  v_central_id uuid;
  v_quote record;
  v_coupon record;
  v_coupon_id uuid;
  v_coupon_code text;
  v_coupon_discount numeric := 0;
  v_affiliate_id uuid := NULL;
  v_points integer := 0;
  v_points_requested integer := COALESCE(p_points_to_redeem, 0);
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
  IF p_customer_lat IS NULL OR p_customer_lng IS NULL
     OR p_customer_lat NOT BETWEEN -90 AND 90
     OR p_customer_lng NOT BETWEEN -180 AND 180 THEN
    RAISE EXCEPTION 'Valid customer GPS coordinates are required';
  END IF;
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

    SELECT o.id AS order_id, o.order_number, o.total, o.shipping_fee, o.discount_amount, o.points_discount
    INTO v_replay
    FROM public.orders o
    WHERE o.id = v_reservation.order_id;

    SELECT NULLIF(count(DISTINCT im.warehouse_id), 0)::integer INTO v_replay_warehouses
    FROM public.inventory_movements im
    WHERE im.reference_id = v_reservation.order_id AND im.movement_type = 'order_reservation';

    RETURN QUERY SELECT v_replay.order_id, v_replay.order_number, v_replay.total, v_replay.shipping_fee,
                        v_replay.discount_amount, v_replay.points_discount, v_replay_warehouses, NULL::numeric;
    RETURN;
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN RAISE EXCEPTION 'Phone is required'; END IF;
  IF p_shipping_address IS NULL OR length(trim(p_shipping_address)) < 5 THEN RAISE EXCEPTION 'Shipping address is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = p_payment_method AND is_active) THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
  IF v_points_requested < 0 THEN RAISE EXCEPTION 'Points cannot be negative'; END IF;

  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  SELECT f.warehouse_ids, f.strategy INTO v_wh_ids, v_strategy
  FROM public.resolve_fulfillment_warehouses(v_items, p_customer_lat, p_customer_lng) f;
  IF v_strategy = 'partial_unfulfillable' THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock, p.name_ar, p.is_active, p.category, p.brand, p.variants, COALESCE(p.weight_grams, 0)
    INTO v_unit_price, v_discount, v_stock, v_name, v_active, v_category, v_brand, v_variants, v_line_weight
    FROM public.products p WHERE p.id = v_product_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_active THEN RAISE EXCEPTION 'Product % is no longer available', v_product_id; END IF;

    SELECT vl.variant_id, vl.variant_name, vl.variant_price, vl.unit_price
    INTO v_variant_id, v_variant_name, v_variant_price, v_unit_price
    FROM public.variant_line(v_product_id, v_variants, v_item->>'variant_id', v_unit_price) vl;

    SELECT SUM((ci->>'quantity')::integer) INTO v_needed FROM jsonb_array_elements(v_items) ci WHERE (ci->>'id')::uuid = v_product_id;
    IF NOT v_has_warehouse_inventory AND COALESCE(v_stock, 0) < v_needed THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;

    IF v_has_warehouse_inventory AND (v_assign->>(v_product_id::text)) IS NULL THEN
      SELECT wi.warehouse_id INTO v_line_wh
      FROM public.warehouse_inventory wi
      JOIN unnest(v_wh_ids) WITH ORDINALITY AS u(selected_id, ord) ON u.selected_id = wi.warehouse_id
      WHERE wi.product_id = v_product_id AND wi.quantity >= v_needed
      ORDER BY u.ord
      LIMIT 1;
      IF NOT FOUND THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF;
      v_assign := v_assign || jsonb_build_object(v_product_id::text, v_line_wh);
    END IF;

    SELECT ep.effective_price, ep.reduction, ep.rule_kind, ep.rule_label, ep.promotion_id
    INTO v_line_price, v_line_reduction, v_rule_kind, v_rule_label, v_promotion_id
    FROM public.effective_price(v_product_id, v_unit_price, v_discount, v_category, v_brand) ep;

    v_base_subtotal := v_base_subtotal + v_unit_price * v_quantity;
    v_line_reductions := v_line_reductions + v_line_reduction * v_quantity;
    v_weight_grams := v_weight_grams + v_line_weight * v_quantity;
    v_items_snapshot := v_items_snapshot || jsonb_build_object(
      'id', v_product_id, 'variant_id', v_variant_id, 'variant_name', v_variant_name, 'variant_price', v_variant_price,
      'quantity', v_quantity, 'name_ar', v_name, 'unit_price', round(v_unit_price, 2), 'discount_percentage', v_discount,
      'effective_unit_price', v_line_price, 'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label,
      'promotion_id', v_promotion_id, 'line_total', round(v_line_price * v_quantity, 2)
    );
  END LOOP;

  SELECT * INTO v_quote FROM public.calculate_delivery_quote(v_wh_ids, p_customer_lat, p_customer_lng, v_weight_grams);
  v_shipping := v_quote.fee;

  SELECT w.id INTO v_central_id
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids)
  ORDER BY public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng), w.created_at, w.id
  LIMIT 1;

  v_base_subtotal := round(v_base_subtotal, 2);
  v_line_reductions := round(v_line_reductions, 2);
  v_subtotal := v_base_subtotal - v_line_reductions;

  IF NULLIF(trim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN
    SELECT * INTO v_coupon FROM public.evaluate_coupon(p_coupon_code, v_user_id, v_base_subtotal, v_line_reductions, true);
    IF v_coupon.reason IS NOT NULL THEN RAISE EXCEPTION 'Coupon refused: %', v_coupon.reason; END IF;
    v_coupon_id := v_coupon.coupon_id;
    v_coupon_code := v_coupon.code;
    v_coupon_discount := v_coupon.reduction;

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
  IF v_points_requested > 0 THEN
    IF v_points_requested < v_minimum_points THEN RAISE EXCEPTION 'Minimum points for redemption was not reached'; END IF;
    IF v_points_requested > COALESCE(v_points, 0) THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF;
    v_points_discount := LEAST(v_points_requested * v_point_value, GREATEST(v_subtotal - v_coupon_discount, 0));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_has_warehouse_inventory THEN
      UPDATE public.warehouse_inventory SET quantity = quantity - v_quantity, updated_at = timezone('utc', now())
      WHERE warehouse_id = (v_assign->>(v_product_id::text))::uuid AND product_id = v_product_id AND quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF;
    ELSE
      UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id;
    END IF;
  END LOOP;

  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  v_total := round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2);

  INSERT INTO public.orders (
    customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method,
    payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id,
    coupon_code, discount_amount, points_redeemed, points_discount, affiliate_id, affiliate_code,
    needs_fulfillment_review
  ) VALUES (
    v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot,
    v_total, v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state,
    v_order_number, v_central_id, v_coupon_code, round(v_coupon_discount, 2), v_points_requested,
    round(v_points_discount, 2), v_affiliate_id, v_coupon_code,
    v_strategy = 'multi'
  ) RETURNING id INTO v_order_id;

  IF v_coupon_id IS NOT NULL THEN
    UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon_id;
    INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount)
    VALUES (v_coupon_id, v_order_id, v_user_id, v_coupon_discount);
  END IF;

  IF v_points_requested > 0 THEN
    UPDATE public.profiles SET beauty_points = beauty_points - v_points_requested WHERE id = v_user_id;
    INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by)
    VALUES (v_user_id, v_order_id, -v_points_requested, 'redeem', 'استبدال نقاط عند إنشاء الطلب', v_user_id);
  END IF;

  IF v_has_warehouse_inventory THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
      INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
      VALUES ((v_assign->>(v_item->>'id'))::uuid, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id);
    END LOOP;
  END IF;

  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);

  UPDATE public.checkout_idempotency
  SET order_id = v_order_id
  WHERE customer_id = v_user_id AND idempotency_key = trim(p_idempotency_key);

  RETURN QUERY SELECT v_order_id, v_order_number, v_total, v_shipping, round(v_coupon_discount, 2), round(v_points_discount, 2),
                      v_quote.warehouses_count, v_quote.distance_km;
END;
$$;

ALTER FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) TO authenticated, service_role;

-- The legacy pin-less signature stays callable only to fail loudly for stale clients.
CREATE OR REPLACE FUNCTION public.checkout_order_safe(
  p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text,
  p_payment_method text, p_items jsonb,
  p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0,
  p_idempotency_key text DEFAULT NULL::text
) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
BEGIN
  RAISE EXCEPTION 'GPS coordinates are required. Use checkout_order_safe with p_customer_lat and p_customer_lng.';
END;
$$;

-- DOWN (manual):
--   Restore the GPS-05 bodies from 20261001000700 (twelve-argument checkout_order_safe and the ten-argument
--   wrapper), then:
--   DROP FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text);
--   DROP FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric);
--   DROP FUNCTION public.resolve_fulfillment_warehouses(jsonb, numeric, numeric);
--   DROP FUNCTION public.calculate_delivery_quote(uuid[], numeric, numeric, numeric);
--   DROP FUNCTION public.haversine_km(numeric, numeric, numeric, numeric);
--   ALTER TABLE public.delivery_pricing_config
--     DROP CONSTRAINT delivery_pricing_config_per_kg_rate_check,
--     DROP CONSTRAINT delivery_pricing_config_per_extra_warehouse_fee_check,
--     DROP CONSTRAINT delivery_pricing_config_handling_fee_check,
--     DROP COLUMN per_kg_rate, DROP COLUMN per_extra_warehouse_fee, DROP COLUMN handling_fee;
