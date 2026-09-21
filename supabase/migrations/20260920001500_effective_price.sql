-- 0015 Pricing Rule function and effective price (T2-07).
-- One function decides a Product's effective unit price from its Discount and the active
-- Promotions: the largest single reduction wins, nothing stacks. The public catalogue RPCs expose
-- the result and the winning rule's label, and checkout_order charges the same number, so the
-- price a customer sees is the price they pay. Promotions currently match on target_group = 'all'
-- (the only target the table has); T2-10 widens the match to categories, brands and products.
-- Coupons are Order-level and stay in checkout_order (T2-08).

CREATE OR REPLACE FUNCTION public.effective_price(
  p_product_id uuid, p_base_price numeric, p_discount_percentage numeric, p_category text, p_brand text
) RETURNS TABLE(effective_price numeric, reduction numeric, rule_kind text, rule_label text, promotion_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (SELECT GREATEST(COALESCE(p_base_price, 0), 0) AS price),
  discount AS (
    SELECT round(b.price * COALESCE(p_discount_percentage, 0) / 100, 2) AS reduction,
           'discount'::text AS kind, 'خصم ' || trim(to_char(COALESCE(p_discount_percentage, 0), 'FM999990.##')) || '%' AS label,
           NULL::uuid AS promotion_id
    FROM base b WHERE COALESCE(p_discount_percentage, 0) > 0
  ),
  promotion AS (
    SELECT LEAST(b.price, round(CASE WHEN pr.discount_type = 'fixed' THEN pr.discount_value ELSE b.price * pr.discount_value / 100 END, 2)) AS reduction,
           'promotion'::text AS kind, pr.title AS label, pr.id AS promotion_id
    FROM base b, public.promotions pr
    WHERE pr.status = 'active'
      AND COALESCE(pr.start_date, pr.created_at) <= now()
      AND (pr.end_date IS NULL OR pr.end_date > now())
      AND pr.discount_value > 0
      AND COALESCE(pr.target_group, 'all') = 'all'
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

REVOKE ALL ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) TO anon, authenticated, service_role;

-- Public catalogue: same columns as before plus the effective price and the winning rule.
DROP FUNCTION IF EXISTS public.get_public_products();
CREATE FUNCTION public.get_public_products() RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at, p.variants,
         ep.effective_price, ep.rule_kind, ep.rule_label
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.is_active
  ORDER BY p.created_at DESC;
$$;

DROP FUNCTION IF EXISTS public.get_public_product(uuid);
CREATE FUNCTION public.get_public_product(p_product_id uuid) RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at, p.variants,
         ep.effective_price, ep.rule_kind, ep.rule_label
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.id = p_product_id AND p.is_active;
$$;

REVOKE ALL ON FUNCTION public.get_public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_products() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product(uuid) TO anon, authenticated, service_role;

-- checkout_order: identical to 0007 except each line's price comes from effective_price() and the
-- snapshot records the effective unit price and the winning rule.
CREATE OR REPLACE FUNCTION public.checkout_order(p_customer_name text, p_phone text, p_shipping_address text, p_city text, p_state text, p_payment_method text, p_items jsonb, p_coupon_code text DEFAULT NULL::text, p_points_to_redeem integer DEFAULT 0) RETURNS TABLE(order_id uuid, order_number text, total numeric, shipping_fee numeric, discount_amount numeric, points_discount numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_item jsonb; v_product_id uuid; v_quantity integer; v_unit_price numeric; v_discount numeric; v_stock integer; v_name text; v_active boolean; v_subtotal numeric := 0; v_shipping numeric := 1500; v_order_id uuid; v_order_number text; v_warehouse_id uuid; v_has_warehouse_inventory boolean; v_coupon public.coupons%ROWTYPE; v_coupon_discount numeric := 0; v_points integer := 0; v_points_discount numeric := 0; v_point_value numeric; v_minimum_points integer; v_items_snapshot jsonb := '[]'::jsonb; v_line_price numeric; v_category text; v_brand text; v_rule_kind text; v_rule_label text;
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
    SELECT ep.effective_price, ep.rule_kind, ep.rule_label INTO v_line_price, v_rule_kind, v_rule_label
    FROM public.effective_price(v_product_id, v_unit_price, v_discount, v_category, v_brand) ep;
    v_subtotal := v_subtotal + v_line_price * v_quantity;
    v_items_snapshot := v_items_snapshot || jsonb_build_object('id', v_product_id, 'quantity', v_quantity, 'name_ar', v_name, 'unit_price', round(v_unit_price, 2), 'discount_percentage', v_discount, 'effective_unit_price', v_line_price, 'pricing_rule_kind', v_rule_kind, 'pricing_rule_label', v_rule_label, 'line_total', round(v_line_price * v_quantity, 2));
  END LOOP;
  IF NULLIF(trim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN SELECT * INTO v_coupon FROM public.coupons WHERE code = upper(trim(p_coupon_code)) AND is_active AND starts_at <= timezone('utc', now()) AND (ends_at IS NULL OR ends_at >= timezone('utc', now())) FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Coupon is invalid or expired'; END IF; IF v_subtotal < v_coupon.min_order_amount THEN RAISE EXCEPTION 'Coupon minimum order amount was not reached'; END IF; IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit has been reached'; END IF; IF (SELECT count(*) FROM public.coupon_redemptions WHERE coupon_id = v_coupon.id AND customer_id = v_user_id) >= v_coupon.per_user_limit THEN RAISE EXCEPTION 'Coupon usage limit for this account has been reached'; END IF; v_coupon_discount := CASE WHEN v_coupon.discount_type = 'percentage' THEN v_subtotal * v_coupon.discount_value / 100 ELSE v_coupon.discount_value END; IF v_coupon.max_discount_amount IS NOT NULL THEN v_coupon_discount := LEAST(v_coupon_discount, v_coupon.max_discount_amount); END IF; v_coupon_discount := LEAST(v_coupon_discount, v_subtotal); END IF;
  SELECT beauty_points INTO v_points FROM public.profiles WHERE id = v_user_id FOR UPDATE; SELECT currency_per_point, minimum_redemption_points INTO v_point_value, v_minimum_points FROM public.loyalty_settings WHERE id = true; IF p_points_to_redeem > 0 THEN IF p_points_to_redeem < v_minimum_points THEN RAISE EXCEPTION 'Minimum points for redemption was not reached'; END IF; IF p_points_to_redeem > COALESCE(v_points, 0) THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF; v_points_discount := LEAST(p_points_to_redeem * v_point_value, GREATEST(v_subtotal - v_coupon_discount, 0)); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer; IF v_has_warehouse_inventory THEN UPDATE public.warehouse_inventory SET quantity = quantity - v_quantity, updated_at = timezone('utc', now()) WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND quantity >= v_quantity; IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF; ELSE UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id; END IF; END LOOP;
  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.orders (customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method, payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id, coupon_code, discount_amount, points_redeemed, points_discount) VALUES (v_user_id, trim(p_customer_name), trim(p_phone), v_items_snapshot, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state, v_order_number, v_warehouse_id, NULLIF(upper(trim(coalesce(p_coupon_code, ''))), ''), round(v_coupon_discount, 2), p_points_to_redeem, round(v_points_discount, 2)) RETURNING id INTO v_order_id;
  IF v_coupon.id IS NOT NULL THEN UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon.id; INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount) VALUES (v_coupon.id, v_order_id, v_user_id, v_coupon_discount); END IF;
  IF p_points_to_redeem > 0 THEN UPDATE public.profiles SET beauty_points = beauty_points - p_points_to_redeem WHERE id = v_user_id; INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by) VALUES (v_user_id, v_order_id, -p_points_to_redeem, 'redeem', 'استبدال نقاط عند إنشاء الطلب', v_user_id); END IF;
  IF v_has_warehouse_inventory THEN FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by) VALUES (v_warehouse_id, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id); END LOOP; END IF;
  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);
  RETURN QUERY SELECT v_order_id, v_order_number, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, round(v_coupon_discount, 2), round(v_points_discount, 2);
END; $$;

-- DOWN:
--   recreate checkout_order, get_public_products, get_public_product from 20260920000700;
--   DROP FUNCTION public.effective_price(uuid, numeric, numeric, text, text);
