-- Checkout without GPS (§7c.3, §9.2 approved). When the customer refuses location access, the delivery
-- zone is resolved from p_state + p_city. A zone that stores coordinates supplies the point for warehouse
-- resolution and the quote; a zone without coordinates is priced at its flat fee. Either way the order is
-- stored with location_source = 'zone' and needs_fulfillment_review = true so staff confirm by phone.
-- Carries every rule of 20261021000200 (request_hash idempotency, price_cart_lines, coupons, points).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS location_source text NOT NULL DEFAULT 'gps'
    CONSTRAINT orders_location_source_check CHECK (location_source IN ('gps', 'zone'));

COMMENT ON COLUMN public.orders.location_source IS 'gps: the customer shared a GPS pin at checkout. zone: no pin; the order was priced from the delivery zone chosen by state and city and needs a phone confirmation.';

-- Zone lookup: the locality with the same name in the state, else the state''s default zone.
CREATE OR REPLACE FUNCTION public.resolve_delivery_zone(p_state text, p_city text)
RETURNS TABLE(zone_id uuid, zone_fee numeric, zone_latitude numeric, zone_longitude numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NULLIF(trim(COALESCE(p_state, '')), '') IS NULL OR NULLIF(trim(COALESCE(p_city, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Delivery state and city are required without GPS coordinates';
  END IF;

  RETURN QUERY
  SELECT dz.id, dz.fee, dz.latitude::numeric, dz.longitude::numeric
  FROM public.delivery_zones dz
  WHERE dz.is_active
    AND dz.state = trim(p_state)
    AND (dz.name = trim(p_city) OR dz.name = trim(p_state) || ' — افتراضي')
  ORDER BY (dz.name = trim(p_city)) DESC, dz.created_at
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No delivery zone for the selected state and city';
  END IF;
END;
$$;

ALTER FUNCTION public.resolve_delivery_zone(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.resolve_delivery_zone(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_delivery_zone(text, text) TO service_role;

-- Overloads that would make named RPC calls ambiguous (PGRST203) or shadow the defaulted signatures.
DROP FUNCTION IF EXISTS public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text);
DROP FUNCTION IF EXISTS public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text);

CREATE FUNCTION public.checkout_order_safe(
  p_customer_name    text,
  p_phone            text,
  p_shipping_address text,
  p_city             text,
  p_state            text,
  p_payment_method   text,
  p_items            jsonb,
  p_customer_lat     numeric DEFAULT NULL,
  p_customer_lng     numeric DEFAULT NULL,
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
  v_request_hash text;
  v_reservation public.checkout_idempotency%ROWTYPE;
  v_replay record;
  v_replay_warehouses integer;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_stock integer;
  v_active boolean;
  v_line_weight numeric;
  v_weight_grams numeric := 0;
  v_subtotal numeric;
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
  v_zone record;
  v_quote_warehouses integer;
  v_quote_distance numeric;
  v_has_pin boolean := p_customer_lat IS NOT NULL AND p_customer_lng IS NOT NULL;
  v_pin_lat numeric := p_customer_lat;
  v_pin_lng numeric := p_customer_lng;
  v_location_source text := 'gps';
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
  v_needed integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF (p_customer_lat IS NULL) <> (p_customer_lng IS NULL) THEN
    RAISE EXCEPTION 'Customer GPS coordinates must be provided together or omitted';
  END IF;
  IF v_has_pin AND (p_customer_lat NOT BETWEEN -90 AND 90 OR p_customer_lng NOT BETWEEN -180 AND 180) THEN
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

  v_request_hash := md5(jsonb_build_object(
    'items', v_items,
    'coupon', upper(NULLIF(trim(COALESCE(p_coupon_code, '')), '')),
    'points', v_points_requested,
    'lat', round(p_customer_lat, 4)::text,
    'lng', round(p_customer_lng, 4)::text,
    'payment_method', p_payment_method,
    'customer_name', trim(COALESCE(p_customer_name, '')),
    'phone', trim(COALESCE(p_phone, '')),
    'shipping_address', trim(COALESCE(p_shipping_address, '')),
    'city', trim(COALESCE(p_city, '')),
    'state', trim(COALESCE(p_state, ''))
  )::text);

  INSERT INTO public.checkout_idempotency(customer_id, idempotency_key, request_hash)
  VALUES (v_user_id, trim(p_idempotency_key), v_request_hash)
  ON CONFLICT DO NOTHING
  RETURNING * INTO v_reservation;

  IF NOT FOUND THEN
    SELECT * INTO v_reservation
    FROM public.checkout_idempotency
    WHERE customer_id = v_user_id AND idempotency_key = trim(p_idempotency_key);

    IF v_reservation.request_hash IS NOT NULL AND v_reservation.request_hash <> v_request_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED';
    END IF;

    IF v_reservation.order_id IS NULL THEN
      RAISE EXCEPTION 'Checkout is already being processed';
    END IF;

    SELECT o.id AS order_id, o.order_number, o.total, o.shipping_fee, o.discount_amount, o.points_discount, o.status
    INTO v_replay
    FROM public.orders o
    WHERE o.id = v_reservation.order_id;

    IF v_replay.status = 'cancelled' THEN
      RAISE EXCEPTION 'IDEMPOTENCY_ORDER_CANCELLED';
    END IF;

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

  IF NOT v_has_pin THEN
    SELECT * INTO v_zone FROM public.resolve_delivery_zone(p_state, p_city);
    v_location_source := 'zone';
    IF v_zone.zone_latitude IS NOT NULL AND v_zone.zone_longitude IS NOT NULL THEN
      v_pin_lat := v_zone.zone_latitude;
      v_pin_lng := v_zone.zone_longitude;
      v_has_pin := true;
    END IF;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  SELECT f.warehouse_ids, f.strategy INTO v_wh_ids, v_strategy
  FROM public.resolve_fulfillment_warehouses(v_items, v_pin_lat, v_pin_lng) f;
  IF v_strategy = 'partial_unfulfillable' THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(v_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    SELECT p.stock, p.is_active, COALESCE(p.weight_grams, 0)
    INTO v_stock, v_active, v_line_weight
    FROM public.products p WHERE p.id = v_product_id FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_active THEN RAISE EXCEPTION 'Product % is no longer available', v_product_id; END IF;

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

    v_weight_grams := v_weight_grams + v_line_weight * v_quantity;
  END LOOP;

  SELECT pc.lines, pc.base_subtotal, pc.line_reductions
  INTO v_items_snapshot, v_base_subtotal, v_line_reductions
  FROM public.price_cart_lines(v_items) pc;

  IF v_has_pin THEN
    SELECT * INTO v_quote FROM public.calculate_delivery_quote(v_wh_ids, v_pin_lat, v_pin_lng, v_weight_grams);
    v_shipping := v_quote.fee;
    v_quote_warehouses := v_quote.warehouses_count;
    v_quote_distance := v_quote.distance_km;
  ELSE
    v_shipping := v_zone.zone_fee;
    v_quote_warehouses := cardinality(v_wh_ids);
    v_quote_distance := NULL;
  END IF;

  SELECT w.id INTO v_central_id
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids)
  ORDER BY CASE WHEN v_has_pin THEN public.haversine_km(w.latitude, w.longitude, v_pin_lat, v_pin_lng) END, w.created_at, w.id
  LIMIT 1;

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
      l || jsonb_build_object('effective_unit_price', (l->>'unit_price')::numeric, 'pricing_rule_kind', NULL, 'pricing_rule_label', NULL, 'promotion_id', NULL, 'promotion_type', NULL,
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
    needs_fulfillment_review, customer_lat, customer_lng, location_source
  ) VALUES (
    v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot,
    v_total, v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state,
    v_order_number, v_central_id, v_coupon_code, round(v_coupon_discount, 2), v_points_requested,
    round(v_points_discount, 2), v_affiliate_id, v_coupon_code,
    v_strategy = 'multi' OR v_location_source = 'zone', p_customer_lat, p_customer_lng, v_location_source
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
                      v_quote_warehouses, v_quote_distance;
END;
$$;

ALTER FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) TO authenticated, service_role;

-- The mobile wrapper no longer rejects a missing pin: checkout_order_safe decides (pin or zone).
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

-- Quote preview: a pin, or the zone when no pin is given. The pre-existing 3- and 5-argument overloads of
-- preview_delivery_quote are dropped; no client calls them (the web app and mobile app call the pin form).
DROP FUNCTION IF EXISTS public.preview_delivery_quote(text, text, jsonb);
DROP FUNCTION IF EXISTS public.preview_delivery_quote(text, text, jsonb, numeric, numeric);
DROP FUNCTION IF EXISTS public.preview_delivery_quote(jsonb, numeric, numeric);

CREATE FUNCTION public.preview_delivery_quote(
  p_items        jsonb,
  p_customer_lat numeric DEFAULT NULL,
  p_customer_lng numeric DEFAULT NULL,
  p_state        text DEFAULT NULL,
  p_city         text DEFAULT NULL
) RETURNS TABLE(fee numeric, eta_minutes integer, source text, warehouses_count integer, distance_km numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_pin  boolean := p_customer_lat IS NOT NULL AND p_customer_lng IS NOT NULL;
  v_pin_lat  numeric := p_customer_lat;
  v_pin_lng  numeric := p_customer_lng;
  v_zone     record;
  v_wh_ids   uuid[];
  v_strategy text;
  v_weight   numeric;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF (p_customer_lat IS NULL) <> (p_customer_lng IS NULL) THEN
    RAISE EXCEPTION 'Customer GPS coordinates must be provided together or omitted';
  END IF;
  IF v_has_pin AND (p_customer_lat NOT BETWEEN -90 AND 90 OR p_customer_lng NOT BETWEEN -180 AND 180) THEN
    RAISE EXCEPTION 'Valid customer GPS coordinates are required';
  END IF;

  IF NOT v_has_pin THEN
    SELECT * INTO v_zone FROM public.resolve_delivery_zone(p_state, p_city);
    IF v_zone.zone_latitude IS NOT NULL AND v_zone.zone_longitude IS NOT NULL THEN
      v_pin_lat := v_zone.zone_latitude;
      v_pin_lng := v_zone.zone_longitude;
      v_has_pin := true;
    END IF;
  END IF;

  SELECT f.warehouse_ids, f.strategy INTO v_wh_ids, v_strategy
  FROM public.resolve_fulfillment_warehouses(p_items, v_pin_lat, v_pin_lng) f;
  IF v_strategy = 'partial_unfulfillable' THEN
    RAISE EXCEPTION 'No active warehouse can fulfill this order';
  END IF;

  IF v_has_pin THEN
    SELECT COALESCE(sum(COALESCE(p.weight_grams, 0) * (e.value->>'quantity')::integer), 0) INTO v_weight
    FROM jsonb_array_elements(p_items) AS e(value)
    JOIN public.products p ON p.id = (e.value->>'id')::uuid;

    RETURN QUERY
    SELECT q.fee, q.eta_minutes, q.source, q.warehouses_count, q.distance_km
    FROM public.calculate_delivery_quote(v_wh_ids, v_pin_lat, v_pin_lng, v_weight) q;
  ELSE
    RETURN QUERY SELECT v_zone.zone_fee, NULL::integer, 'flat_fee'::text, cardinality(v_wh_ids), NULL::numeric;
  END IF;
END;
$$;

ALTER FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric, text, text) TO authenticated, service_role;

-- DOWN (manual):
--   Restore checkout_order_safe (12-argument, required coordinates) from 20261021000200_cart_promotions_pricing.sql
--   section "Checkout", and checkout_order_with_growth from 20261020000500_mobile_checkout_gps.sql.
--   Restore the ten-argument stub from 20261001001100_delivery_pricing_engine.sql (section G).
--   DROP FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text);
--   DROP FUNCTION public.preview_delivery_quote(jsonb, numeric, numeric, text, text);
--   Restore preview_delivery_quote(jsonb, numeric, numeric) from 20261001001100_delivery_pricing_engine.sql (section F).
--   DROP FUNCTION public.resolve_delivery_zone(text, text);
--   ALTER TABLE public.orders DROP COLUMN location_source;
