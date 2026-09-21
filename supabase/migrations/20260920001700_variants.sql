-- 0017 Variant-aware checkout (T2-09).
-- Variants stay on products.variants (jsonb); this migration fixes their shape so a Variant can be
-- referenced by id and priced: [{id, name_ar, name_en?, price?}]. The public catalogue
-- reports each Variant's effective price (its own price, or the Product's, through effective_price),
-- checkout accepts an optional variant_id per line, refuses a Variant of another Product, charges
-- the Variant's price and snapshots its id and name into the Order item. Stock is still reserved
-- and released per Product per warehouse (ADR 0001): two Variants of one Product are two Order
-- lines that draw on the same count.

-- Shape ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.variants_are_valid(p_variants jsonb) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT p_variants IS NOT NULL
     AND jsonb_typeof(p_variants) = 'array'
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(p_variants) v
       WHERE jsonb_typeof(v) <> 'object'
          OR length(trim(coalesce(v->>'id', ''))) = 0
          OR length(trim(coalesce(v->>'name_ar', ''))) = 0
          OR (v ? 'price' AND jsonb_typeof(v->'price') NOT IN ('number', 'null'))
          OR (CASE WHEN jsonb_typeof(v->'price') = 'number' THEN (v->>'price')::numeric < 0 ELSE false END)
     )
     AND (SELECT count(*) = count(DISTINCT v->>'id') FROM jsonb_array_elements(p_variants) v);
$$;

-- Rows written before this ticket: {name, value} pairs (and null). Keep the Arabic label, give
-- each an id so it can be ordered. A legacy row whose `name` was the attribute (e.g. "الدرجة")
-- rather than the option keeps that label until staff rename it in the Product form.
UPDATE public.products
SET variants = COALESCE((
  SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'id', COALESCE(NULLIF(trim(v->>'id'), ''), gen_random_uuid()::text),
           'name_ar', COALESCE(NULLIF(trim(v->>'name_ar'), ''), NULLIF(trim(v->>'name'), ''), NULLIF(trim(v->>'value'), ''), 'خيار'),
           'name_en', COALESCE(NULLIF(trim(v->>'name_en'), ''), NULLIF(trim(v->>'value'), '')),
           'price', CASE WHEN jsonb_typeof(v->'price') = 'number' THEN v->'price'
                         WHEN jsonb_typeof(v->'priceOverride') = 'number' THEN v->'priceOverride' END
         )) ORDER BY ord)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(variants) = 'array' THEN variants ELSE '[]'::jsonb END) WITH ORDINALITY t(v, ord)
  WHERE jsonb_typeof(v) = 'object'
), '[]'::jsonb)
WHERE NOT public.variants_are_valid(variants);

ALTER TABLE public.products ALTER COLUMN variants SET DEFAULT '[]'::jsonb;
ALTER TABLE public.products ALTER COLUMN variants SET NOT NULL;
ALTER TABLE public.products ADD CONSTRAINT products_variants_shape CHECK (public.variants_are_valid(variants));

-- Pure lookups (no table access, so no SECURITY DEFINER): only the owner-executed RPCs call them.
CREATE OR REPLACE FUNCTION public.product_variant(p_variants jsonb, p_variant_id text) RETURNS jsonb
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT v FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb)) v WHERE v->>'id' = p_variant_id LIMIT 1;
$$;

-- One place resolves a checkout line's Variant: it must belong to the Product, its price (when set)
-- replaces the Product's before the Pricing Rule. Used by checkout_order and preview_coupon.
CREATE OR REPLACE FUNCTION public.variant_line(p_product_id uuid, p_variants jsonb, p_variant_id text, p_product_price numeric)
RETURNS TABLE(variant_id text, variant_name text, variant_price numeric, unit_price numeric)
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE v_id text := NULLIF(trim(coalesce(p_variant_id, '')), ''); v_variant jsonb;
BEGIN
  IF v_id IS NULL THEN RETURN QUERY SELECT NULL::text, NULL::text, NULL::numeric, p_product_price; RETURN; END IF;
  v_variant := public.product_variant(p_variants, v_id);
  IF v_variant IS NULL THEN RAISE EXCEPTION 'Variant not found for product %', p_product_id; END IF;
  RETURN QUERY SELECT v_id, v_variant->>'name_ar', (v_variant->>'price')::numeric, COALESCE((v_variant->>'price')::numeric, p_product_price);
END;
$$;

-- Catalogue ------------------------------------------------------------------------------------

-- Each Variant carries the price the customer will pay for it: its own price (or the Product's)
-- through the same Pricing Rule resolution as the Product.
CREATE OR REPLACE FUNCTION public.public_variants(p_product_id uuid, p_variants jsonb, p_price numeric, p_discount_percentage numeric, p_category text, p_brand text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object('id', v->>'id', 'name_ar', v->>'name_ar', 'name_en', v->>'name_en', 'price', v->'price',
                              'effective_price', ep.effective_price, 'pricing_rule_kind', ep.rule_kind, 'pricing_rule_label', ep.rule_label)
           ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_variants, '[]'::jsonb)) WITH ORDINALITY t(v, ord)
  CROSS JOIN LATERAL public.effective_price(p_product_id, COALESCE((v->>'price')::numeric, p_price), p_discount_percentage, p_category, p_brand) ep;
$$;

REVOKE ALL ON FUNCTION public.public_variants(uuid, jsonb, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_variants(uuid, jsonb, numeric, numeric, text, text) TO service_role;
-- The CHECK runs as whoever writes products (staff), so the validator stays executable by authenticated.
REVOKE ALL ON FUNCTION public.variants_are_valid(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.variants_are_valid(jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.product_variant(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_variant(jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.variant_line(uuid, jsonb, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.variant_line(uuid, jsonb, text, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.get_public_products() RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at,
         public.public_variants(p.id, p.variants, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand),
         ep.effective_price, ep.rule_kind, ep.rule_label
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.is_active
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_products() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_public_product(p_product_id uuid) RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at,
         public.public_variants(p.id, p.variants, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand),
         ep.effective_price, ep.rule_kind, ep.rule_label
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.id = p_product_id AND p.is_active;
$$;

REVOKE ALL ON FUNCTION public.get_public_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product(uuid) TO anon, authenticated, service_role;

-- Reviews are per Product: an Order with two Variants of one Product lists it once.
CREATE OR REPLACE FUNCTION public.get_reviewable_order_items() RETURNS TABLE(order_id uuid, order_number text, product_id uuid, product_name_ar text, product_image text, has_review boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT DISTINCT ON (o.created_at, p.name_ar, o.id, p.id)
         o.id,
         COALESCE(o.order_number, 'طلب تيبس'),
         p.id,
         p.name_ar,
         p.image,
         EXISTS (SELECT 1 FROM public.reviews r WHERE r.order_id = o.id AND r.product_id = p.id AND r.user_id = auth.uid()) AS has_review
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
  JOIN public.products p ON p.id = (item->>'id')::uuid
  WHERE o.customer_id = auth.uid()
    AND o.status = 'delivered'
  ORDER BY o.created_at DESC, p.name_ar ASC, o.id, p.id;
$$;

REVOKE ALL ON FUNCTION public.get_reviewable_order_items() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reviewable_order_items() TO authenticated, service_role;

-- Coupon preview: a Variant's price is the line's base price.
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
  v_price numeric;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_qty := GREATEST(COALESCE((v_item->>'quantity')::integer, 0), 0);
    SELECT p.price, COALESCE(p.discount_percentage, 0) AS discount_percentage, p.category, p.brand, p.is_active, p.variants INTO v_p
    FROM public.products p WHERE p.id = (v_item->>'id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_p.is_active THEN RAISE EXCEPTION 'Product % is no longer available', (v_item->>'id'); END IF;
    SELECT vl.unit_price INTO v_price FROM public.variant_line((v_item->>'id')::uuid, v_p.variants, v_item->>'variant_id', v_p.price) vl;
    SELECT * INTO v_ep FROM public.effective_price((v_item->>'id')::uuid, v_price, v_p.discount_percentage, v_p.category, v_p.brand);
    v_base := v_base + v_price * v_qty;
    v_lines := v_lines + v_ep.reduction * v_qty;
  END LOOP;
  RETURN QUERY
    SELECT e.reason IS NULL, e.reason, e.code, e.name, e.reduction, round(v_base, 2), round(v_lines, 2)
    FROM public.evaluate_coupon(p_code, v_user_id, round(v_base, 2), round(v_lines, 2), false) e;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_coupon(text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_coupon(text, jsonb) TO authenticated, service_role;

-- Checkout -------------------------------------------------------------------------------------

-- checkout_order_safe: identical to the baseline except lines are merged per (Product, Variant)
-- instead of per Product, and the variant_id travels to checkout_order.
CREATE OR REPLACE FUNCTION public.checkout_order_safe(p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0, p_idempotency_key text DEFAULT NULL::text) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
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
    p_payment_method, v_items, p_coupon_code, p_points_to_redeem
  );

  UPDATE public.checkout_idempotency
  SET order_id = v_result.order_id
  WHERE customer_id = v_user_id AND idempotency_key = trim(p_idempotency_key);

  RETURN QUERY SELECT v_result.order_id, v_result.order_number, v_result.total,
                      v_result.shipping_fee, v_result.discount_amount, v_result.points_discount;
END;
$$;

REVOKE ALL ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.checkout_order_safe(text, text, text, text, text, text, jsonb, text, integer, text) TO authenticated, service_role;

-- checkout_order: identical to 0016 except (1) the warehouse (or, without warehouse rows, the
-- Product's own stock) must cover each Product's summed quantity across its lines, (2) a line may
-- name a Variant (variant_line): it must belong to the Product, its price (when set) replaces the
-- Product's before the Pricing Rule, and its id, name and price are snapshotted; later edits to
-- the Variant never touch the Order.
CREATE OR REPLACE FUNCTION public.checkout_order(p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_item jsonb; v_product_id uuid; v_quantity integer; v_unit_price numeric; v_discount numeric; v_stock integer; v_name text; v_active boolean; v_subtotal numeric := 0; v_base_subtotal numeric := 0; v_line_reductions numeric := 0; v_shipping numeric := 1500; v_order_id uuid; v_order_number text; v_warehouse_id uuid; v_has_warehouse_inventory boolean; v_coupon record; v_coupon_id uuid; v_coupon_code text; v_coupon_discount numeric := 0; v_points integer := 0; v_points_discount numeric := 0; v_point_value numeric; v_minimum_points integer; v_items_snapshot jsonb := '[]'::jsonb; v_line_price numeric; v_category text; v_brand text; v_rule_kind text; v_rule_label text; v_promotion_id uuid; v_line_reduction numeric; v_variants jsonb; v_variant_id text; v_variant_name text; v_variant_price numeric; v_needed integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN RAISE EXCEPTION 'Phone is required'; END IF;
  IF p_shipping_address IS NULL OR length(trim(p_shipping_address)) < 5 THEN RAISE EXCEPTION 'Shipping address is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = p_payment_method AND is_active) THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;
  IF p_points_to_redeem < 0 THEN RAISE EXCEPTION 'Points cannot be negative'; END IF;
  SELECT dz.fee INTO v_shipping FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1; v_shipping := COALESCE(v_shipping, 1500); SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;
  IF v_has_warehouse_inventory THEN SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.is_active AND NOT EXISTS (SELECT 1 FROM (SELECT (ci->>'id')::uuid AS product_id, SUM((ci->>'quantity')::integer) AS quantity FROM jsonb_array_elements(p_items) ci GROUP BY 1) need WHERE NOT EXISTS (SELECT 1 FROM public.warehouse_inventory wi WHERE wi.warehouse_id = w.id AND wi.product_id = need.product_id AND wi.quantity >= need.quantity)) ORDER BY CASE WHEN lower(w.city) = lower(coalesce(p_city, '')) THEN 0 ELSE 1 END, CASE WHEN lower(w.state) = lower(coalesce(p_state, '')) THEN 0 ELSE 1 END, w.created_at LIMIT 1; IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock, p.name_ar, p.is_active, p.category, p.brand, p.variants INTO v_unit_price, v_discount, v_stock, v_name, v_active, v_category, v_brand, v_variants FROM public.products p WHERE p.id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_active THEN RAISE EXCEPTION 'Product % is no longer available', v_product_id; END IF;
    -- Variant (T2-09): must belong to this Product; its price wins over the Product's.
    SELECT vl.variant_id, vl.variant_name, vl.variant_price, vl.unit_price INTO v_variant_id, v_variant_name, v_variant_price, v_unit_price
    FROM public.variant_line(v_product_id, v_variants, v_item->>'variant_id', v_unit_price) vl;
    -- Stock is per Product: every line of this Product counts against the same number.
    SELECT SUM((ci->>'quantity')::integer) INTO v_needed FROM jsonb_array_elements(p_items) ci WHERE (ci->>'id')::uuid = v_product_id;
    IF NOT v_has_warehouse_inventory AND COALESCE(v_stock, 0) < v_needed THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;
    -- The same Pricing Rule resolution the catalogue showed (T2-07).
    SELECT ep.effective_price, ep.reduction, ep.rule_kind, ep.rule_label, ep.promotion_id INTO v_line_price, v_line_reduction, v_rule_kind, v_rule_label, v_promotion_id
    FROM public.effective_price(v_product_id, v_unit_price, v_discount, v_category, v_brand) ep;
    v_base_subtotal := v_base_subtotal + v_unit_price * v_quantity;
    v_line_reductions := v_line_reductions + v_line_reduction * v_quantity;
    v_items_snapshot := v_items_snapshot || jsonb_build_object('id', v_product_id, 'variant_id', v_variant_id, 'variant_name', v_variant_name, 'variant_price', v_variant_price, 'quantity', v_quantity, 'name_ar', v_name, 'unit_price', round(v_unit_price, 2), 'discount_percentage', v_discount, 'effective_unit_price', v_line_price, 'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label, 'promotion_id', v_promotion_id, 'line_total', round(v_line_price * v_quantity, 2));
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

REVOKE ALL ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.checkout_order(text, text, text, text, text, text, jsonb, text, integer) TO service_role;

-- DOWN:
--   recreate checkout_order and preview_coupon from 20260920001600, checkout_order_safe and
--   get_reviewable_order_items from the baseline, get_public_products/get_public_product from 20260920001500;
--   ALTER TABLE public.products DROP CONSTRAINT products_variants_shape;
--   ALTER TABLE public.products ALTER COLUMN variants DROP NOT NULL;
--   DROP FUNCTION public.public_variants(uuid, jsonb, numeric, numeric, text, text);
--   DROP FUNCTION public.variant_line(uuid, jsonb, text, numeric);
--   DROP FUNCTION public.product_variant(jsonb, text);
--   DROP FUNCTION public.variants_are_valid(jsonb);
