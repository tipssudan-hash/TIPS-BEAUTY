-- Store the customer's checkout GPS pin on the order so drivers and admins can navigate to the exact location.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_lat numeric(9,6),
  ADD COLUMN IF NOT EXISTS customer_lng numeric(9,6);

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_customer_lat_check,
  DROP CONSTRAINT IF EXISTS orders_customer_lng_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_customer_lat_check
    CHECK (customer_lat IS NULL OR (customer_lat BETWEEN -90 AND 90)),
  ADD CONSTRAINT orders_customer_lng_check
    CHECK (customer_lng IS NULL OR (customer_lng BETWEEN -180 AND 180));

COMMENT ON COLUMN public.orders.customer_lat IS 'Customer GPS latitude captured at checkout. Used by driver for navigation.';
COMMENT ON COLUMN public.orders.customer_lng IS 'Customer GPS longitude captured at checkout. Used by driver for navigation.';

-- checkout_order_safe: identical to 20261001001100 except the INSERT into orders also stores customer_lat / customer_lng.
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
    needs_fulfillment_review, customer_lat, customer_lng
  ) VALUES (
    v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot,
    v_total, v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state,
    v_order_number, v_central_id, v_coupon_code, round(v_coupon_discount, 2), v_points_requested,
    round(v_points_discount, 2), v_affiliate_id, v_coupon_code,
    v_strategy = 'multi', p_customer_lat, p_customer_lng
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

-- get_my_deliveries: identical to 20260920002300 plus customer_lat / customer_lng. The result columns change,
-- so the function must be dropped and recreated.
DROP FUNCTION IF EXISTS public.get_my_deliveries(uuid);

CREATE FUNCTION public.get_my_deliveries(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, order_number text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone,
  customer_name text, phone text, shipping_address text, city text, state text, notes text,
  items jsonb, item_count integer, payment_method text, cod_amount numeric, warehouse_name text,
  customer_lat numeric, customer_lng numeric
)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH me AS (
    SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()) AND public.is_driver()
  )
  SELECT o.id, o.order_number, o.status, o.created_at,
         (SELECT max(h.created_at) FROM public.order_status_history h WHERE h.order_id = o.id),
         o.customer_name, o.phone, o.shipping_address, o.city, o.state, o.notes,
         COALESCE((SELECT jsonb_agg(jsonb_build_object('name_ar', i->>'name_ar', 'variant_name', i->>'variant_name', 'quantity', (i->>'quantity')::integer) ORDER BY ord)
                   FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) WITH ORDINALITY t(i, ord)), '[]'::jsonb),
         (SELECT COALESCE(sum((i->>'quantity')::integer), 0)::integer FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) i),
         o.payment_method,
         CASE WHEN o.payment_method = 'COD' AND o.payment_status = 'pending' THEN o.total END,
         w.name,
         o.customer_lat, o.customer_lng
  FROM public.orders o
  JOIN me ON o.driver_id = me.id
  LEFT JOIN public.warehouses w ON w.id = o.fulfillment_warehouse_id
  WHERE (p_order_id IS NULL OR o.id = p_order_id)
    AND (
      o.status IN ('confirmed', 'preparing', 'shipped')
      OR (o.status IN ('delivered', 'delivery_failed') AND o.id IN (
            SELECT h.order_id FROM public.order_status_history h WHERE h.order_id = o.id AND h.status = o.status AND h.created_at > now() - interval '24 hours'))
      OR p_order_id IS NOT NULL
    )
  ORDER BY CASE o.status WHEN 'shipped' THEN 0 WHEN 'preparing' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END, o.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_deliveries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_deliveries(uuid) TO authenticated, service_role;

-- DOWN (manual):
--   Restore checkout_order_safe from 20261001001100 and get_my_deliveries from 20260920002300 (drop first), then:
--   ALTER TABLE public.orders
--     DROP CONSTRAINT orders_customer_lat_check, DROP CONSTRAINT orders_customer_lng_check,
--     DROP COLUMN customer_lat, DROP COLUMN customer_lng;