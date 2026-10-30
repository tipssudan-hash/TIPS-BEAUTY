-- Phase 4 (plan §7.3): cart promotions and one pricing path for catalogue, preview, coupon and checkout.
-- price_cart_lines prices a whole Cart: each line's Discount/item Promotion (effective_price), then the cart
-- Promotions (evaluate_cart_promotions). Nothing stacks: a Promotion that claims a line replaces the line's
-- item reduction, and a Promotion is applied only if its net reduction (reduction minus the line reductions it
-- consumes) is positive. Promotion reductions are spread over the Promotion's lines in proportion to
-- unit_price * quantity (the rounding remainder goes to the last line), so each line's line_total is its
-- share of the Order and a partial return refunds line_total / quantity per unit (20261018000700).
-- A Coupon is still refused as not_best unless it beats the sum of all line reductions.

-- Item Promotions only: a cart-level Promotion never prices a single line through effective_price.
CREATE OR REPLACE FUNCTION public.effective_price(
  p_product_id uuid, p_base_price numeric, p_discount_percentage numeric, p_category text, p_brand text
) RETURNS TABLE(effective_price numeric, reduction numeric, rule_kind text, rule_label text, promotion_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (SELECT GREATEST(COALESCE(p_base_price, 0), 0) AS price),
  discount AS (
    SELECT round(b.price * COALESCE(p_discount_percentage, 0) / 100, 2) AS reduction,
           'discount'::text AS kind, 'خصم ' || rtrim(rtrim(to_char(COALESCE(p_discount_percentage, 0), 'FM999990.99'), '0'), '.') || '%' AS label,
           NULL::uuid AS promotion_id
    FROM base b WHERE COALESCE(p_discount_percentage, 0) > 0
  ),
  promotion AS (
    SELECT LEAST(b.price, round(CASE WHEN pr.discount_type = 'fixed' THEN pr.discount_value ELSE b.price * pr.discount_value / 100 END, 2)) AS reduction,
           'promotion'::text AS kind, pr.title AS label, pr.id AS promotion_id
    FROM base b, public.promotions pr
    WHERE pr.promotion_type = 'item_discount'
      AND pr.start_date <= now()
      AND (pr.end_date IS NULL OR pr.end_date > now())
      AND pr.discount_value > 0
      AND public.promotion_matches_product(pr.id, p_product_id)
    ORDER BY 1 DESC, pr.created_at
    LIMIT 1
  ),
  winner AS (
    -- Discount first so it wins a tie.
    SELECT * FROM (SELECT reduction, kind, label, promotion_id, 0 AS prio FROM discount
                   UNION ALL SELECT reduction, kind, label, promotion_id, 1 FROM promotion) w
    WHERE reduction > 0 ORDER BY reduction DESC, prio LIMIT 1
  )
  SELECT round(GREATEST(b.price - COALESCE(w.reduction, 0), 0), 2), COALESCE(w.reduction, 0), w.kind, w.label, w.promotion_id
  FROM base b LEFT JOIN winner w ON true;
$$;

REVOKE ALL ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) TO service_role;

-- Cart Promotions ------------------------------------------------------------------------------------
-- Input: [{line_index, product_id, quantity, unit_price, line_reduction}] where unit_price is the base price after
-- the Variant and line_reduction is the item reduction already taken on the line (effective_price x quantity).
-- Output: one row per line a Promotion claims, with that line's share of the Promotion's reduction.
CREATE OR REPLACE FUNCTION public.evaluate_cart_promotions(p_lines jsonb)
RETURNS TABLE(line_index integer, promotion_id uuid, rule_label text, reduction numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_pr record;
  v_elig jsonb;
  v_count integer;
  v_qty integer;
  v_sets integer;
  v_discounted integer;
  v_percent numeric;
  v_base numeric;
  v_unit_sum numeric;
  v_reduction numeric;
  v_line_reduction numeric;
  v_net numeric;
  v_alloc jsonb;
  v_share numeric;
  v_left numeric;
  v_e record;
  v_candidates jsonb := '[]'::jsonb;
  v_chosen jsonb;
  v_used integer[] := '{}';
BEGIN
  FOR v_pr IN
    SELECT pr.id, pr.title, pr.promotion_type, pr.buy_quantity, pr.get_quantity, pr.get_discount_percent,
           pr.tiers, pr.bundle_price, pr.max_applications_per_order
    FROM public.promotions pr
    WHERE pr.promotion_type IN ('buy_x_get_y', 'quantity_tier', 'bundle')
      AND pr.start_date <= now()
      AND (pr.end_date IS NULL OR pr.end_date > now())
    ORDER BY pr.created_at, pr.id
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'line_index', l.line_index, 'product_id', l.product_id, 'quantity', l.quantity,
             'unit_price', l.unit_price, 'base', l.unit_price * l.quantity, 'line_reduction', l.line_reduction)
             ORDER BY l.line_index), '[]'::jsonb)
    INTO v_elig
    FROM jsonb_to_recordset(COALESCE(p_lines, '[]'::jsonb)) AS l(line_index integer, product_id uuid, quantity integer, unit_price numeric, line_reduction numeric)
    WHERE CASE WHEN v_pr.promotion_type = 'bundle'
            THEN l.product_id IN (SELECT bi.product_id FROM public.promotion_bundle_items bi WHERE bi.promotion_id = v_pr.id)
            ELSE public.promotion_matches_product(v_pr.id, l.product_id)
          END;

    v_count := jsonb_array_length(v_elig);
    IF v_count = 0 THEN CONTINUE; END IF;

    SELECT COALESCE(sum(e.quantity), 0)::integer, COALESCE(sum(e.base), 0)
    INTO v_qty, v_base
    FROM jsonb_to_recordset(v_elig) AS e(quantity integer, base numeric);

    IF v_pr.promotion_type = 'buy_x_get_y' THEN
      v_sets := v_qty / (v_pr.buy_quantity + v_pr.get_quantity);
      IF v_pr.max_applications_per_order IS NOT NULL THEN v_sets := LEAST(v_sets, v_pr.max_applications_per_order); END IF;
      v_discounted := v_sets * v_pr.get_quantity;
      IF v_discounted <= 0 THEN CONTINUE; END IF;
      SELECT COALESCE(sum(t.taken * t.unit_price), 0) INTO v_unit_sum
      FROM (
        SELECT e.unit_price,
               GREATEST(0, LEAST(e.quantity, v_discounted - (sum(e.quantity) OVER (ORDER BY e.unit_price, e.line_index ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) - e.quantity))) AS taken
        FROM jsonb_to_recordset(v_elig) AS e(line_index integer, quantity integer, unit_price numeric)
      ) t;
      v_reduction := round(v_unit_sum * v_pr.get_discount_percent / 100, 2);
    ELSIF v_pr.promotion_type = 'quantity_tier' THEN
      SELECT (t.value->>'percent')::numeric INTO v_percent
      FROM jsonb_array_elements(v_pr.tiers) AS t(value)
      WHERE (t.value->>'min_quantity')::integer <= v_qty
      ORDER BY (t.value->>'min_quantity')::integer DESC
      LIMIT 1;
      IF v_percent IS NULL THEN CONTINUE; END IF;
      v_reduction := round(v_base * v_percent / 100, 2);
    ELSE
      SELECT COALESCE(min(FLOOR(COALESCE(h.qty, 0) / n.quantity)), 0)::integer,
             COALESCE(sum(n.quantity * COALESCE(h.base, 0) / NULLIF(h.qty, 0)), 0)
      INTO v_sets, v_unit_sum
      FROM public.promotion_bundle_items n
      LEFT JOIN (
        SELECT e.product_id, sum(e.quantity) AS qty, sum(e.base) AS base
        FROM jsonb_to_recordset(v_elig) AS e(product_id uuid, quantity integer, base numeric)
        GROUP BY e.product_id
      ) h ON h.product_id = n.product_id
      WHERE n.promotion_id = v_pr.id;
      IF v_pr.max_applications_per_order IS NOT NULL THEN v_sets := LEAST(v_sets, v_pr.max_applications_per_order); END IF;
      IF v_sets <= 0 OR v_unit_sum <= v_pr.bundle_price THEN CONTINUE; END IF;
      v_reduction := round(v_sets * (v_unit_sum - v_pr.bundle_price), 2);
    END IF;

    IF v_reduction IS NULL OR v_reduction <= 0 THEN CONTINUE; END IF;

    SELECT COALESCE(sum(e.line_reduction), 0) INTO v_line_reduction FROM jsonb_to_recordset(v_elig) AS e(line_reduction numeric);
    v_net := v_reduction - v_line_reduction;
    IF v_net <= 0 THEN CONTINUE; END IF;

    v_alloc := '[]'::jsonb;
    v_left := v_reduction;
    FOR v_e IN
      SELECT (x.value->>'line_index')::integer AS line_index, (x.value->>'base')::numeric AS base, x.ord
      FROM jsonb_array_elements(v_elig) WITH ORDINALITY AS x(value, ord)
      ORDER BY x.ord
    LOOP
      IF v_e.ord = v_count THEN
        v_share := v_left;
      ELSE
        v_share := round(v_reduction * v_e.base / NULLIF(v_base, 0), 2);
      END IF;
      v_left := v_left - v_share;
      v_alloc := v_alloc || jsonb_build_object('line_index', v_e.line_index, 'reduction', v_share);
    END LOOP;

    v_candidates := v_candidates || jsonb_build_object(
      'promotion_id', v_pr.id, 'title', v_pr.title, 'net', v_net,
      'seq', jsonb_array_length(v_candidates), 'alloc', v_alloc);
  END LOOP;

  -- Greedy: the highest positive net wins its lines outright; any Promotion sharing a claimed line is dropped.
  LOOP
    SELECT c.value INTO v_chosen
    FROM jsonb_array_elements(v_candidates) AS c(value)
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(c.value->'alloc') AS a(value)
      WHERE (a.value->>'line_index')::integer = ANY (v_used)
    )
    ORDER BY (c.value->>'net')::numeric DESC, (c.value->>'seq')::integer
    LIMIT 1;
    EXIT WHEN v_chosen IS NULL;

    RETURN QUERY
      SELECT (a.value->>'line_index')::integer, (v_chosen->>'promotion_id')::uuid, (v_chosen->>'title')::text, (a.value->>'reduction')::numeric
      FROM jsonb_array_elements(v_chosen->'alloc') AS a(value);

    v_used := v_used || ARRAY(SELECT (a.value->>'line_index')::integer FROM jsonb_array_elements(v_chosen->'alloc') AS a(value));
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.evaluate_cart_promotions(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_cart_promotions(jsonb) TO service_role;

-- Shared pricing of a Cart: the same lines, Promotions and reductions for the preview, the coupon check and checkout.
-- Items are merged per (Product, Variant) first, in the order checkout always used. Takes no row locks.
CREATE OR REPLACE FUNCTION public.price_cart_lines(p_items jsonb)
RETURNS TABLE(lines jsonb, base_subtotal numeric, line_reductions numeric)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_row record;
  v_product record;
  v_variant_id text;
  v_variant_name text;
  v_variant_price numeric;
  v_unit_price numeric;
  v_effective_price numeric;
  v_unit_reduction numeric;
  v_rule_kind text;
  v_rule_label text;
  v_promotion_id uuid;
  v_inputs jsonb := '[]'::jsonb;
  v_priced jsonb := '[]'::jsonb;
  v_promotions jsonb;
  v_promo jsonb;
  v_line jsonb;
  v_quantity integer;
  v_contribution numeric;
  v_line_total numeric;
  v_unit_effective numeric;
  v_kind text;
  v_label text;
  v_pid uuid;
  v_ptype text;
  v_base numeric := 0;
  v_reductions numeric := 0;
  v_out jsonb := '[]'::jsonb;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  FOR v_row IN
    SELECT row_number() OVER (ORDER BY m.product_id, m.variant_id) AS line_index, m.product_id, m.variant_id, m.quantity
    FROM (
      SELECT (e.value->>'id')::uuid AS product_id,
             NULLIF(trim(COALESCE(e.value->>'variant_id', '')), '') AS variant_id,
             SUM((e.value->>'quantity')::integer)::integer AS quantity
      FROM jsonb_array_elements(p_items) AS e(value)
      GROUP BY 1, 2
    ) m
    ORDER BY m.product_id, m.variant_id
  LOOP
    IF v_row.quantity IS NULL OR v_row.quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;

    SELECT p.name_ar, p.price, COALESCE(p.discount_percentage, 0) AS discount_percentage, p.category, p.brand, p.is_active, p.variants
    INTO v_product
    FROM public.products p WHERE p.id = v_row.product_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_product.is_active THEN RAISE EXCEPTION 'Product % is no longer available', v_row.product_id; END IF;

    SELECT vl.variant_id, vl.variant_name, vl.variant_price, vl.unit_price
    INTO v_variant_id, v_variant_name, v_variant_price, v_unit_price
    FROM public.variant_line(v_row.product_id, v_product.variants, v_row.variant_id, v_product.price) vl;

    SELECT ep.effective_price, ep.reduction, ep.rule_kind, ep.rule_label, ep.promotion_id
    INTO v_effective_price, v_unit_reduction, v_rule_kind, v_rule_label, v_promotion_id
    FROM public.effective_price(v_row.product_id, v_unit_price, v_product.discount_percentage, v_product.category, v_product.brand) ep;

    v_base := v_base + v_unit_price * v_row.quantity;
    v_inputs := v_inputs || jsonb_build_object(
      'line_index', v_row.line_index, 'product_id', v_row.product_id, 'quantity', v_row.quantity,
      'unit_price', v_unit_price, 'line_reduction', v_unit_reduction * v_row.quantity);
    v_priced := v_priced || jsonb_build_object(
      'line_index', v_row.line_index, 'id', v_row.product_id, 'variant_id', v_variant_id, 'variant_name', v_variant_name,
      'variant_price', v_variant_price, 'quantity', v_row.quantity, 'name_ar', v_product.name_ar, 'unit_price', v_unit_price,
      'discount_percentage', v_product.discount_percentage, 'effective_unit_price', v_effective_price,
      'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label, 'promotion_id', v_promotion_id,
      'line_reduction', v_unit_reduction * v_row.quantity);
  END LOOP;

  SELECT COALESCE(jsonb_object_agg(ev.line_index::text, jsonb_build_object(
           'promotion_id', ev.promotion_id, 'rule_label', ev.rule_label, 'reduction', ev.reduction, 'promotion_type', pr.promotion_type)), '{}'::jsonb)
  INTO v_promotions
  FROM public.evaluate_cart_promotions(v_inputs) ev
  JOIN public.promotions pr ON pr.id = ev.promotion_id;

  FOR v_line IN SELECT b.value FROM jsonb_array_elements(v_priced) AS b(value) LOOP
    v_quantity := (v_line->>'quantity')::integer;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_promo := v_promotions -> (v_line->>'line_index');
    v_ptype := NULL;

    IF v_promo IS NOT NULL THEN
      v_contribution := (v_promo->>'reduction')::numeric;
      v_line_total := round(v_unit_price * v_quantity - v_contribution, 2);
      v_unit_effective := round(v_line_total / v_quantity, 2);
      v_kind := 'promotion';
      v_label := v_promo->>'rule_label';
      v_pid := (v_promo->>'promotion_id')::uuid;
      v_ptype := v_promo->>'promotion_type';
    ELSE
      v_contribution := (v_line->>'line_reduction')::numeric;
      v_unit_effective := (v_line->>'effective_unit_price')::numeric;
      v_line_total := round(v_unit_effective * v_quantity, 2);
      v_kind := v_line->>'pricing_rule_kind';
      v_label := v_line->>'pricing_rule_label';
      v_pid := (v_line->>'promotion_id')::uuid;
      IF v_kind = 'promotion' THEN
        SELECT pr.promotion_type INTO v_ptype FROM public.promotions pr WHERE pr.id = v_pid;
      END IF;
    END IF;

    v_reductions := v_reductions + v_contribution;
    v_out := v_out || (jsonb_build_object(
      'id', v_line->'id', 'variant_id', v_line->'variant_id', 'variant_name', v_line->'variant_name', 'variant_price', v_line->'variant_price',
      'quantity', v_quantity, 'name_ar', v_line->'name_ar', 'unit_price', round(v_unit_price, 2),
      'discount_percentage', v_line->'discount_percentage', 'effective_unit_price', v_unit_effective,
      'pricing_rule_kind', v_kind, 'pricing_rule_label', v_label, 'promotion_id', v_pid, 'line_total', v_line_total)
      || CASE WHEN v_ptype IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('promotion_type', v_ptype) END);
  END LOOP;

  RETURN QUERY SELECT v_out, round(v_base, 2), round(v_reductions, 2);
END;
$$;

REVOKE ALL ON FUNCTION public.price_cart_lines(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.price_cart_lines(jsonb) TO service_role;

-- Checkout -----------------------------------------------------------------------------------------
-- Identical to 20261018000900 (request_hash idempotency, cancelled-order and reuse rejection, warehouse
-- assignment, delivery quote, Coupon, loyalty) except that the lines are priced by price_cart_lines after
-- the product locks are taken, and the Order snapshot is that pricing.
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

  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  SELECT f.warehouse_ids, f.strategy INTO v_wh_ids, v_strategy
  FROM public.resolve_fulfillment_warehouses(v_items, p_customer_lat, p_customer_lng) f;
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

  SELECT * INTO v_quote FROM public.calculate_delivery_quote(v_wh_ids, p_customer_lat, p_customer_lng, v_weight_grams);
  v_shipping := v_quote.fee;

  SELECT w.id INTO v_central_id
  FROM public.warehouses w
  WHERE w.id = ANY(v_wh_ids)
  ORDER BY public.haversine_km(w.latitude, w.longitude, p_customer_lat, p_customer_lng), w.created_at, w.id
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

REVOKE ALL ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, numeric, numeric, text, integer, text) TO authenticated, service_role;

-- Preview ------------------------------------------------------------------------------------------
-- What checkout will charge for the goods, before delivery and loyalty points. A Coupon that wins replaces
-- every line reduction (lines are charged at base price), exactly as checkout_order_safe does.
CREATE OR REPLACE FUNCTION public.preview_cart_pricing(p_items jsonb, p_coupon_code text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_lines jsonb;
  v_base numeric;
  v_reductions numeric;
  v_coupon record;
  v_has_coupon boolean := NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL;
  v_coupon_code text;
  v_coupon_reduction numeric;
  v_coupon_reason text;
  v_subtotal numeric;
  v_applied jsonb;
BEGIN
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;

  SELECT pc.lines, pc.base_subtotal, pc.line_reductions INTO v_lines, v_base, v_reductions
  FROM public.price_cart_lines(p_items) pc;

  v_subtotal := v_base - v_reductions;
  IF v_has_coupon THEN
    SELECT * INTO v_coupon FROM public.evaluate_coupon(p_coupon_code, v_user_id, v_base, v_reductions, false);
    v_coupon_code := v_coupon.code;
    v_coupon_reduction := v_coupon.reduction;
    v_coupon_reason := v_coupon.reason;
    IF v_coupon_reason IS NULL THEN
      SELECT COALESCE(jsonb_agg(
               l || jsonb_build_object('effective_unit_price', (l->>'unit_price')::numeric, 'pricing_rule_kind', NULL, 'pricing_rule_label', NULL, 'promotion_id', NULL, 'promotion_type', NULL,
                                       'line_total', round((l->>'unit_price')::numeric * (l->>'quantity')::integer, 2))
               ORDER BY ord), '[]'::jsonb)
      INTO v_lines FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS t(l, ord);
      v_reductions := 0;
      v_subtotal := v_base - v_coupon_reduction;
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(l.value || jsonb_build_object(
           'line_index', l.ord, 'product_id', l.value->'id', 'promotion_type', l.value->'promotion_type') ORDER BY l.ord), '[]'::jsonb)
  INTO v_lines FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(value, ord);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'promotion_id', a.promotion_id, 'promotion_type', a.promotion_type, 'rule_label', a.rule_label, 'reduction', a.reduction)
           ORDER BY a.first_line), '[]'::jsonb)
  INTO v_applied
  FROM (
    SELECT (l.value->>'promotion_id')::uuid AS promotion_id, l.value->>'promotion_type' AS promotion_type,
           l.value->>'pricing_rule_label' AS rule_label,
           round(sum((l.value->>'unit_price')::numeric * (l.value->>'quantity')::integer - (l.value->>'line_total')::numeric), 2) AS reduction,
           min(l.ord) AS first_line
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS l(value, ord)
    WHERE l.value->>'pricing_rule_kind' = 'promotion'
    GROUP BY 1, 2, 3
  ) a;

  RETURN jsonb_build_object(
    'lines', v_lines,
    'base_subtotal', v_base,
    'line_reductions', v_reductions,
    'subtotal', round(v_subtotal, 2),
    'applied_promotions', v_applied,
    'coupon', CASE WHEN v_has_coupon THEN jsonb_build_object('code', v_coupon_code, 'reduction', v_coupon_reduction, 'reason', v_coupon_reason) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_cart_pricing(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_cart_pricing(jsonb, text) TO anon, authenticated, service_role;

-- preview_coupon keeps its shape; the refusal it reports is the one checkout_order_safe raises.
CREATE OR REPLACE FUNCTION public.preview_coupon(p_code text, p_items jsonb)
RETURNS TABLE(ok boolean, reason text, code text, name text, reduction numeric, base_subtotal numeric, line_reductions numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_base numeric;
  v_lines numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  SELECT pc.base_subtotal, pc.line_reductions INTO v_base, v_lines FROM public.price_cart_lines(p_items) pc;
  RETURN QUERY
    SELECT e.reason IS NULL, e.reason, e.code, e.name, e.reduction, round(v_base, 2), round(v_lines, 2)
    FROM public.evaluate_coupon(p_code, v_user_id, round(v_base, 2), round(v_lines, 2), false) e;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_coupon(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coupon(text, jsonb) TO authenticated, service_role;

-- Offers and admin ---------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_active_promotions();
CREATE FUNCTION public.get_active_promotions()
RETURNS TABLE(id uuid, title text, description text, discount_type text, discount_value numeric, target_kind text, target_value text,
              start_date timestamp with time zone, end_date timestamp with time zone, product_ids uuid[],
              promotion_type text, buy_quantity integer, get_quantity integer, get_discount_percent numeric, tiers jsonb,
              bundle_price numeric, bundle_items jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, pr.title, pr.description, pr.discount_type, pr.discount_value, pr.target_kind, pr.target_value, pr.start_date, pr.end_date,
         COALESCE((
           SELECT array_agg(sample.id ORDER BY sample.created_at DESC)
           FROM (
             SELECT p.id, p.created_at FROM public.products p
             WHERE p.is_active AND public.promotion_matches_product(pr.id, p.id)
             ORDER BY p.created_at DESC
             LIMIT 8
           ) sample
         ), '{}'::uuid[]),
         pr.promotion_type, pr.buy_quantity, pr.get_quantity, pr.get_discount_percent, pr.tiers, pr.bundle_price,
         (SELECT jsonb_agg(jsonb_build_object('product_id', bi.product_id, 'quantity', bi.quantity) ORDER BY bi.product_id)
          FROM public.promotion_bundle_items bi WHERE bi.promotion_id = pr.id)
  FROM public.promotions pr
  WHERE public.promotion_status(pr.start_date, pr.end_date) = 'active'
  ORDER BY pr.discount_value DESC NULLS LAST, pr.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.get_active_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_promotions() TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_get_promotions();
CREATE FUNCTION public.admin_get_promotions()
RETURNS TABLE(id uuid, title text, description text, discount_type text, discount_value numeric, target_kind text, target_value text,
              target_product_ids uuid[], start_date timestamp with time zone, end_date timestamp with time zone,
              created_at timestamp with time zone, status text, promotion_type text, buy_quantity integer, get_quantity integer,
              get_discount_percent numeric, tiers jsonb, bundle_price numeric, max_applications_per_order integer,
              target_category_id uuid, target_brand_id uuid, bundle_items jsonb)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, pr.title, pr.description, pr.discount_type, pr.discount_value, pr.target_kind, pr.target_value, pr.target_product_ids,
         pr.start_date, pr.end_date, pr.created_at, public.promotion_status(pr.start_date, pr.end_date),
         pr.promotion_type, pr.buy_quantity, pr.get_quantity, pr.get_discount_percent, pr.tiers, pr.bundle_price,
         pr.max_applications_per_order, pr.target_category_id, pr.target_brand_id,
         (SELECT jsonb_agg(jsonb_build_object('product_id', bi.product_id, 'quantity', bi.quantity) ORDER BY bi.product_id)
          FROM public.promotion_bundle_items bi WHERE bi.promotion_id = pr.id)
  FROM public.promotions pr
  WHERE public.is_admin()
  ORDER BY CASE public.promotion_status(pr.start_date, pr.end_date) WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, pr.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.admin_get_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_promotions() TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone);
CREATE FUNCTION public.admin_save_promotion(
  p_title text, p_discount_type text, p_discount_value numeric, p_target_kind text,
  p_id uuid DEFAULT NULL, p_description text DEFAULT NULL, p_target_value text DEFAULT NULL, p_target_product_ids uuid[] DEFAULT '{}',
  p_start_date timestamp with time zone DEFAULT NULL, p_end_date timestamp with time zone DEFAULT NULL,
  p_promotion_type text DEFAULT 'item_discount', p_buy_quantity integer DEFAULT NULL, p_get_quantity integer DEFAULT NULL,
  p_get_discount_percent numeric DEFAULT NULL, p_tiers jsonb DEFAULT NULL, p_bundle_items jsonb DEFAULT NULL,
  p_bundle_price numeric DEFAULT NULL, p_max_applications_per_order integer DEFAULT NULL,
  p_target_category_id uuid DEFAULT NULL, p_target_brand_id uuid DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_target_value text := NULLIF(trim(COALESCE(p_target_value, '')), '');
  v_products uuid[] := COALESCE(p_target_product_ids, '{}');
  v_start timestamp with time zone := COALESCE(p_start_date, timezone('utc', now()));
  v_category_id uuid := p_target_category_id;
  v_brand_id uuid := p_target_brand_id;
  v_discount_type text := NULL;
  v_discount_value numeric := NULL;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION 'Promotion title is required'; END IF;
  IF p_promotion_type NOT IN ('item_discount', 'buy_x_get_y', 'quantity_tier', 'bundle') THEN RAISE EXCEPTION 'Promotion kind is invalid'; END IF;
  IF p_target_kind NOT IN ('all', 'category', 'brand', 'products') THEN RAISE EXCEPTION 'Promotion target is invalid'; END IF;

  IF p_promotion_type = 'item_discount' THEN
    IF p_discount_type NOT IN ('percentage', 'fixed') THEN RAISE EXCEPTION 'Promotion type is invalid'; END IF;
    IF COALESCE(p_discount_value, 0) <= 0 OR (p_discount_type = 'percentage' AND p_discount_value > 100) THEN RAISE EXCEPTION 'Promotion value is invalid'; END IF;
    v_discount_type := p_discount_type;
    v_discount_value := p_discount_value;
  END IF;

  IF p_promotion_type = 'buy_x_get_y' THEN
    IF COALESCE(p_buy_quantity, 0) < 1 OR COALESCE(p_get_quantity, 0) < 1 THEN RAISE EXCEPTION 'Promotion buy and get quantities are required'; END IF;
    IF p_get_discount_percent IS NULL OR p_get_discount_percent <= 0 OR p_get_discount_percent > 100 THEN RAISE EXCEPTION 'Promotion get discount is invalid'; END IF;
  END IF;

  IF p_promotion_type = 'quantity_tier' AND NOT public.promotion_tiers_valid(p_tiers) THEN RAISE EXCEPTION 'Promotion tiers are invalid'; END IF;

  IF p_promotion_type = 'bundle' THEN
    IF p_target_kind <> 'products' THEN RAISE EXCEPTION 'Bundle promotions target products'; END IF;
    IF COALESCE(p_bundle_price, 0) <= 0 THEN RAISE EXCEPTION 'Bundle price is invalid'; END IF;
    IF jsonb_typeof(p_bundle_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_bundle_items) = 0 THEN RAISE EXCEPTION 'Bundle needs at least one product'; END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_bundle_items) i WHERE COALESCE((i->>'quantity')::integer, 0) < 1) THEN RAISE EXCEPTION 'Bundle quantities are invalid'; END IF;
    v_products := ARRAY(SELECT (i->>'product_id')::uuid FROM jsonb_array_elements(p_bundle_items) i);
    IF (SELECT count(DISTINCT pid) FROM unnest(v_products) pid) <> cardinality(v_products) THEN RAISE EXCEPTION 'Bundle product is repeated'; END IF;
  END IF;

  IF p_target_kind = 'category' THEN
    IF v_category_id IS NOT NULL THEN
      SELECT c.name_ar INTO v_target_value FROM public.categories c WHERE c.id = v_category_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Promotion category not found'; END IF;
    ELSIF v_target_value IS NOT NULL THEN
      SELECT c.id INTO v_category_id FROM public.categories c WHERE lower(btrim(c.name_ar)) = lower(v_target_value) LIMIT 1;
    END IF;
  END IF;

  IF p_target_kind = 'brand' THEN
    IF v_brand_id IS NOT NULL THEN
      SELECT b.name_ar INTO v_target_value FROM public.brands b WHERE b.id = v_brand_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Promotion brand not found'; END IF;
    ELSIF v_target_value IS NOT NULL THEN
      SELECT b.id INTO v_brand_id FROM public.brands b WHERE lower(btrim(b.name_ar)) = lower(v_target_value) LIMIT 1;
    END IF;
  END IF;

  IF p_target_kind IN ('category', 'brand') AND v_target_value IS NULL THEN RAISE EXCEPTION 'Promotion target value is required'; END IF;
  IF p_target_kind = 'products' AND cardinality(v_products) = 0 THEN RAISE EXCEPTION 'Promotion needs at least one product'; END IF;
  IF p_target_kind = 'products' AND EXISTS (SELECT 1 FROM unnest(v_products) pid WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pid)) THEN RAISE EXCEPTION 'Promotion product not found'; END IF;
  IF p_target_kind NOT IN ('category', 'brand') THEN v_target_value := NULL; END IF;
  IF p_target_kind <> 'category' THEN v_category_id := NULL; END IF;
  IF p_target_kind <> 'brand' THEN v_brand_id := NULL; END IF;
  IF p_target_kind <> 'products' THEN v_products := '{}'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date <= v_start THEN RAISE EXCEPTION 'Promotion window is invalid'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (title, description, promotion_type, discount_type, discount_value, buy_quantity, get_quantity, get_discount_percent,
                                   tiers, bundle_price, max_applications_per_order, target_kind, target_value, target_category_id, target_brand_id,
                                   target_product_ids, start_date, end_date)
    VALUES (trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''), p_promotion_type, v_discount_type, v_discount_value,
            CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_buy_quantity END,
            CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_get_quantity END,
            CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_get_discount_percent END,
            CASE WHEN p_promotion_type = 'quantity_tier' THEN p_tiers END,
            CASE WHEN p_promotion_type = 'bundle' THEN p_bundle_price END,
            CASE WHEN p_promotion_type IN ('buy_x_get_y', 'bundle') THEN p_max_applications_per_order END,
            p_target_kind, v_target_value, v_category_id, v_brand_id, v_products, v_start, p_end_date)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions SET
      title = trim(p_title), description = NULLIF(trim(COALESCE(p_description, '')), ''), promotion_type = p_promotion_type,
      discount_type = v_discount_type, discount_value = v_discount_value,
      buy_quantity = CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_buy_quantity END,
      get_quantity = CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_get_quantity END,
      get_discount_percent = CASE WHEN p_promotion_type = 'buy_x_get_y' THEN p_get_discount_percent END,
      tiers = CASE WHEN p_promotion_type = 'quantity_tier' THEN p_tiers END,
      bundle_price = CASE WHEN p_promotion_type = 'bundle' THEN p_bundle_price END,
      max_applications_per_order = CASE WHEN p_promotion_type IN ('buy_x_get_y', 'bundle') THEN p_max_applications_per_order END,
      target_kind = p_target_kind, target_value = v_target_value, target_category_id = v_category_id, target_brand_id = v_brand_id,
      target_product_ids = v_products, start_date = v_start, end_date = p_end_date
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Promotion not found'; END IF;
    DELETE FROM public.promotion_bundle_items WHERE promotion_id = v_id;
  END IF;

  IF p_promotion_type = 'bundle' THEN
    INSERT INTO public.promotion_bundle_items (promotion_id, product_id, quantity)
    SELECT v_id, (i->>'product_id')::uuid, (i->>'quantity')::integer FROM jsonb_array_elements(p_bundle_items) i;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone, text, integer, integer, numeric, jsonb, jsonb, numeric, integer, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone, text, integer, integer, numeric, jsonb, jsonb, numeric, integer, uuid, uuid) TO authenticated, service_role;

-- DOWN (manual):
--   Restore preview_coupon from 20260920001700_variants.sql, checkout_order_safe (12-argument) from 20261018000900_checkout_idempotency_payload_hash.sql,
--   effective_price from 20260920001900_promotions.sql, get_active_promotions from 20260920002500_active_promotions.sql,
--   admin_get_promotions and admin_save_promotion from 20260920001900_promotions.sql, then:
--   DROP FUNCTION public.preview_cart_pricing(jsonb, text);
--   DROP FUNCTION public.price_cart_lines(jsonb);
--   DROP FUNCTION public.evaluate_cart_promotions(jsonb);
