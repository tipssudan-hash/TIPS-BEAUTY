


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE EXTENSION IF NOT EXISTS "pg_net" WITH SCHEMA "extensions";






COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."adjust_loyalty_points"("p_customer_id" "uuid", "p_points_delta" integer, "p_note" "text") RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_balance integer; BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; IF p_points_delta = 0 THEN RAISE EXCEPTION 'Points change cannot be zero'; END IF; UPDATE public.profiles SET beauty_points = COALESCE(beauty_points, 0) + p_points_delta WHERE id = p_customer_id AND COALESCE(beauty_points, 0) + p_points_delta >= 0 RETURNING beauty_points INTO v_balance; IF v_balance IS NULL THEN RAISE EXCEPTION 'Customer not found'; END IF; INSERT INTO public.loyalty_ledger (customer_id, points_delta, event_type, note, created_by) VALUES (p_customer_id, p_points_delta, 'adjustment', NULLIF(trim(p_note), ''), (SELECT auth.uid())); RETURN v_balance; END; $$;


ALTER FUNCTION "public"."adjust_loyalty_points"("p_customer_id" "uuid", "p_points_delta" integer, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."adjust_warehouse_inventory"("p_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity_delta" integer, "p_note" "text" DEFAULT NULL::"text", "p_reorder_level" integer DEFAULT NULL::integer) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_quantity integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_quantity_delta = 0 THEN RAISE EXCEPTION 'Quantity change cannot be zero'; END IF;

  IF p_quantity_delta > 0 THEN
    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity, reorder_level)
    VALUES (p_warehouse_id, p_product_id, p_quantity_delta, COALESCE(p_reorder_level, 0))
    ON CONFLICT (warehouse_id, product_id) DO UPDATE
      SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
          reorder_level = COALESCE(p_reorder_level, public.warehouse_inventory.reorder_level),
          updated_at = timezone('utc', now())
    RETURNING quantity INTO v_quantity;
  ELSE
    UPDATE public.warehouse_inventory
    SET quantity = quantity + p_quantity_delta,
        reorder_level = COALESCE(p_reorder_level, reorder_level),
        updated_at = timezone('utc', now())
    WHERE warehouse_id = p_warehouse_id
      AND product_id = p_product_id
      AND quantity + p_quantity_delta >= 0
    RETURNING quantity INTO v_quantity;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock at this warehouse'; END IF;
  END IF;

  INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, created_by)
  VALUES (p_warehouse_id, p_product_id, p_quantity_delta, 'adjustment', p_note, (SELECT auth.uid()));
  RETURN v_quantity;
END;
$$;


ALTER FUNCTION "public"."adjust_warehouse_inventory"("p_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity_delta" integer, "p_note" "text", "p_reorder_level" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_business_report"("p_start" "date" DEFAULT (CURRENT_DATE - 30), "p_end" "date" DEFAULT CURRENT_DATE) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_report jsonb; BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; SELECT jsonb_build_object('revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'), 0), 'paid_revenue', COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0), 'orders', COUNT(*), 'delivered_orders', COUNT(*) FILTER (WHERE o.status = 'delivered'), 'pending_payments', COUNT(*) FILTER (WHERE o.payment_status IN ('pending', 'proof_submitted')), 'returns', (SELECT COUNT(*) FROM public.order_returns r WHERE r.created_at::date BETWEEN p_start AND p_end), 'by_city', COALESCE((SELECT jsonb_agg(city_row ORDER BY (city_row->>'revenue')::numeric DESC) FROM (SELECT jsonb_build_object('city', COALESCE(city, 'غير محدد'), 'orders', COUNT(*), 'revenue', COALESCE(SUM(total), 0)) AS city_row FROM public.orders WHERE created_at::date BETWEEN p_start AND p_end AND status <> 'cancelled' GROUP BY city) s), '[]'::jsonb), 'low_stock', COALESCE((SELECT jsonb_agg(stock_row) FROM (SELECT jsonb_build_object('product_id', wi.product_id, 'product_name', p.name_ar, 'warehouse', w.name, 'quantity', wi.quantity, 'reorder_level', wi.reorder_level) AS stock_row FROM public.warehouse_inventory wi JOIN public.products p ON p.id = wi.product_id JOIN public.warehouses w ON w.id = wi.warehouse_id WHERE wi.quantity <= wi.reorder_level ORDER BY wi.quantity ASC LIMIT 10) l), '[]'::jsonb)) INTO v_report FROM public.orders o WHERE o.created_at::date BETWEEN p_start AND p_end; RETURN COALESCE(v_report, '{}'::jsonb); END; $$;


ALTER FUNCTION "public"."admin_business_report"("p_start" "date", "p_end" "date") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_update_order_operation"("p_order_id" "uuid", "p_expected_status" "text", "p_status" "text" DEFAULT NULL::"text", "p_driver_id" "uuid" DEFAULT NULL::"uuid", "p_warehouse_id" "uuid" DEFAULT NULL::"uuid", "p_note" "text" DEFAULT NULL::"text") RETURNS TABLE("id" "uuid", "status" "text", "driver_id" "uuid", "fulfillment_warehouse_id" "uuid", "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next_status text;
  v_next_driver uuid;
  v_next_warehouse uuid;
  v_driver_warehouse uuid;
  v_driver_status text;
  v_changed boolean := false;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_expected_status IS NOT NULL AND p_expected_status <> v_order.status THEN RAISE EXCEPTION 'This order was updated by another user; reload and try again'; END IF;
  v_next_status := COALESCE(NULLIF(trim(p_status), ''), v_order.status);
  v_next_driver := COALESCE(p_driver_id, v_order.driver_id);
  v_next_warehouse := COALESCE(p_warehouse_id, v_order.fulfillment_warehouse_id);
  IF p_status IS NOT NULL AND p_status <> v_order.status THEN
    IF NOT (
      (v_order.status = 'new' AND v_next_status IN ('confirmed', 'cancelled')) OR
      (v_order.status = 'confirmed' AND v_next_status IN ('preparing', 'cancelled', 'shipped')) OR
      (v_order.status = 'preparing' AND v_next_status IN ('shipped', 'cancelled')) OR
      (v_order.status = 'shipped' AND v_next_status IN ('delivered', 'delivery_failed')) OR
      (v_order.status = 'delivery_failed' AND v_next_status IN ('confirmed', 'cancelled'))
    ) THEN RAISE EXCEPTION 'This status transition is not allowed'; END IF;
  END IF;
  IF (p_driver_id IS NOT NULL AND p_driver_id IS DISTINCT FROM v_order.driver_id)
     OR (p_warehouse_id IS NOT NULL AND p_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id) THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'delivery_failed') THEN RAISE EXCEPTION 'Assignments cannot change after delivery has started'; END IF;
  END IF;
  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses AS w WHERE w.id = p_warehouse_id AND w.is_active) THEN RAISE EXCEPTION 'Selected warehouse is not active'; END IF;
  IF p_driver_id IS NOT NULL THEN
    SELECT d.warehouse_id, d.status INTO v_driver_warehouse, v_driver_status FROM public.drivers AS d WHERE d.id = p_driver_id FOR UPDATE;
    IF NOT FOUND OR v_driver_status NOT IN ('active', 'busy') THEN RAISE EXCEPTION 'Selected driver is not available'; END IF;
    IF v_driver_warehouse IS NOT NULL AND v_next_warehouse IS NOT NULL AND v_driver_warehouse <> v_next_warehouse THEN RAISE EXCEPTION 'Selected driver is assigned to another warehouse'; END IF;
  END IF;
  IF v_next_status = 'shipped' AND v_next_driver IS NULL THEN RAISE EXCEPTION 'Assign a driver before starting delivery'; END IF;
  UPDATE public.orders AS o SET status = v_next_status, driver_id = v_next_driver, fulfillment_warehouse_id = v_next_warehouse WHERE o.id = v_order.id
  RETURNING o.status <> v_order.status OR o.driver_id IS DISTINCT FROM v_order.driver_id OR o.fulfillment_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id, o.id, o.status, o.driver_id, o.fulfillment_warehouse_id, timezone('utc', now())
  INTO v_changed, id, status, driver_id, fulfillment_warehouse_id, updated_at;
  IF v_changed THEN
    INSERT INTO public.order_status_history(order_id, status, note, changed_by) VALUES (v_order.id, v_next_status, COALESCE(NULLIF(trim(p_note), ''), CASE WHEN v_next_status <> v_order.status THEN 'تم التحديث من لوحة الإدارة' ELSE 'تم تحديث تعيين التجهيز أو المندوب من لوحة الإدارة' END), auth.uid());
  END IF;
  RETURN NEXT;
END;
$$;


ALTER FUNCTION "public"."admin_update_order_operation"("p_order_id" "uuid", "p_expected_status" "text", "p_status" "text", "p_driver_id" "uuid", "p_warehouse_id" "uuid", "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_growth_rewards"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_reward_id uuid;v_affiliate public.affiliate_profiles%ROWTYPE;v_commission numeric; BEGIN IF NEW.status='delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN IF NEW.referral_referrer_id IS NOT NULL THEN INSERT INTO public.referral_rewards(referrer_id,referred_customer_id,order_id,points_awarded,status) VALUES(NEW.referral_referrer_id,NEW.customer_id,NEW.id,100,'available') ON CONFLICT(referred_customer_id) DO NOTHING RETURNING id INTO v_reward_id; IF v_reward_id IS NOT NULL THEN UPDATE public.profiles SET beauty_points=COALESCE(beauty_points,0)+100 WHERE id=NEW.referral_referrer_id; INSERT INTO public.loyalty_ledger(customer_id,order_id,points_delta,event_type,note) VALUES(NEW.referral_referrer_id,NEW.id,100,'referral_bonus','مكافأة إحالة عميلة جديدة'); PERFORM public.create_customer_notification(NEW.referral_referrer_id,'referral_reward','مكافأة إحالة جديدة','حصلتِ على 100 نقطة جمال بعد اكتمال أول طلب من عميلتك المُحالة.',NEW.id,NULL,jsonb_build_object('url','/referrals')); END IF; END IF; IF NEW.affiliate_id IS NOT NULL THEN SELECT * INTO v_affiliate FROM public.affiliate_profiles WHERE id=NEW.affiliate_id AND status='active'; IF FOUND THEN v_commission:=round(GREATEST(NEW.total-NEW.shipping_fee,0)*v_affiliate.commission_rate/100,2); INSERT INTO public.affiliate_commissions(affiliate_id,customer_id,order_id,commission_rate,commission_amount,status) VALUES(v_affiliate.id,NEW.customer_id,NEW.id,v_affiliate.commission_rate,v_commission,'pending') ON CONFLICT(order_id) DO NOTHING; PERFORM public.create_customer_notification(v_affiliate.customer_id,'affiliate_commission','عمولة جديدة معلقة','تم تسجيل عمولة بقيمة '||to_char(v_commission,'FM999G999G990D00')||' ج.س بعد اكتمال طلب عبر رابطك.',NEW.id,NULL,jsonb_build_object('url','/affiliate')); END IF; END IF; END IF; RETURN NEW; END; $$;


ALTER FUNCTION "public"."award_growth_rewards"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_order_loyalty_points"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_points integer;v_rate numeric;v_multiplier numeric:=1;v_lifetime integer;v_tier text; BEGIN IF NEW.status='delivered' AND OLD.status IS DISTINCT FROM 'delivered' THEN SELECT COALESCE(points_per_1000,0) INTO v_rate FROM public.loyalty_settings WHERE id=true; SELECT COALESCE(loyalty_lifetime_points,0) INTO v_lifetime FROM public.profiles WHERE id=NEW.customer_id FOR UPDATE; SELECT id,points_multiplier INTO v_tier,v_multiplier FROM public.loyalty_tiers WHERE is_active AND minimum_lifetime_points<=v_lifetime ORDER BY minimum_lifetime_points DESC LIMIT 1; v_points:=floor(GREATEST(NEW.total-NEW.shipping_fee,0)/1000*v_rate*COALESCE(v_multiplier,1)); IF v_points>0 THEN INSERT INTO public.loyalty_ledger(customer_id,order_id,points_delta,event_type,note) VALUES(NEW.customer_id,NEW.id,v_points,'earn','نقاط مكتسبة من طلب مكتمل') ON CONFLICT DO NOTHING; IF FOUND THEN SELECT id INTO v_tier FROM public.loyalty_tiers WHERE is_active AND minimum_lifetime_points<=v_lifetime+v_points ORDER BY minimum_lifetime_points DESC LIMIT 1; UPDATE public.profiles SET beauty_points=COALESCE(beauty_points,0)+v_points,loyalty_lifetime_points=COALESCE(loyalty_lifetime_points,0)+v_points,loyalty_tier=COALESCE(v_tier,'bronze') WHERE id=NEW.customer_id; NEW.points_earned:=v_points; END IF; END IF; END IF; RETURN NEW; END; $$;


ALTER FUNCTION "public"."award_order_loyalty_points"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text" DEFAULT NULL::"text", "p_points_to_redeem" integer DEFAULT 0) RETURNS TABLE("order_id" "uuid", "order_number" "text", "total" numeric, "shipping_fee" numeric, "discount_amount" numeric, "points_discount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_item jsonb; v_product_id uuid; v_quantity integer; v_unit_price numeric; v_discount numeric; v_stock integer; v_subtotal numeric := 0; v_shipping numeric := 1500; v_order_id uuid; v_order_number text; v_warehouse_id uuid; v_has_warehouse_inventory boolean; v_coupon public.coupons%ROWTYPE; v_coupon_discount numeric := 0; v_points integer := 0; v_points_discount numeric := 0; v_point_value numeric; v_minimum_points integer;
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
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer; IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF; SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock INTO v_unit_price, v_discount, v_stock FROM public.products p WHERE p.id = v_product_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF; IF NOT v_has_warehouse_inventory AND v_stock < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF; v_subtotal := v_subtotal + (v_unit_price * (1 - v_discount / 100)) * v_quantity; END LOOP;
  IF NULLIF(trim(coalesce(p_coupon_code, '')), '') IS NOT NULL THEN SELECT * INTO v_coupon FROM public.coupons WHERE code = upper(trim(p_coupon_code)) AND is_active AND starts_at <= timezone('utc', now()) AND (ends_at IS NULL OR ends_at >= timezone('utc', now())) FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Coupon is invalid or expired'; END IF; IF v_subtotal < v_coupon.min_order_amount THEN RAISE EXCEPTION 'Coupon minimum order amount was not reached'; END IF; IF v_coupon.usage_limit IS NOT NULL AND v_coupon.usage_count >= v_coupon.usage_limit THEN RAISE EXCEPTION 'Coupon usage limit has been reached'; END IF; IF (SELECT count(*) FROM public.coupon_redemptions WHERE coupon_id = v_coupon.id AND customer_id = v_user_id) >= v_coupon.per_user_limit THEN RAISE EXCEPTION 'Coupon usage limit for this account has been reached'; END IF; v_coupon_discount := CASE WHEN v_coupon.discount_type = 'percentage' THEN v_subtotal * v_coupon.discount_value / 100 ELSE v_coupon.discount_value END; IF v_coupon.max_discount_amount IS NOT NULL THEN v_coupon_discount := LEAST(v_coupon_discount, v_coupon.max_discount_amount); END IF; v_coupon_discount := LEAST(v_coupon_discount, v_subtotal); END IF;
  SELECT beauty_points INTO v_points FROM public.profiles WHERE id = v_user_id FOR UPDATE; SELECT currency_per_point, minimum_redemption_points INTO v_point_value, v_minimum_points FROM public.loyalty_settings WHERE id = true; IF p_points_to_redeem > 0 THEN IF p_points_to_redeem < v_minimum_points THEN RAISE EXCEPTION 'Minimum points for redemption was not reached'; END IF; IF p_points_to_redeem > COALESCE(v_points, 0) THEN RAISE EXCEPTION 'Insufficient loyalty points'; END IF; v_points_discount := LEAST(p_points_to_redeem * v_point_value, GREATEST(v_subtotal - v_coupon_discount, 0)); END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP v_product_id := (v_item->>'id')::uuid; v_quantity := (v_item->>'quantity')::integer; IF v_has_warehouse_inventory THEN UPDATE public.warehouse_inventory SET quantity = quantity - v_quantity, updated_at = timezone('utc', now()) WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND quantity >= v_quantity; IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF; ELSE UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id; END IF; END LOOP;
  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.orders (customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method, payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id, coupon_code, discount_amount, points_redeemed, points_discount) VALUES (v_user_id, trim(p_customer_name), trim(p_phone), p_items, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state, v_order_number, v_warehouse_id, NULLIF(upper(trim(coalesce(p_coupon_code, ''))), ''), round(v_coupon_discount, 2), p_points_to_redeem, round(v_points_discount, 2)) RETURNING id INTO v_order_id;
  IF v_coupon.id IS NOT NULL THEN UPDATE public.coupons SET usage_count = usage_count + 1 WHERE id = v_coupon.id; INSERT INTO public.coupon_redemptions (coupon_id, order_id, customer_id, discount_amount) VALUES (v_coupon.id, v_order_id, v_user_id, v_coupon_discount); END IF;
  IF p_points_to_redeem > 0 THEN UPDATE public.profiles SET beauty_points = beauty_points - p_points_to_redeem WHERE id = v_user_id; INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by) VALUES (v_user_id, v_order_id, -p_points_to_redeem, 'redeem', 'استبدال نقاط عند إنشاء الطلب', v_user_id); END IF;
  IF v_has_warehouse_inventory THEN FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by) VALUES (v_warehouse_id, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id); END LOOP; END IF;
  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);
  RETURN QUERY SELECT v_order_id, v_order_number, round(GREATEST(v_subtotal + v_shipping - v_coupon_discount - v_points_discount, 0), 2), v_shipping, round(v_coupon_discount, 2), round(v_points_discount, 2);
END; $$;


ALTER FUNCTION "public"."checkout_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_order_safe"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text" DEFAULT NULL::"text", "p_points_to_redeem" integer DEFAULT 0, "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "uuid", "order_number" "text", "total" numeric, "shipping_fee" numeric, "discount_amount" numeric, "points_discount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_items jsonb;
  v_reservation public.checkout_idempotency%ROWTYPE;
  v_result record;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NULL THEN RAISE EXCEPTION 'An idempotency key is required'; END IF;

  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('id', item.product_id, 'quantity', item.total_quantity) ORDER BY item.product_id),
    '[]'::jsonb
  ) INTO v_items
  FROM (
    SELECT (entry.value->>'id')::uuid AS product_id,
           SUM((entry.value->>'quantity')::integer)::integer AS total_quantity
    FROM jsonb_array_elements(p_items) AS entry(value)
    GROUP BY (entry.value->>'id')::uuid
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


ALTER FUNCTION "public"."checkout_order_safe"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text" DEFAULT NULL::"text", "p_points_to_redeem" integer DEFAULT 0, "p_referral_code" "text" DEFAULT NULL::"text", "p_affiliate_code" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "uuid", "order_number" "text", "total" numeric, "shipping_fee" numeric, "discount_amount" numeric, "points_discount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_order record;v_user uuid:=auth.uid();v_referrer uuid;v_affiliate uuid; BEGIN IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF NULLIF(trim(COALESCE(p_referral_code,'')),'') IS NOT NULL THEN SELECT id INTO v_referrer FROM public.profiles WHERE referral_code=upper(trim(p_referral_code)) AND id<>v_user; IF v_referrer IS NULL THEN RAISE EXCEPTION 'Invalid referral code'; END IF; END IF; IF NULLIF(trim(COALESCE(p_affiliate_code,'')),'') IS NOT NULL THEN SELECT id INTO v_affiliate FROM public.affiliate_profiles WHERE code=upper(trim(p_affiliate_code)) AND status='active' AND customer_id<>v_user; IF v_affiliate IS NULL THEN RAISE EXCEPTION 'Invalid affiliate code'; END IF; END IF; SELECT * INTO v_order FROM public.checkout_order(p_customer_name,p_phone,p_shipping_address,p_city,p_state,p_payment_method,p_items,p_coupon_code,p_points_to_redeem); UPDATE public.orders SET referral_code=NULLIF(upper(trim(COALESCE(p_referral_code,''))),''),referral_referrer_id=v_referrer,affiliate_code=NULLIF(upper(trim(COALESCE(p_affiliate_code,''))),''),affiliate_id=v_affiliate WHERE id=v_order.order_id; IF v_referrer IS NOT NULL THEN UPDATE public.profiles SET referred_by=v_referrer WHERE id=v_user AND referred_by IS NULL; END IF; RETURN QUERY SELECT v_order.order_id,v_order.order_number,v_order.total,v_order.shipping_fee,v_order.discount_amount,v_order.points_discount; END; $$;


ALTER FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text" DEFAULT NULL::"text", "p_points_to_redeem" integer DEFAULT 0, "p_referral_code" "text" DEFAULT NULL::"text", "p_affiliate_code" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS TABLE("order_id" "uuid", "order_number" "text", "total" numeric, "shipping_fee" numeric, "discount_amount" numeric, "points_discount" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE v_order record; v_user uuid := auth.uid(); v_referrer uuid; v_affiliate uuid;
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
    p_items, p_coupon_code, p_points_to_redeem, p_idempotency_key
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


ALTER FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."clear_driver_location"() RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_driver_id uuid;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;
  DELETE FROM public.driver_last_locations WHERE driver_id = v_driver_id;
END;
$$;


ALTER FUNCTION "public"."clear_driver_location"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_customer_notification"("p_customer_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_order_id" "uuid" DEFAULT NULL::"uuid", "p_product_id" "uuid" DEFAULT NULL::"uuid", "p_payload" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_id uuid; BEGIN INSERT INTO public.customer_notifications(customer_id,type,title_ar,body_ar,order_id,product_id,payload) VALUES(p_customer_id,p_type,p_title,p_body,p_order_id,p_product_id,COALESCE(p_payload,'{}'::jsonb)) ON CONFLICT(order_id,type) WHERE order_id IS NOT NULL DO NOTHING RETURNING id INTO v_id; RETURN v_id; END; $$;


ALTER FUNCTION "public"."create_customer_notification"("p_customer_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_order_id" "uuid", "p_product_id" "uuid", "p_payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb") RETURNS TABLE("order_id" "uuid", "order_number" "text", "total" numeric, "shipping_fee" numeric)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_price numeric;
  v_discount numeric;
  v_stock integer;
  v_subtotal numeric := 0;
  v_shipping numeric := 1500;
  v_order_id uuid;
  v_order_number text;
  v_warehouse_id uuid;
  v_has_warehouse_inventory boolean;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN RAISE EXCEPTION 'Customer name is required'; END IF;
  IF p_phone IS NULL OR length(trim(p_phone)) < 5 THEN RAISE EXCEPTION 'Phone is required'; END IF;
  IF p_shipping_address IS NULL OR length(trim(p_shipping_address)) < 5 THEN RAISE EXCEPTION 'Shipping address is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'Cart is empty'; END IF;
  IF p_payment_method NOT IN ('COD','Fawry','Mychashi') THEN RAISE EXCEPTION 'Unsupported payment method'; END IF;

  SELECT dz.fee INTO v_shipping FROM public.delivery_zones dz WHERE dz.name = p_city AND dz.is_active = true LIMIT 1;
  v_shipping := COALESCE(v_shipping, 1500);
  SELECT EXISTS (SELECT 1 FROM public.warehouse_inventory) INTO v_has_warehouse_inventory;

  IF v_has_warehouse_inventory THEN
    SELECT w.id INTO v_warehouse_id
    FROM public.warehouses w
    WHERE w.is_active
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_items) ci
        WHERE NOT EXISTS (
          SELECT 1 FROM public.warehouse_inventory wi
          WHERE wi.warehouse_id = w.id
            AND wi.product_id = (ci->>'id')::uuid
            AND wi.quantity >= (ci->>'quantity')::integer
        )
      )
    ORDER BY
      CASE WHEN lower(coalesce(w.city, '')) = lower(coalesce(p_city, '')) THEN 0 ELSE 1 END,
      CASE WHEN lower(coalesce(w.state, '')) = lower(coalesce(p_state, '')) THEN 0 ELSE 1 END,
      w.created_at
    LIMIT 1;
    IF v_warehouse_id IS NULL THEN RAISE EXCEPTION 'No active warehouse can fulfill this order'; END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_quantity IS NULL OR v_quantity < 1 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    SELECT p.price, COALESCE(p.discount_percentage, 0), p.stock INTO v_unit_price, v_discount, v_stock
      FROM public.products p WHERE p.id = v_product_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
    IF NOT v_has_warehouse_inventory AND v_stock < v_quantity THEN RAISE EXCEPTION 'Insufficient stock for product %', v_product_id; END IF;
    v_subtotal := v_subtotal + (v_unit_price * (1 - v_discount / 100)) * v_quantity;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    v_product_id := (v_item->>'id')::uuid;
    v_quantity := (v_item->>'quantity')::integer;
    IF v_has_warehouse_inventory THEN
      UPDATE public.warehouse_inventory
      SET quantity = quantity - v_quantity, updated_at = timezone('utc', now())
      WHERE warehouse_id = v_warehouse_id AND product_id = v_product_id AND quantity >= v_quantity;
      IF NOT FOUND THEN RAISE EXCEPTION 'Inventory changed before order confirmation'; END IF;
    ELSE
      UPDATE public.products SET stock = stock - v_quantity WHERE id = v_product_id;
    END IF;
  END LOOP;

  v_order_number := 'TB-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
  INSERT INTO public.orders (customer_id, customer_name, phone, items, total, shipping_fee, status, payment_method, payment_status, shipping_address, city, state, order_number, fulfillment_warehouse_id)
  VALUES (v_user_id, trim(p_customer_name), trim(p_phone), p_items, round(v_subtotal + v_shipping, 2), v_shipping, 'new', p_payment_method, 'pending', trim(p_shipping_address), p_city, p_state, v_order_number, v_warehouse_id)
  RETURNING id INTO v_order_id;

  IF v_has_warehouse_inventory THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
      INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
      VALUES (v_warehouse_id, (v_item->>'id')::uuid, -((v_item->>'quantity')::integer), 'order_reservation', 'حجز لطلب ' || v_order_number, v_order_id, v_user_id);
    END LOOP;
  END IF;

  INSERT INTO public.order_status_history (order_id, status, changed_by) VALUES (v_order_id, 'new', v_user_id);
  RETURN QUERY SELECT v_order_id, v_order_number, round(v_subtotal + v_shipping, 2), v_shipping;
END;
$$;


ALTER FUNCTION "public"."create_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_profile_referral_code"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NEW.referral_code IS NULL OR trim(NEW.referral_code)='' THEN NEW.referral_code:='TIPS'||upper(substr(replace(NEW.id::text,'-',''),1,8)); END IF; RETURN NEW; END; $$;


ALTER FUNCTION "public"."create_profile_referral_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_admin_product_review_stats"() RETURNS TABLE("product_id" "uuid", "product_name_ar" "text", "brand" "text", "product_image" "text", "published_count" integer, "hidden_count" integer, "average_published_rating" numeric, "photo_count" integer, "sales_count" integer, "latest_review_at" timestamp with time zone)
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF; RETURN QUERY SELECT p.id, p.name_ar, p.brand, p.image, COUNT(r.id) FILTER (WHERE r.status = 'published')::integer, COUNT(r.id) FILTER (WHERE r.status = 'hidden')::integer, COALESCE(ROUND(AVG(r.rating) FILTER (WHERE r.status = 'published' AND r.is_verified_purchase), 2), 0), COALESCE(SUM(cardinality(COALESCE(r.image_paths, '{}'::text[]))), 0)::integer, COALESCE(sm.sales_count, 0)::integer, MAX(r.created_at) FROM public.products p LEFT JOIN public.reviews r ON r.product_id = p.id LEFT JOIN public.get_public_product_sales_metrics() sm ON sm.product_id = p.id GROUP BY p.id, p.name_ar, p.brand, p.image, sm.sales_count ORDER BY MAX(r.created_at) DESC NULLS LAST, p.name_ar ASC; END; $$;


ALTER FUNCTION "public"."get_admin_product_review_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_product"("p_product_id" "uuid") RETURNS TABLE("id" "uuid", "name_ar" "text", "name_en" "text", "price" numeric, "discount_percentage" numeric, "category" "text", "brand" "text", "image" "text", "images" "text"[], "description" "text", "benefits" "text"[], "ingredients" "text"[], "usage" "text", "origin" "text", "expiry" "text", "stock" integer, "is_imported" boolean, "skin_type" "text"[], "reviews_count" integer, "average_rating" numeric, "created_at" timestamp with time zone, "variants" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at, p.variants
  FROM public.products p
  WHERE p.id = p_product_id;
$$;


ALTER FUNCTION "public"."get_public_product"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") RETURNS TABLE("id" "uuid", "rating" integer, "comment" "text", "image_paths" "text"[], "reviewer_label" "text", "created_at" timestamp with time zone, "verified_purchase" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT r.id,
         r.rating,
         COALESCE(r.comment, ''),
         COALESCE(r.image_paths, '{}'::text[]),
         COALESCE(NULLIF(r.user_name, ''), 'عميلة تيبس'),
         r.created_at,
         r.is_verified_purchase
  FROM public.reviews r
  WHERE r.product_id = p_product_id
    AND r.status = 'published'
    AND r.is_verified_purchase
  ORDER BY r.created_at DESC
  LIMIT 50;
$$;


ALTER FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_product_sales_metrics"() RETURNS TABLE("product_id" "uuid", "sales_count" integer)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
  SELECT p.id,
         COALESCE(SUM(
           CASE
             WHEN COALESCE(item->>'quantity', '') ~ '^[0-9]+$' THEN (item->>'quantity')::integer
             ELSE 0
           END
         ) FILTER (WHERE o.status IN ('confirmed', 'preparing', 'shipped', 'delivered')), 0)::integer
  FROM public.products p
  LEFT JOIN public.orders o ON o.status IN ('confirmed', 'preparing', 'shipped', 'delivered')
  LEFT JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item ON (item->>'id')::uuid = p.id
  GROUP BY p.id;
$_$;


ALTER FUNCTION "public"."get_public_product_sales_metrics"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_public_products"() RETURNS TABLE("id" "uuid", "name_ar" "text", "name_en" "text", "price" numeric, "discount_percentage" numeric, "category" "text", "brand" "text", "image" "text", "images" "text"[], "description" "text", "benefits" "text"[], "ingredients" "text"[], "usage" "text", "origin" "text", "expiry" "text", "stock" integer, "is_imported" boolean, "skin_type" "text"[], "reviews_count" integer, "average_rating" numeric, "created_at" timestamp with time zone, "variants" "jsonb")
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at, p.variants
  FROM public.products p
  ORDER BY p.created_at DESC;
$$;


ALTER FUNCTION "public"."get_public_products"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_reviewable_order_items"() RETURNS TABLE("order_id" "uuid", "order_number" "text", "product_id" "uuid", "product_name_ar" "text", "product_image" "text", "has_review" boolean)
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT o.id,
         COALESCE(o.order_number, 'طلب تيبس'),
         p.id,
         p.name_ar,
         p.image,
         EXISTS (
           SELECT 1
           FROM public.reviews r
           WHERE r.order_id = o.id
             AND r.product_id = p.id
             AND r.user_id = auth.uid()
         ) AS has_review
  FROM public.orders o
  CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
  JOIN public.products p ON p.id = (item->>'id')::uuid
  WHERE o.customer_id = auth.uid()
    AND o.status = 'delivered'
  ORDER BY o.created_at DESC, p.name_ar ASC;
$$;


ALTER FUNCTION "public"."get_reviewable_order_items"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_storefront_collections"() RETURNS TABLE("id" "uuid", "slug" "text", "name_ar" "text", "description_ar" "text", "icon" "text", "display_order" integer, "product_ids" "uuid"[])
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ SELECT c.id,c.slug,c.name_ar,c.description_ar,c.icon,c.display_order,COALESCE(CASE c.rule_type WHEN 'manual' THEN (SELECT array_agg(cpm.product_id ORDER BY cpm.display_order) FROM public.storefront_collection_products cpm JOIN public.products p ON p.id=cpm.product_id WHERE cpm.collection_id=c.id AND COALESCE(p.stock,0)>0) WHEN 'newest' THEN (SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM(SELECT p.id,p.created_at FROM public.products p WHERE COALESCE(p.stock,0)>0 ORDER BY p.created_at DESC LIMIT GREATEST(1,COALESCE((c.rule_config->>'limit')::integer,12)))s) WHEN 'best_sellers' THEN COALESCE((SELECT array_agg(s.product_id ORDER BY s.order_count DESC,s.latest_order DESC) FROM(SELECT (item->>'id')::uuid AS product_id,COUNT(*) AS order_count,MAX(o.created_at) AS latest_order FROM public.orders o CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items,'[]'::jsonb)) item JOIN public.products p ON p.id=(item->>'id')::uuid WHERE o.status IN('confirmed','preparing','shipped','delivered') AND COALESCE(p.stock,0)>0 GROUP BY (item->>'id')::uuid ORDER BY order_count DESC,latest_order DESC LIMIT 12)s),(SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM(SELECT id,created_at FROM public.products WHERE COALESCE(stock,0)>0 ORDER BY created_at DESC LIMIT 12)s)) WHEN 'discount' THEN (SELECT array_agg(s.id ORDER BY s.discount_percentage DESC,s.created_at DESC) FROM(SELECT p.id,p.discount_percentage,p.created_at FROM public.products p WHERE COALESCE(p.stock,0)>0 AND COALESCE(p.discount_percentage,0)>=COALESCE((c.rule_config->>'minimum_discount')::numeric,1) ORDER BY p.discount_percentage DESC,p.created_at DESC LIMIT 12)s) WHEN 'price_under' THEN (SELECT array_agg(s.id ORDER BY s.final_price ASC,s.created_at DESC) FROM(SELECT p.id,p.created_at,p.price*(1-COALESCE(p.discount_percentage,0)/100) AS final_price FROM public.products p WHERE COALESCE(p.stock,0)>0 AND p.price*(1-COALESCE(p.discount_percentage,0)/100)<=COALESCE((c.rule_config->>'price')::numeric,10000) ORDER BY final_price ASC,p.created_at DESC LIMIT 12)s) WHEN 'category' THEN (SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM(SELECT p.id,p.created_at FROM public.products p WHERE COALESCE(p.stock,0)>0 AND p.category=c.rule_config->>'category' ORDER BY p.created_at DESC LIMIT 12)s) END,'{}'::uuid[]) AS product_ids FROM public.storefront_collections c WHERE c.is_active ORDER BY c.display_order,c.created_at; $$;


ALTER FUNCTION "public"."get_storefront_collections"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth', 'extensions'
    AS $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'customer');
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."inventory_restock_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF TG_OP='INSERT' THEN IF NEW.quantity>0 THEN PERFORM public.notify_restock_subscribers(NEW.product_id); END IF; ELSIF OLD.quantity<=0 AND NEW.quantity>0 THEN PERFORM public.notify_restock_subscribers(NEW.product_id); END IF; RETURN NEW; END; $$;


ALTER FUNCTION "public"."inventory_restock_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_driver"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'driver'
  );
$$;


ALTER FUNCTION "public"."is_driver"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."moderate_product_review"("p_review_id" "uuid", "p_status" "text", "p_remove_images" boolean DEFAULT false) RETURNS TABLE("review_id" "uuid", "status" "text", "images_removed" integer)
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $$ DECLARE v_paths text[]; v_removed integer := 0; BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required.'; END IF; IF p_status NOT IN ('published', 'hidden') THEN RAISE EXCEPTION 'Unsupported review status.'; END IF; SELECT r.image_paths INTO v_paths FROM public.reviews r WHERE r.id = p_review_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Review not found.'; END IF; IF p_remove_images OR p_status = 'hidden' THEN DELETE FROM storage.objects WHERE bucket_id = 'review-images' AND name = ANY(COALESCE(v_paths, '{}'::text[])); GET DIAGNOSTICS v_removed = ROW_COUNT; END IF; UPDATE public.reviews SET status = p_status, image_paths = CASE WHEN p_remove_images OR p_status = 'hidden' THEN '{}'::text[] ELSE image_paths END WHERE id = p_review_id; RETURN QUERY SELECT p_review_id, p_status, v_removed; END; $$;


ALTER FUNCTION "public"."moderate_product_review"("p_review_id" "uuid", "p_status" "text", "p_remove_images" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."notify_restock_subscribers"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_product_name text; BEGIN SELECT name_ar INTO v_product_name FROM public.products WHERE id=p_product_id; IF v_product_name IS NULL THEN RETURN; END IF; INSERT INTO public.customer_notifications(customer_id,product_id,type,title_ar,body_ar,payload) SELECT rs.customer_id,p_product_id,'back_in_stock','المنتج عاد للمخزون',v_product_name||' أصبح متوفراً الآن. أسرعي قبل نفاد الكمية.',jsonb_build_object('product_id',p_product_id,'url','/product/'||p_product_id::text) FROM public.restock_subscriptions rs WHERE rs.product_id=p_product_id AND rs.is_active; UPDATE public.restock_subscriptions SET is_active=false,notified_at=timezone('utc',now()) WHERE product_id=p_product_id AND is_active; END; $$;


ALTER FUNCTION "public"."notify_restock_subscribers"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_create_internal_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_type text;v_title text;v_body text; BEGIN IF TG_OP='INSERT' THEN v_type:='order_created';v_title:='تم استلام طلبك';v_body:='تم استلام طلبك رقم '||COALESCE(NEW.order_number,'')||' بنجاح.'; ELSIF NEW.status IS DISTINCT FROM OLD.status THEN v_type:='order_status_'||NEW.status;v_title:=CASE NEW.status WHEN 'confirmed' THEN 'تم تأكيد الطلب' WHEN 'preparing' THEN 'طلبك قيد التجهيز' WHEN 'shipped' THEN 'طلبك في الطريق' WHEN 'delivered' THEN 'تم توصيل طلبك' WHEN 'cancelled' THEN 'تم إلغاء الطلب' WHEN 'delivery_failed' THEN 'تعذر تسليم الطلب' ELSE 'تم تحديث الطلب' END;v_body:=CASE NEW.status WHEN 'confirmed' THEN 'تم تأكيد طلبك رقم '||NEW.order_number||'.' WHEN 'preparing' THEN 'يجري تجهيز طلبك رقم '||NEW.order_number||'.' WHEN 'shipped' THEN 'طلبك رقم '||NEW.order_number||' في الطريق إليك.' WHEN 'delivered' THEN 'تم توصيل طلبك رقم '||NEW.order_number||'. شكراً لاختيارك تيبس بيوتي.' WHEN 'cancelled' THEN 'تم إلغاء طلبك رقم '||NEW.order_number||'.' WHEN 'delivery_failed' THEN 'تعذر تسليم طلبك رقم '||NEW.order_number||'. تواصلي معنا للمساعدة.' ELSE 'تم تحديث طلبك رقم '||NEW.order_number||'.' END; ELSIF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN v_type:='payment_'||NEW.payment_status;v_title:='تحديث حالة الدفع';v_body:='تم تحديث حالة دفع طلبك رقم '||NEW.order_number||'.'; ELSE RETURN NEW; END IF; PERFORM public.create_customer_notification(NEW.customer_id,v_type,v_title,v_body,NEW.id,NULL,jsonb_build_object('order_number',NEW.order_number,'status',NEW.status,'payment_status',NEW.payment_status,'url','/orders')); RETURN NEW; END; $$;


ALTER FUNCTION "public"."order_create_internal_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."order_create_review_request_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status <> 'delivered' THEN RETURN NEW; END IF; IF jsonb_array_length(COALESCE(NEW.items, '[]'::jsonb)) = 0 THEN RETURN NEW; END IF; PERFORM public.create_customer_notification(NEW.customer_id, 'review_request', 'كيف كانت تجربتك؟', 'تم توصيل طلبك رقم ' || COALESCE(NEW.order_number, '') || '. شاركينا رأيك في المنتجات التي استلمتها.', NEW.id, NULL, jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status, 'url', '/orders')); RETURN NEW; END; $$;


ALTER FUNCTION "public"."order_create_review_request_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_profile_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only an administrator can change a user role';
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."prevent_profile_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."products_restock_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF COALESCE(OLD.stock,0)<=0 AND COALESCE(NEW.stock,0)>0 THEN PERFORM public.notify_restock_subscribers(NEW.id); END IF; RETURN NEW; END; $$;


ALTER FUNCTION "public"."products_restock_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_order_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_event text; v_message text; BEGIN IF TG_OP = 'INSERT' THEN v_event := 'order_created'; v_message := 'تم استلام طلبك رقم ' || COALESCE(NEW.order_number, '') || ' بنجاح. سنقوم بتأكيده قريباً.'; ELSIF NEW.status IS DISTINCT FROM OLD.status THEN v_event := 'order_status_' || NEW.status; v_message := CASE NEW.status WHEN 'confirmed' THEN 'تم تأكيد طلبك رقم ' || NEW.order_number || '.' WHEN 'preparing' THEN 'يجري تجهيز طلبك رقم ' || NEW.order_number || '.' WHEN 'shipped' THEN 'طلبك رقم ' || NEW.order_number || ' خرج للتوصيل.' WHEN 'delivered' THEN 'تم توصيل طلبك رقم ' || NEW.order_number || '. شكراً لاختيارك تيبس بيوتي.' WHEN 'cancelled' THEN 'تم إلغاء طلبك رقم ' || NEW.order_number || '. تواصلي معنا للمساعدة.' ELSE 'تم تحديث حالة طلبك رقم ' || NEW.order_number || '.' END; ELSIF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN v_event := 'payment_' || NEW.payment_status; v_message := CASE NEW.payment_status WHEN 'proof_submitted' THEN 'تم استلام إثبات دفع طلبك رقم ' || NEW.order_number || ' وجارٍ مراجعته.' WHEN 'paid' THEN 'تم تأكيد دفع طلبك رقم ' || NEW.order_number || '.' WHEN 'refunded' THEN 'تم تسجيل استرداد طلبك رقم ' || NEW.order_number || '.' ELSE 'تم تحديث حالة دفع طلبك رقم ' || NEW.order_number || '.' END; ELSE RETURN NEW; END IF; INSERT INTO public.notification_queue (order_id, customer_id, recipient_phone, channel, event_type, message, payload) VALUES (NEW.id, NEW.customer_id, NEW.phone, 'whatsapp', v_event, v_message, jsonb_build_object('order_number', NEW.order_number, 'status', NEW.status, 'payment_status', NEW.payment_status)); RETURN NEW; END; $$;


ALTER FUNCTION "public"."queue_order_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."queue_return_notification"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_phone text; v_number text; BEGIN SELECT phone, order_number INTO v_phone, v_number FROM public.orders WHERE id = NEW.order_id; INSERT INTO public.notification_queue (order_id, customer_id, recipient_phone, channel, event_type, message, payload) VALUES (NEW.order_id, NEW.customer_id, v_phone, 'whatsapp', 'return_' || NEW.status, CASE WHEN TG_OP = 'INSERT' THEN 'تم استلام طلب الإرجاع الخاص بالطلب ' || COALESCE(v_number, '') || '.' ELSE 'تم تحديث حالة طلب الإرجاع للطلب ' || COALESCE(v_number, '') || ' إلى: ' || NEW.status END, jsonb_build_object('return_id', NEW.id, 'status', NEW.status)); RETURN NEW; END; $$;


ALTER FUNCTION "public"."queue_return_notification"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  UPDATE public.products p
  SET reviews_count = COALESCE(s.review_count, 0),
      average_rating = COALESCE(s.average_rating, 0)
  FROM (
    SELECT product_id, COUNT(*)::integer AS review_count, ROUND(AVG(rating)::numeric, 2) AS average_rating
    FROM public.reviews
    WHERE product_id = p_product_id
      AND is_verified_purchase
      AND status = 'published'
    GROUP BY product_id
  ) s
  WHERE p.id = p_product_id;
$$;


ALTER FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_customer_push_token"("p_expo_push_token" "text", "p_platform" "text", "p_device_name" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $_$ DECLARE v_customer_id uuid := auth.uid(); v_token_id uuid; BEGIN IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Unsupported device platform'; END IF; IF p_expo_push_token IS NULL OR p_expo_push_token !~ '^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$' THEN RAISE EXCEPTION 'Invalid Expo push token'; END IF; INSERT INTO public.customer_push_tokens (customer_id, expo_push_token, platform, device_name, is_active, invalidated_at, last_registered_at) VALUES (v_customer_id, p_expo_push_token, p_platform, NULLIF(trim(p_device_name), ''), true, NULL, timezone('utc', now())) ON CONFLICT (expo_push_token) DO UPDATE SET customer_id = EXCLUDED.customer_id, platform = EXCLUDED.platform, device_name = EXCLUDED.device_name, is_active = true, invalidated_at = NULL, last_registered_at = timezone('utc', now()) RETURNING id INTO v_token_id; RETURN v_token_id; END; $_$;


ALTER FUNCTION "public"."register_customer_push_token"("p_expo_push_token" "text", "p_platform" "text", "p_device_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."request_order_return"("p_order_id" "uuid", "p_items" "jsonb", "p_reason" "text", "p_requested_resolution" "text", "p_customer_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid(); v_return_id uuid; v_order_items jsonb; v_item jsonb; v_allowed_quantity integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_requested_resolution NOT IN ('refund', 'exchange', 'store_credit') THEN RAISE EXCEPTION 'Unsupported return resolution'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'Return reason is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  SELECT items INTO v_order_items FROM public.orders
  WHERE id = p_order_id AND customer_id = v_user_id AND status = 'delivered'
  FOR UPDATE;
  IF v_order_items IS NULL THEN RAISE EXCEPTION 'Only delivered orders can be returned'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(v_item->>'id', '') IS NULL OR COALESCE((v_item->>'quantity')::integer, 0) < 1 THEN RAISE EXCEPTION 'Invalid return item'; END IF;
    SELECT (purchased_item->>'quantity')::integer INTO v_allowed_quantity
    FROM jsonb_array_elements(v_order_items) purchased_item
    WHERE purchased_item->>'id' = v_item->>'id'
    LIMIT 1;
    IF v_allowed_quantity IS NULL OR (v_item->>'quantity')::integer > v_allowed_quantity THEN RAISE EXCEPTION 'Return items must match the delivered order'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.order_returns r, jsonb_array_elements(r.items) returned_item
      WHERE r.order_id = p_order_id
        AND r.status NOT IN ('rejected', 'closed')
        AND returned_item->>'id' = v_item->>'id'
    ) THEN RAISE EXCEPTION 'An active return already exists for one of these items'; END IF;
  END LOOP;

  INSERT INTO public.order_returns (order_id, customer_id, items, reason, requested_resolution, customer_note)
  VALUES (p_order_id, v_user_id, p_items, trim(p_reason), p_requested_resolution, NULLIF(trim(p_customer_note), ''))
  RETURNING id INTO v_return_id;
  RETURN v_return_id;
END;
$$;


ALTER FUNCTION "public"."request_order_return"("p_order_id" "uuid", "p_items" "jsonb", "p_reason" "text", "p_requested_resolution" "text", "p_customer_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_affiliate_commission"("p_commission_id" "uuid", "p_status" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; IF p_status NOT IN('approved','paid','reversed') THEN RAISE EXCEPTION 'Unsupported commission status'; END IF; UPDATE public.affiliate_commissions SET status=p_status,approved_by=auth.uid(),approved_at=CASE WHEN p_status IN('approved','paid') THEN timezone('utc',now()) ELSE approved_at END,paid_at=CASE WHEN p_status='paid' THEN timezone('utc',now()) ELSE paid_at END WHERE id=p_commission_id; IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF; RETURN p_status; END; $$;


ALTER FUNCTION "public"."review_affiliate_commission"("p_commission_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_order_return"("p_return_id" "uuid", "p_status" "text", "p_admin_note" "text" DEFAULT NULL::"text", "p_restock" boolean DEFAULT false) RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_return public.order_returns%ROWTYPE; v_warehouse_id uuid; v_item jsonb; BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; IF p_status NOT IN ('approved', 'rejected', 'received', 'refunded', 'closed') THEN RAISE EXCEPTION 'Unsupported return status'; END IF; SELECT * INTO v_return FROM public.order_returns WHERE id = p_return_id FOR UPDATE; IF NOT FOUND THEN RAISE EXCEPTION 'Return request not found'; END IF; UPDATE public.order_returns SET status = p_status, admin_note = NULLIF(trim(p_admin_note), ''), reviewed_by = (SELECT auth.uid()), reviewed_at = timezone('utc', now()), updated_at = timezone('utc', now()) WHERE id = p_return_id; IF p_restock AND v_return.restocked_at IS NULL THEN SELECT fulfillment_warehouse_id INTO v_warehouse_id FROM public.orders WHERE id = v_return.order_id; FOR v_item IN SELECT value FROM jsonb_array_elements(v_return.items) LOOP IF v_warehouse_id IS NOT NULL THEN INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity) VALUES (v_warehouse_id, (v_item->>'id')::uuid, (v_item->>'quantity')::integer) ON CONFLICT (warehouse_id, product_id) DO UPDATE SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = timezone('utc', now()); INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by) VALUES (v_warehouse_id, (v_item->>'id')::uuid, (v_item->>'quantity')::integer, 'adjustment', 'إعادة مخزون من مرتجع', v_return.order_id, (SELECT auth.uid())); ELSE UPDATE public.products SET stock = stock + (v_item->>'quantity')::integer WHERE id = (v_item->>'id')::uuid; END IF; END LOOP; UPDATE public.order_returns SET restocked_at = timezone('utc', now()) WHERE id = p_return_id; END IF; IF p_status = 'refunded' THEN UPDATE public.orders SET payment_status = 'refunded', financial_status = 'refunded' WHERE id = v_return.order_id; END IF; RETURN p_status; END; $$;


ALTER FUNCTION "public"."review_order_return"("p_return_id" "uuid", "p_status" "text", "p_admin_note" "text", "p_restock" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."review_payment_proof"("p_proof_id" "uuid", "p_status" "text", "p_review_note" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ DECLARE v_order_id uuid; BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; IF p_status NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Unsupported review status'; END IF; UPDATE public.payment_proofs SET status = p_status, reviewer_id = (SELECT auth.uid()), review_note = NULLIF(trim(p_review_note), ''), reviewed_at = timezone('utc', now()) WHERE id = p_proof_id AND status = 'pending' RETURNING order_id INTO v_order_id; IF v_order_id IS NULL THEN RAISE EXCEPTION 'Payment proof is not pending'; END IF; UPDATE public.orders SET payment_status = CASE WHEN p_status = 'verified' THEN 'paid' ELSE 'pending' END, financial_status = CASE WHEN p_status = 'verified' THEN 'paid' ELSE financial_status END WHERE id = v_order_id; RETURN p_status; END; $$;


ALTER FUNCTION "public"."review_payment_proof"("p_proof_id" "uuid", "p_status" "text", "p_review_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_affiliate_status"("p_affiliate_id" "uuid", "p_status" "text", "p_commission_rate" numeric DEFAULT NULL::numeric, "p_admin_note" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$ BEGIN IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF; IF p_status NOT IN('pending','active','suspended','rejected') THEN RAISE EXCEPTION 'Unsupported affiliate status'; END IF; UPDATE public.affiliate_profiles SET status=p_status,commission_rate=COALESCE(p_commission_rate,commission_rate),admin_note=NULLIF(trim(p_admin_note),''),approved_by=CASE WHEN p_status='active' THEN auth.uid() ELSE approved_by END,approved_at=CASE WHEN p_status='active' THEN timezone('utc',now()) ELSE approved_at END,updated_at=timezone('utc',now()) WHERE id=p_affiliate_id; IF NOT FOUND THEN RAISE EXCEPTION 'Affiliate application not found'; END IF; RETURN p_status; END; $$;


ALTER FUNCTION "public"."set_affiliate_status"("p_affiliate_id" "uuid", "p_status" "text", "p_commission_rate" numeric, "p_admin_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_driver_availability"("p_status" "text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_driver_id uuid;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_status NOT IN ('active', 'offline') THEN RAISE EXCEPTION 'Unsupported availability status'; END IF;
  UPDATE public.drivers SET status = p_status, updated_at = timezone('utc', now()) WHERE user_id = auth.uid() RETURNING id INTO v_driver_id;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;
  IF p_status = 'offline' THEN DELETE FROM public.driver_last_locations WHERE driver_id = v_driver_id; END IF;
  RETURN p_status;
END;
$$;


ALTER FUNCTION "public"."set_driver_availability"("p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."share_driver_location"("p_latitude" numeric, "p_longitude" numeric, "p_accuracy_meters" numeric DEFAULT NULL::numeric) RETURNS timestamp with time zone
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_driver_id uuid; v_updated_at timestamptz;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_latitude NOT BETWEEN -90 AND 90 OR p_longitude NOT BETWEEN -180 AND 180 THEN RAISE EXCEPTION 'Invalid GPS coordinates'; END IF;
  IF p_accuracy_meters IS NOT NULL AND p_accuracy_meters < 0 THEN RAISE EXCEPTION 'Invalid GPS accuracy'; END IF;
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.orders WHERE driver_id = v_driver_id AND status = 'shipped') THEN RAISE EXCEPTION 'Location sharing is allowed only during an active delivery'; END IF;
  INSERT INTO public.driver_last_locations(driver_id, latitude, longitude, accuracy_meters, updated_at)
  VALUES (v_driver_id, p_latitude, p_longitude, p_accuracy_meters, timezone('utc', now()))
  ON CONFLICT (driver_id) DO UPDATE SET latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude, accuracy_meters = EXCLUDED.accuracy_meters, updated_at = EXCLUDED.updated_at
  RETURNING updated_at INTO v_updated_at;
  RETURN v_updated_at;
END;
$$;


ALTER FUNCTION "public"."share_driver_location"("p_latitude" numeric, "p_longitude" numeric, "p_accuracy_meters" numeric) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."affiliate_profiles" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "display_name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "commission_rate" numeric DEFAULT 3 NOT NULL,
    "minimum_payout" numeric DEFAULT 5000 NOT NULL,
    "payout_method" "text",
    "payout_details" "text",
    "admin_note" "text",
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "affiliate_profiles_commission_rate_check" CHECK ((("commission_rate" >= (0)::numeric) AND ("commission_rate" <= (100)::numeric))),
    CONSTRAINT "affiliate_profiles_minimum_payout_check" CHECK (("minimum_payout" >= (0)::numeric)),
    CONSTRAINT "affiliate_profiles_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'active'::"text", 'suspended'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."affiliate_profiles" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_affiliate_application"("p_display_name" "text", "p_payout_method" "text" DEFAULT NULL::"text", "p_payout_details" "text" DEFAULT NULL::"text") RETURNS "public"."affiliate_profiles"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_user uuid:=auth.uid();v_profile public.affiliate_profiles%ROWTYPE;v_code text; BEGIN IF v_user IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF; IF p_display_name IS NULL OR length(trim(p_display_name))<2 THEN RAISE EXCEPTION 'Display name is required'; END IF; v_code:='TIPSA'||upper(substr(replace(v_user::text,'-',''),1,7)); INSERT INTO public.affiliate_profiles(customer_id,display_name,code,status,payout_method,payout_details) VALUES(v_user,trim(p_display_name),v_code,'pending',NULLIF(trim(p_payout_method),''),NULLIF(trim(p_payout_details),'')) ON CONFLICT(customer_id) DO UPDATE SET display_name=EXCLUDED.display_name,payout_method=EXCLUDED.payout_method,payout_details=EXCLUDED.payout_details,updated_at=timezone('utc',now()) RETURNING * INTO v_profile; RETURN v_profile; END; $$;


ALTER FUNCTION "public"."submit_affiliate_application"("p_display_name" "text", "p_payout_method" "text", "p_payout_details" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_payment_proof"("p_order_id" "uuid", "p_payment_method" "text", "p_amount" numeric, "p_transaction_reference" "text", "p_proof_path" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_proof_id uuid;
  v_method text;
  v_total numeric;
  v_payment_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NULLIF(trim(COALESCE(p_proof_path, '')), '') IS NULL THEN RAISE EXCEPTION 'A proof file is required'; END IF;
  IF split_part(p_proof_path, '/', 1) <> v_user_id::text THEN RAISE EXCEPTION 'Invalid proof storage path'; END IF;

  SELECT payment_method, total, payment_status INTO v_method, v_total, v_payment_status
  FROM public.orders
  WHERE id = p_order_id AND customer_id = v_user_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_payment_status = 'paid' THEN RAISE EXCEPTION 'Payment is already confirmed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code = v_method AND is_active AND requires_proof) THEN
    RAISE EXCEPTION 'This order does not require a payment proof';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'payment-proofs' AND name = p_proof_path) THEN
    RAISE EXCEPTION 'Proof file was not found'; END IF;

  INSERT INTO public.payment_proofs (order_id, customer_id, payment_method, amount, transaction_reference, proof_path, status, reviewer_id, review_note, reviewed_at, submitted_at)
  VALUES (p_order_id, v_user_id, v_method, v_total, NULLIF(trim(p_transaction_reference), ''), p_proof_path, 'pending', NULL, NULL, NULL, timezone('utc', now()))
  ON CONFLICT (order_id) DO UPDATE SET
    payment_method = EXCLUDED.payment_method,
    amount = EXCLUDED.amount,
    transaction_reference = EXCLUDED.transaction_reference,
    proof_path = EXCLUDED.proof_path,
    status = 'pending', reviewer_id = NULL, review_note = NULL, reviewed_at = NULL, submitted_at = timezone('utc', now())
  WHERE public.payment_proofs.status IN ('pending', 'rejected')
  RETURNING id INTO v_proof_id;

  IF v_proof_id IS NULL THEN RAISE EXCEPTION 'A verified proof cannot be replaced'; END IF;
  UPDATE public.orders SET payment_status = 'proof_submitted', payment_reference = NULLIF(trim(p_transaction_reference), '') WHERE id = p_order_id;
  RETURN v_proof_id;
END;
$$;


ALTER FUNCTION "public"."submit_payment_proof"("p_order_id" "uuid", "p_payment_method" "text", "p_amount" numeric, "p_transaction_reference" "text", "p_proof_path" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."submit_purchased_product_review"("p_order_id" "uuid", "p_product_id" "uuid", "p_rating" integer, "p_comment" "text" DEFAULT NULL::"text", "p_image_paths" "text"[] DEFAULT '{}'::"text"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'storage'
    AS $_$
DECLARE
  v_customer_id uuid := auth.uid();
  v_review_id uuid;
  v_path text;
BEGIN
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required.';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5.';
  END IF;
  IF COALESCE(length(trim(p_comment)), 0) > 1000 THEN
    RAISE EXCEPTION 'Review text is too long.';
  END IF;
  IF COALESCE(cardinality(p_image_paths), 0) > 3 THEN
    RAISE EXCEPTION 'A maximum of three review photos is allowed.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
    WHERE o.id = p_order_id
      AND o.customer_id = v_customer_id
      AND o.status = 'delivered'
      AND (item->>'id')::uuid = p_product_id
  ) THEN
    RAISE EXCEPTION 'Only a delivered purchase of this product can be reviewed.';
  END IF;

  FOREACH v_path IN ARRAY COALESCE(p_image_paths, '{}'::text[])
  LOOP
    IF v_path !~ ('^' || v_customer_id::text || '/' || p_product_id::text || '/[^/]+$')
       OR NOT EXISTS (
         SELECT 1 FROM storage.objects so
         WHERE so.bucket_id = 'review-images'
           AND so.name = v_path
           AND so.owner_id = v_customer_id::text
       ) THEN
      RAISE EXCEPTION 'Invalid review image.';
    END IF;
  END LOOP;

  INSERT INTO public.reviews (
    order_id, product_id, user_id, user_name, rating, comment, image_paths, is_verified_purchase, status
  ) VALUES (
    p_order_id, p_product_id, v_customer_id, 'عميلة موثقة', p_rating, NULLIF(trim(p_comment), ''),
    COALESCE(p_image_paths, '{}'::text[]), true, 'published'
  )
  RETURNING id INTO v_review_id;

  RETURN v_review_id;
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'This product has already been reviewed for this order.';
END;
$_$;


ALTER FUNCTION "public"."submit_purchased_product_review"("p_order_id" "uuid", "p_product_id" "uuid", "p_rating" integer, "p_comment" "text", "p_image_paths" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."subscribe_restock"("p_product_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = p_product_id) THEN RAISE EXCEPTION 'Product not found'; END IF;
  INSERT INTO public.restock_subscriptions(customer_id, product_id, is_active, notified_at)
  VALUES (v_user_id, p_product_id, true, NULL)
  ON CONFLICT (customer_id, product_id) DO UPDATE
  SET is_active = true, notified_at = NULL;
END;
$$;


ALTER FUNCTION "public"."subscribe_restock"("p_product_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_product_stock_from_warehouses"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_product_id uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  UPDATE public.products
  SET stock = COALESCE((
    SELECT SUM(quantity) FROM public.warehouse_inventory WHERE product_id = v_product_id
  ), 0)
  WHERE id = v_product_id;
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."sync_product_stock_from_warehouses"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."transfer_warehouse_stock"("p_from_warehouse_id" "uuid", "p_to_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_note" "text" DEFAULT NULL::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_transfer_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN RAISE EXCEPTION 'Source and destination warehouses must differ'; END IF;
  IF p_quantity < 1 THEN RAISE EXCEPTION 'Transfer quantity must be positive'; END IF;

  UPDATE public.warehouse_inventory
  SET quantity = quantity - p_quantity, updated_at = timezone('utc', now())
  WHERE warehouse_id = p_from_warehouse_id AND product_id = p_product_id AND quantity >= p_quantity;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient stock in source warehouse'; END IF;

  INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
  VALUES (p_to_warehouse_id, p_product_id, p_quantity)
  ON CONFLICT (warehouse_id, product_id) DO UPDATE
  SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity,
      updated_at = timezone('utc', now());

  INSERT INTO public.stock_transfers (from_warehouse_id, to_warehouse_id, product_id, quantity, note, created_by)
  VALUES (p_from_warehouse_id, p_to_warehouse_id, p_product_id, p_quantity, p_note, (SELECT auth.uid()))
  RETURNING id INTO v_transfer_id;

  INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
  VALUES
    (p_from_warehouse_id, p_product_id, -p_quantity, 'transfer_out', p_note, v_transfer_id, (SELECT auth.uid())),
    (p_to_warehouse_id, p_product_id, p_quantity, 'transfer_in', p_note, v_transfer_id, (SELECT auth.uid()));

  RETURN v_transfer_id;
END;
$$;


ALTER FUNCTION "public"."transfer_warehouse_stock"("p_from_warehouse_id" "uuid", "p_to_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trigger_order_status_push"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$ DECLARE v_headers jsonb; v_authorization text; BEGIN IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status NOT IN ('shipped', 'delivered') THEN RETURN NEW; END IF; v_headers := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb; v_authorization := v_headers ->> 'authorization'; IF v_authorization IS NULL OR v_authorization = '' THEN RETURN NEW; END IF; PERFORM net.http_post(url := 'https://eaomyiihsuikinkdhwzy.supabase.co/functions/v1/order-status-push', headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_authorization), body := jsonb_build_object('order_id', NEW.id, 'status', NEW.status), timeout_milliseconds := 5000); RETURN NEW; END; $$;


ALTER FUNCTION "public"."trigger_order_status_push"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_driver_order_status"("p_order_id" "uuid", "p_status" "text", "p_note" "text" DEFAULT NULL::"text", "p_failure_reason" "text" DEFAULT NULL::"text") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE v_driver_id uuid; v_note text;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_status NOT IN ('shipped', 'delivered', 'delivery_failed') THEN RAISE EXCEPTION 'Drivers may only update active delivery states'; END IF;
  IF p_status = 'delivery_failed' AND NULLIF(trim(COALESCE(p_failure_reason, '')), '') IS NULL THEN RAISE EXCEPTION 'A delivery failure reason is required'; END IF;
  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;
  UPDATE public.orders SET status = p_status
  WHERE id = p_order_id AND driver_id = v_driver_id
    AND ((p_status = 'shipped' AND status IN ('confirmed', 'preparing')) OR (p_status IN ('delivered', 'delivery_failed') AND status = 'shipped'))
  RETURNING status INTO p_status;
  IF NOT FOUND THEN RAISE EXCEPTION 'This status transition is not available for the assigned order'; END IF;
  v_note := CASE WHEN p_status = 'delivery_failed' THEN concat('تعذر التسليم: ', trim(p_failure_reason), CASE WHEN NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN '' ELSE concat(' — ', trim(p_note)) END) ELSE COALESCE(NULLIF(trim(p_note), ''), 'تم التحديث من بوابة المندوب') END;
  INSERT INTO public.order_status_history(order_id, status, note, changed_by) VALUES (p_order_id, p_status, v_note, auth.uid());
  UPDATE public.drivers SET status = CASE WHEN p_status = 'shipped' THEN 'busy' ELSE 'active' END, updated_at = timezone('utc', now()) WHERE id = v_driver_id;
  IF p_status IN ('delivered', 'delivery_failed') AND NOT EXISTS (SELECT 1 FROM public.orders WHERE driver_id = v_driver_id AND status = 'shipped') THEN
    DELETE FROM public.driver_last_locations WHERE driver_id = v_driver_id;
  END IF;
  RETURN p_status;
END;
$$;


ALTER FUNCTION "public"."update_driver_order_status"("p_order_id" "uuid", "p_status" "text", "p_note" "text", "p_failure_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_product_review_summary"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_product_id uuid := COALESCE(NEW.product_id, OLD.product_id);
BEGIN
  PERFORM public.refresh_product_review_summary(v_product_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;


ALTER FUNCTION "public"."update_product_review_summary"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."affiliate_commissions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "affiliate_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "commission_rate" numeric NOT NULL,
    "commission_amount" numeric NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "affiliate_commissions_commission_amount_check" CHECK (("commission_amount" >= (0)::numeric)),
    CONSTRAINT "affiliate_commissions_commission_rate_check" CHECK (("commission_rate" >= (0)::numeric)),
    CONSTRAINT "affiliate_commissions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'paid'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."affiliate_commissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ai_request_limits" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."ai_request_limits" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."checkout_idempotency" (
    "customer_id" "uuid" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "order_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "checkout_idempotency_idempotency_key_check" CHECK ((("char_length"("idempotency_key") >= 16) AND ("char_length"("idempotency_key") <= 128)))
);


ALTER TABLE "public"."checkout_idempotency" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupon_redemptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "coupon_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "discount_amount" numeric NOT NULL,
    "redeemed_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "coupon_redemptions_discount_amount_check" CHECK (("discount_amount" > (0)::numeric))
);


ALTER TABLE "public"."coupon_redemptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."coupons" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "discount_type" "text" NOT NULL,
    "discount_value" numeric NOT NULL,
    "min_order_amount" numeric DEFAULT 0 NOT NULL,
    "max_discount_amount" numeric,
    "usage_limit" integer,
    "per_user_limit" integer DEFAULT 1 NOT NULL,
    "usage_count" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "coupons_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "coupons_discount_value_check" CHECK (("discount_value" > (0)::numeric)),
    CONSTRAINT "coupons_max_discount_amount_check" CHECK ((("max_discount_amount" IS NULL) OR ("max_discount_amount" > (0)::numeric))),
    CONSTRAINT "coupons_min_order_amount_check" CHECK (("min_order_amount" >= (0)::numeric)),
    CONSTRAINT "coupons_per_user_limit_check" CHECK (("per_user_limit" > 0)),
    CONSTRAINT "coupons_usage_count_check" CHECK (("usage_count" >= 0)),
    CONSTRAINT "coupons_usage_limit_check" CHECK ((("usage_limit" IS NULL) OR ("usage_limit" > 0)))
);


ALTER TABLE "public"."coupons" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_favorites" (
    "customer_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."customer_favorites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_notifications" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "product_id" "uuid",
    "type" "text" NOT NULL,
    "title_ar" "text" NOT NULL,
    "body_ar" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "read_at" timestamp with time zone
);


ALTER TABLE "public"."customer_notifications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customer_push_tokens" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "expo_push_token" "text" NOT NULL,
    "platform" "text" NOT NULL,
    "device_name" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "last_registered_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "invalidated_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "customer_push_tokens_platform_check" CHECK (("platform" = ANY (ARRAY['ios'::"text", 'android'::"text"])))
);


ALTER TABLE "public"."customer_push_tokens" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."delivery_zones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "warehouse_id" "uuid",
    "state" "text",
    CONSTRAINT "delivery_zones_fee_check" CHECK (("fee" >= (0)::numeric))
);


ALTER TABLE "public"."delivery_zones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."driver_last_locations" (
    "driver_id" "uuid" NOT NULL,
    "latitude" numeric(9,6) NOT NULL,
    "longitude" numeric(9,6) NOT NULL,
    "accuracy_meters" numeric(10,2),
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "driver_last_locations_accuracy_meters_check" CHECK ((("accuracy_meters" IS NULL) OR ("accuracy_meters" >= (0)::numeric))),
    CONSTRAINT "driver_last_locations_latitude_check" CHECK ((("latitude" >= ('-90'::integer)::numeric) AND ("latitude" <= (90)::numeric))),
    CONSTRAINT "driver_last_locations_longitude_check" CHECK ((("longitude" >= ('-180'::integer)::numeric) AND ("longitude" <= (180)::numeric)))
);


ALTER TABLE "public"."driver_last_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."drivers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "company" "text",
    "status" "text" DEFAULT 'offline'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "user_id" "uuid",
    "warehouse_id" "uuid",
    "vehicle" "text",
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "drivers_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'busy'::"text", 'offline'::"text"])))
);


ALTER TABLE "public"."drivers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_movements" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "warehouse_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity_delta" integer NOT NULL,
    "movement_type" "text" NOT NULL,
    "note" "text",
    "reference_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "inventory_movements_movement_type_check" CHECK (("movement_type" = ANY (ARRAY['adjustment'::"text", 'transfer_in'::"text", 'transfer_out'::"text", 'order_reservation'::"text"]))),
    CONSTRAINT "inventory_movements_quantity_delta_check" CHECK (("quantity_delta" <> 0))
);


ALTER TABLE "public"."inventory_movements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_ledger" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "points_delta" integer NOT NULL,
    "event_type" "text" NOT NULL,
    "note" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "loyalty_ledger_event_type_check" CHECK (("event_type" = ANY (ARRAY['earn'::"text", 'redeem'::"text", 'adjustment'::"text", 'refund_reversal'::"text", 'referral_bonus'::"text"]))),
    CONSTRAINT "loyalty_ledger_points_delta_check" CHECK (("points_delta" <> 0))
);


ALTER TABLE "public"."loyalty_ledger" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_settings" (
    "id" boolean DEFAULT true NOT NULL,
    "points_per_1000" numeric DEFAULT 10 NOT NULL,
    "currency_per_point" numeric DEFAULT 10 NOT NULL,
    "minimum_redemption_points" integer DEFAULT 50 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "loyalty_settings_currency_per_point_check" CHECK (("currency_per_point" > (0)::numeric)),
    CONSTRAINT "loyalty_settings_id_check" CHECK ("id"),
    CONSTRAINT "loyalty_settings_minimum_redemption_points_check" CHECK (("minimum_redemption_points" >= 0)),
    CONSTRAINT "loyalty_settings_points_per_1000_check" CHECK (("points_per_1000" >= (0)::numeric))
);


ALTER TABLE "public"."loyalty_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."loyalty_tiers" (
    "id" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "minimum_lifetime_points" integer NOT NULL,
    "points_multiplier" numeric DEFAULT 1 NOT NULL,
    "benefits_ar" "text",
    "display_order" integer NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    CONSTRAINT "loyalty_tiers_id_check" CHECK (("id" = ANY (ARRAY['bronze'::"text", 'silver'::"text", 'gold'::"text"]))),
    CONSTRAINT "loyalty_tiers_minimum_lifetime_points_check" CHECK (("minimum_lifetime_points" >= 0)),
    CONSTRAINT "loyalty_tiers_points_multiplier_check" CHECK (("points_multiplier" >= (1)::numeric))
);


ALTER TABLE "public"."loyalty_tiers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."notification_queue" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid",
    "customer_id" "uuid",
    "recipient_phone" "text",
    "channel" "text" DEFAULT 'whatsapp'::"text" NOT NULL,
    "event_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "provider_reference" "text",
    "error_message" "text",
    "sent_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "notification_queue_channel_check" CHECK (("channel" = ANY (ARRAY['whatsapp'::"text", 'sms'::"text"]))),
    CONSTRAINT "notification_queue_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sent'::"text", 'failed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."notification_queue" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_returns" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "reason" "text" NOT NULL,
    "requested_resolution" "text" NOT NULL,
    "status" "text" DEFAULT 'requested'::"text" NOT NULL,
    "customer_note" "text",
    "admin_note" "text",
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "restocked_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "order_returns_requested_resolution_check" CHECK (("requested_resolution" = ANY (ARRAY['refund'::"text", 'exchange'::"text", 'store_credit'::"text"]))),
    CONSTRAINT "order_returns_status_check" CHECK (("status" = ANY (ARRAY['requested'::"text", 'approved'::"text", 'rejected'::"text", 'received'::"text", 'refunded'::"text", 'closed'::"text"])))
);


ALTER TABLE "public"."order_returns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."order_status_history" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "status" "text" NOT NULL,
    "note" "text",
    "changed_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."order_status_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid",
    "customer_name" "text",
    "phone" "text",
    "items" "jsonb",
    "total" numeric,
    "status" "text" DEFAULT 'new'::"text",
    "payment_method" "text",
    "payment_status" "text" DEFAULT 'pending'::"text",
    "shipping_address" "text",
    "city" "text",
    "state" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "financial_status" "text" DEFAULT 'pending'::"text",
    "driver_id" "uuid",
    "order_number" "text",
    "shipping_fee" numeric(12,2) DEFAULT 0 NOT NULL,
    "fulfillment_warehouse_id" "uuid",
    "coupon_code" "text",
    "discount_amount" numeric DEFAULT 0 NOT NULL,
    "points_redeemed" integer DEFAULT 0 NOT NULL,
    "points_discount" numeric DEFAULT 0 NOT NULL,
    "points_earned" integer DEFAULT 0 NOT NULL,
    "payment_reference" "text",
    "referral_code" "text",
    "referral_referrer_id" "uuid",
    "affiliate_code" "text",
    "affiliate_id" "uuid",
    CONSTRAINT "orders_discount_amount_check" CHECK (("discount_amount" >= (0)::numeric)),
    CONSTRAINT "orders_financial_status_check" CHECK (("financial_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'partially_paid'::"text", 'refunded'::"text"]))),
    CONSTRAINT "orders_points_discount_check" CHECK (("points_discount" >= (0)::numeric)),
    CONSTRAINT "orders_points_earned_check" CHECK (("points_earned" >= 0)),
    CONSTRAINT "orders_points_redeemed_check" CHECK (("points_redeemed" >= 0))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_methods" (
    "code" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "description_ar" "text",
    "requires_proof" boolean DEFAULT false NOT NULL,
    "account_details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "payment_methods_code_check" CHECK (("code" = ANY (ARRAY['COD'::"text", 'BANK_TRANSFER'::"text", 'Fawry'::"text", 'Mychashi'::"text"])))
);


ALTER TABLE "public"."payment_methods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payment_proofs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "payment_method" "text" NOT NULL,
    "amount" numeric NOT NULL,
    "transaction_reference" "text",
    "proof_path" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewer_id" "uuid",
    "review_note" "text",
    "submitted_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "reviewed_at" timestamp with time zone,
    CONSTRAINT "payment_proofs_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "payment_proofs_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'verified'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."payment_proofs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."products" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name_ar" "text",
    "name_en" "text",
    "price" numeric,
    "discount_percentage" numeric,
    "cost_price" numeric,
    "category" "text",
    "brand" "text",
    "image" "text",
    "images" "text"[],
    "description" "text",
    "benefits" "text"[],
    "ingredients" "text"[],
    "usage" "text",
    "origin" "text",
    "expiry" "text",
    "stock" integer,
    "is_imported" boolean DEFAULT false,
    "skin_type" "text"[],
    "reviews_count" integer DEFAULT 0,
    "average_rating" numeric DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "variants" "jsonb" DEFAULT '[]'::"jsonb"
);


ALTER TABLE "public"."products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "role" "text" DEFAULT 'customer'::"text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "beauty_points" integer DEFAULT 0,
    "loyalty_lifetime_points" integer DEFAULT 0 NOT NULL,
    "loyalty_tier" "text" DEFAULT 'bronze'::"text" NOT NULL,
    "referral_code" "text",
    "referred_by" "uuid",
    CONSTRAINT "profiles_loyalty_lifetime_points_check" CHECK (("loyalty_lifetime_points" >= 0)),
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['customer'::"text", 'admin'::"text", 'driver'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promotions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "discount_value" numeric NOT NULL,
    "discount_type" "text",
    "status" "text" DEFAULT 'active'::"text",
    "target_group" "text" DEFAULT 'all'::"text",
    "start_date" timestamp with time zone DEFAULT "now"(),
    "end_date" timestamp with time zone,
    "usage_count" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promotions_discount_type_check" CHECK (("discount_type" = ANY (ARRAY['percentage'::"text", 'fixed'::"text"]))),
    CONSTRAINT "promotions_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'scheduled'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."promotions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."push_notification_deliveries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "push_token_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "status" "text" NOT NULL,
    "expo_ticket_id" "text",
    "error_message" "text",
    "response_payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "push_notification_deliveries_event_type_check" CHECK (("event_type" = ANY (ARRAY['shipped'::"text", 'delivered'::"text", 'review_request'::"text"]))),
    CONSTRAINT "push_notification_deliveries_status_check" CHECK (("status" = ANY (ARRAY['submitted'::"text", 'failed'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."push_notification_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."referral_rewards" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "referrer_id" "uuid" NOT NULL,
    "referred_customer_id" "uuid" NOT NULL,
    "order_id" "uuid" NOT NULL,
    "points_awarded" integer DEFAULT 100 NOT NULL,
    "status" "text" DEFAULT 'available'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "referral_rewards_points_awarded_check" CHECK (("points_awarded" > 0)),
    CONSTRAINT "referral_rewards_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'available'::"text", 'reversed'::"text"])))
);


ALTER TABLE "public"."referral_rewards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."restock_subscriptions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "customer_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "notified_at" timestamp with time zone
);


ALTER TABLE "public"."restock_subscriptions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."reviews" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "product_id" "uuid",
    "user_id" "uuid",
    "user_name" "text",
    "rating" integer,
    "comment" "text",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "order_id" "uuid",
    "image_paths" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "is_verified_purchase" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'published'::"text" NOT NULL,
    CONSTRAINT "reviews_rating_check" CHECK ((("rating" >= 1) AND ("rating" <= 5))),
    CONSTRAINT "reviews_status_check" CHECK (("status" = ANY (ARRAY['published'::"text", 'hidden'::"text"])))
);


ALTER TABLE "public"."reviews" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_transfers" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "from_warehouse_id" "uuid" NOT NULL,
    "to_warehouse_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer NOT NULL,
    "note" "text",
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "stock_transfers_check" CHECK (("from_warehouse_id" <> "to_warehouse_id")),
    CONSTRAINT "stock_transfers_quantity_check" CHECK (("quantity" > 0)),
    CONSTRAINT "stock_transfers_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."stock_transfers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storefront_banners" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "title_ar" "text" NOT NULL,
    "subtitle_ar" "text",
    "image_url" "text",
    "action_type" "text" DEFAULT 'collection'::"text" NOT NULL,
    "action_value" "text",
    "display_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "starts_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "ends_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "storefront_banners_action_type_check" CHECK (("action_type" = ANY (ARRAY['collection'::"text", 'category'::"text", 'product'::"text", 'url'::"text", 'none'::"text"]))),
    CONSTRAINT "storefront_banners_check" CHECK ((("ends_at" IS NULL) OR ("ends_at" >= "starts_at")))
);


ALTER TABLE "public"."storefront_banners" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storefront_collection_products" (
    "collection_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."storefront_collection_products" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."storefront_collections" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "slug" "text" NOT NULL,
    "name_ar" "text" NOT NULL,
    "description_ar" "text",
    "icon" "text" DEFAULT 'auto-awesome'::"text" NOT NULL,
    "rule_type" "text" NOT NULL,
    "rule_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "display_order" integer DEFAULT 100 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "storefront_collections_rule_type_check" CHECK (("rule_type" = ANY (ARRAY['manual'::"text", 'newest'::"text", 'best_sellers'::"text", 'discount'::"text", 'price_under'::"text", 'category'::"text"]))),
    CONSTRAINT "storefront_collections_slug_check" CHECK (("slug" ~ '^[a-z0-9-]+$'::"text"))
);


ALTER TABLE "public"."storefront_collections" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouse_inventory" (
    "warehouse_id" "uuid" NOT NULL,
    "product_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 0 NOT NULL,
    "reorder_level" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    CONSTRAINT "warehouse_inventory_quantity_check" CHECK (("quantity" >= 0)),
    CONSTRAINT "warehouse_inventory_reorder_level_check" CHECK (("reorder_level" >= 0))
);


ALTER TABLE "public"."warehouse_inventory" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."warehouses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text" NOT NULL,
    "state" "text" NOT NULL,
    "city" "text" NOT NULL,
    "address" "text",
    "phone" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);


ALTER TABLE "public"."warehouses" OWNER TO "postgres";


ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."affiliate_profiles"
    ADD CONSTRAINT "affiliate_profiles_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."affiliate_profiles"
    ADD CONSTRAINT "affiliate_profiles_customer_id_key" UNIQUE ("customer_id");



ALTER TABLE ONLY "public"."affiliate_profiles"
    ADD CONSTRAINT "affiliate_profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ai_request_limits"
    ADD CONSTRAINT "ai_request_limits_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."checkout_idempotency"
    ADD CONSTRAINT "checkout_idempotency_pkey" PRIMARY KEY ("customer_id", "idempotency_key");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."coupons"
    ADD CONSTRAINT "coupons_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_pkey" PRIMARY KEY ("customer_id", "product_id");



ALTER TABLE ONLY "public"."customer_notifications"
    ADD CONSTRAINT "customer_notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customer_push_tokens"
    ADD CONSTRAINT "customer_push_tokens_expo_push_token_key" UNIQUE ("expo_push_token");



ALTER TABLE ONLY "public"."customer_push_tokens"
    ADD CONSTRAINT "customer_push_tokens_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."driver_last_locations"
    ADD CONSTRAINT "driver_last_locations_pkey" PRIMARY KEY ("driver_id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_settings"
    ADD CONSTRAINT "loyalty_settings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."loyalty_tiers"
    ADD CONSTRAINT "loyalty_tiers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payment_methods"
    ADD CONSTRAINT "payment_methods_pkey" PRIMARY KEY ("code");



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."products"
    ADD CONSTRAINT "products_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promotions"
    ADD CONSTRAINT "promotions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."push_notification_deliveries"
    ADD CONSTRAINT "push_notification_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_order_id_key" UNIQUE ("order_id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referred_customer_id_key" UNIQUE ("referred_customer_id");



ALTER TABLE ONLY "public"."restock_subscriptions"
    ADD CONSTRAINT "restock_subscriptions_customer_id_product_id_key" UNIQUE ("customer_id", "product_id");



ALTER TABLE ONLY "public"."restock_subscriptions"
    ADD CONSTRAINT "restock_subscriptions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storefront_banners"
    ADD CONSTRAINT "storefront_banners_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storefront_collection_products"
    ADD CONSTRAINT "storefront_collection_products_pkey" PRIMARY KEY ("collection_id", "product_id");



ALTER TABLE ONLY "public"."storefront_collections"
    ADD CONSTRAINT "storefront_collections_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."storefront_collections"
    ADD CONSTRAINT "storefront_collections_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."push_notification_deliveries"
    ADD CONSTRAINT "unique_order_push_event_per_device" UNIQUE ("order_id", "event_type", "push_token_id");



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_pkey" PRIMARY KEY ("warehouse_id", "product_id");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_name_state_city_key" UNIQUE ("name", "state", "city");



ALTER TABLE ONLY "public"."warehouses"
    ADD CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id");



CREATE INDEX "affiliate_commissions_affiliate_status_idx" ON "public"."affiliate_commissions" USING "btree" ("affiliate_id", "status", "created_at" DESC);



CREATE INDEX "ai_request_limits_customer_created_idx" ON "public"."ai_request_limits" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "customer_favorites_customer_created_idx" ON "public"."customer_favorites" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "customer_notifications_inbox_idx" ON "public"."customer_notifications" USING "btree" ("customer_id", "is_read", "created_at" DESC);



CREATE UNIQUE INDEX "customer_notifications_order_event_unique" ON "public"."customer_notifications" USING "btree" ("order_id", "type") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "customer_push_tokens_customer_active_idx" ON "public"."customer_push_tokens" USING "btree" ("customer_id") WHERE "is_active";



CREATE INDEX "driver_last_locations_updated_at_idx" ON "public"."driver_last_locations" USING "btree" ("updated_at" DESC);



CREATE INDEX "drivers_user_idx" ON "public"."drivers" USING "btree" ("user_id");



CREATE INDEX "inventory_movements_warehouse_created_idx" ON "public"."inventory_movements" USING "btree" ("warehouse_id", "created_at" DESC);



CREATE UNIQUE INDEX "loyalty_order_event_once_idx" ON "public"."loyalty_ledger" USING "btree" ("order_id", "event_type") WHERE (("order_id" IS NOT NULL) AND ("event_type" = ANY (ARRAY['earn'::"text", 'redeem'::"text"])));



CREATE INDEX "notification_queue_status_idx" ON "public"."notification_queue" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "order_returns_customer_idx" ON "public"."order_returns" USING "btree" ("customer_id", "created_at" DESC);



CREATE INDEX "order_returns_status_idx" ON "public"."order_returns" USING "btree" ("status", "created_at" DESC);



CREATE INDEX "order_status_history_order_id_idx" ON "public"."order_status_history" USING "btree" ("order_id", "created_at" DESC);



CREATE INDEX "orders_affiliate_idx" ON "public"."orders" USING "btree" ("affiliate_id") WHERE ("affiliate_id" IS NOT NULL);



CREATE INDEX "orders_customer_id_idx" ON "public"."orders" USING "btree" ("customer_id");



CREATE INDEX "orders_driver_idx" ON "public"."orders" USING "btree" ("driver_id");



CREATE INDEX "orders_fulfillment_warehouse_idx" ON "public"."orders" USING "btree" ("fulfillment_warehouse_id");



CREATE UNIQUE INDEX "orders_order_number_key" ON "public"."orders" USING "btree" ("order_number") WHERE ("order_number" IS NOT NULL);



CREATE INDEX "orders_referral_referrer_idx" ON "public"."orders" USING "btree" ("referral_referrer_id") WHERE ("referral_referrer_id" IS NOT NULL);



CREATE UNIQUE INDEX "profiles_referral_code_unique_idx" ON "public"."profiles" USING "btree" ("referral_code") WHERE ("referral_code" IS NOT NULL);



CREATE INDEX "push_deliveries_receipt_idx" ON "public"."push_notification_deliveries" USING "btree" ("expo_ticket_id") WHERE ("expo_ticket_id" IS NOT NULL);



CREATE INDEX "restock_subscriptions_product_active_idx" ON "public"."restock_subscriptions" USING "btree" ("product_id") WHERE "is_active";



CREATE UNIQUE INDEX "reviews_one_per_customer_order_product_idx" ON "public"."reviews" USING "btree" ("order_id", "user_id", "product_id") WHERE ("order_id" IS NOT NULL);



CREATE INDEX "reviews_product_id_idx" ON "public"."reviews" USING "btree" ("product_id");



CREATE INDEX "reviews_public_product_created_idx" ON "public"."reviews" USING "btree" ("product_id", "created_at" DESC) WHERE (("status" = 'published'::"text") AND "is_verified_purchase");



CREATE INDEX "reviews_user_id_idx" ON "public"."reviews" USING "btree" ("user_id");



CREATE INDEX "storefront_banners_active_idx" ON "public"."storefront_banners" USING "btree" ("display_order") WHERE "is_active";



CREATE INDEX "storefront_collection_products_order_idx" ON "public"."storefront_collection_products" USING "btree" ("collection_id", "display_order");



CREATE INDEX "warehouse_inventory_product_idx" ON "public"."warehouse_inventory" USING "btree" ("product_id");



CREATE INDEX "warehouse_inventory_warehouse_idx" ON "public"."warehouse_inventory" USING "btree" ("warehouse_id");



CREATE OR REPLACE TRIGGER "on_order_delivery_status_push" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."trigger_order_status_push"();



CREATE OR REPLACE TRIGGER "orders_award_growth_rewards" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."award_growth_rewards"();



CREATE OR REPLACE TRIGGER "orders_award_loyalty_points" BEFORE UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."award_order_loyalty_points"();



CREATE OR REPLACE TRIGGER "orders_create_internal_notifications" AFTER INSERT OR UPDATE OF "status", "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."order_create_internal_notification"();



CREATE OR REPLACE TRIGGER "orders_create_review_request_notification" AFTER UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."order_create_review_request_notification"();



CREATE OR REPLACE TRIGGER "orders_queue_notifications" AFTER INSERT OR UPDATE OF "status", "payment_status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."queue_order_notification"();



CREATE OR REPLACE TRIGGER "products_notify_restock_subscribers" AFTER UPDATE OF "stock" ON "public"."products" FOR EACH ROW EXECUTE FUNCTION "public"."products_restock_notification"();



CREATE OR REPLACE TRIGGER "profiles_create_referral_code" BEFORE INSERT ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."create_profile_referral_code"();



CREATE OR REPLACE TRIGGER "profiles_prevent_role_change" BEFORE UPDATE OF "role" ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_profile_role_change"();



CREATE OR REPLACE TRIGGER "returns_queue_notifications" AFTER INSERT OR UPDATE OF "status" ON "public"."order_returns" FOR EACH ROW EXECUTE FUNCTION "public"."queue_return_notification"();



CREATE OR REPLACE TRIGGER "reviews_refresh_product_summary" AFTER INSERT OR DELETE OR UPDATE OF "rating", "status", "is_verified_purchase" ON "public"."reviews" FOR EACH ROW EXECUTE FUNCTION "public"."update_product_review_summary"();



CREATE OR REPLACE TRIGGER "warehouse_inventory_notify_restock_subscribers" AFTER INSERT OR UPDATE OF "quantity" ON "public"."warehouse_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."inventory_restock_notification"();



CREATE OR REPLACE TRIGGER "warehouse_inventory_sync_product_stock" AFTER INSERT OR DELETE OR UPDATE ON "public"."warehouse_inventory" FOR EACH ROW EXECUTE FUNCTION "public"."sync_product_stock_from_warehouses"();



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."affiliate_commissions"
    ADD CONSTRAINT "affiliate_commissions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."affiliate_profiles"
    ADD CONSTRAINT "affiliate_profiles_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."affiliate_profiles"
    ADD CONSTRAINT "affiliate_profiles_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ai_request_limits"
    ADD CONSTRAINT "ai_request_limits_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkout_idempotency"
    ADD CONSTRAINT "checkout_idempotency_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."checkout_idempotency"
    ADD CONSTRAINT "checkout_idempotency_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."coupon_redemptions"
    ADD CONSTRAINT "coupon_redemptions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_favorites"
    ADD CONSTRAINT "customer_favorites_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notifications"
    ADD CONSTRAINT "customer_notifications_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notifications"
    ADD CONSTRAINT "customer_notifications_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_notifications"
    ADD CONSTRAINT "customer_notifications_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customer_push_tokens"
    ADD CONSTRAINT "customer_push_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."delivery_zones"
    ADD CONSTRAINT "delivery_zones_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."driver_last_locations"
    ADD CONSTRAINT "driver_last_locations_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."drivers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."drivers"
    ADD CONSTRAINT "drivers_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."inventory_movements"
    ADD CONSTRAINT "inventory_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."loyalty_ledger"
    ADD CONSTRAINT "loyalty_ledger_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."notification_queue"
    ADD CONSTRAINT "notification_queue_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."order_returns"
    ADD CONSTRAINT "order_returns_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."order_status_history"
    ADD CONSTRAINT "order_status_history_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_affiliate_id_fkey" FOREIGN KEY ("affiliate_id") REFERENCES "public"."affiliate_profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_fulfillment_warehouse_id_fkey" FOREIGN KEY ("fulfillment_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_referral_referrer_id_fkey" FOREIGN KEY ("referral_referrer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_payment_method_fkey" FOREIGN KEY ("payment_method") REFERENCES "public"."payment_methods"("code");



ALTER TABLE ONLY "public"."payment_proofs"
    ADD CONSTRAINT "payment_proofs_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_loyalty_tier_fkey" FOREIGN KEY ("loyalty_tier") REFERENCES "public"."loyalty_tiers"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_referred_by_fkey" FOREIGN KEY ("referred_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."push_notification_deliveries"
    ADD CONSTRAINT "push_notification_deliveries_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_deliveries"
    ADD CONSTRAINT "push_notification_deliveries_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."push_notification_deliveries"
    ADD CONSTRAINT "push_notification_deliveries_push_token_id_fkey" FOREIGN KEY ("push_token_id") REFERENCES "public"."customer_push_tokens"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referred_customer_id_fkey" FOREIGN KEY ("referred_customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."referral_rewards"
    ADD CONSTRAINT "referral_rewards_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restock_subscriptions"
    ADD CONSTRAINT "restock_subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."restock_subscriptions"
    ADD CONSTRAINT "restock_subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."reviews"
    ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."stock_transfers"
    ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."storefront_collection_products"
    ADD CONSTRAINT "storefront_collection_products_collection_id_fkey" FOREIGN KEY ("collection_id") REFERENCES "public"."storefront_collections"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."storefront_collection_products"
    ADD CONSTRAINT "storefront_collection_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."warehouse_inventory"
    ADD CONSTRAINT "warehouse_inventory_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can delete orders" ON "public"."orders" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can delete products" ON "public"."products" FOR DELETE TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins can insert products" ON "public"."products" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can manage promotions" ON "public"."promotions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins can update products" ON "public"."products" FOR UPDATE TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage affiliate commissions" ON "public"."affiliate_commissions" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage affiliate profiles" ON "public"."affiliate_profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage collection products" ON "public"."storefront_collection_products" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage coupons" ON "public"."coupons" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage customer push tokens" ON "public"."customer_push_tokens" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage delivery zones" ON "public"."delivery_zones" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage drivers" ON "public"."drivers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage loyalty ledger" ON "public"."loyalty_ledger" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage loyalty settings" ON "public"."loyalty_settings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage loyalty tiers" ON "public"."loyalty_tiers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage notification queue" ON "public"."notification_queue" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage payment methods" ON "public"."payment_methods" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage payment proofs" ON "public"."payment_proofs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage referral rewards" ON "public"."referral_rewards" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage returns" ON "public"."order_returns" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage reviews" ON "public"."reviews" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage stock transfers" ON "public"."stock_transfers" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage storefront banners" ON "public"."storefront_banners" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage storefront collections" ON "public"."storefront_collections" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage warehouse inventory" ON "public"."warehouse_inventory" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins manage warehouses" ON "public"."warehouses" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins view coupon redemptions" ON "public"."coupon_redemptions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view driver locations" ON "public"."driver_last_locations" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view inventory movements" ON "public"."inventory_movements" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "Admins view notifications" ON "public"."customer_notifications" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view push deliveries" ON "public"."push_notification_deliveries" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Admins view restock subscriptions" ON "public"."restock_subscriptions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "Affiliates view own commissions" ON "public"."affiliate_commissions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."affiliate_profiles" "ap"
  WHERE (("ap"."id" = "affiliate_commissions"."affiliate_id") AND ("ap"."customer_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "Anyone can view active delivery zones" ON "public"."delivery_zones" FOR SELECT TO "authenticated", "anon" USING ((("is_active" = true) OR "public"."is_admin"()));



CREATE POLICY "Anyone can view active promotions" ON "public"."promotions" FOR SELECT TO "authenticated", "anon" USING ((("status" = 'active'::"text") OR "public"."is_admin"()));



CREATE POLICY "Anyone can view products" ON "public"."products" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "Customers add own favorites" ON "public"."customer_favorites" FOR INSERT TO "authenticated" WITH CHECK (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers delete own favorites" ON "public"."customer_favorites" FOR DELETE TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers manage restock subscriptions" ON "public"."restock_subscriptions" TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers update own notifications" ON "public"."customer_notifications" FOR UPDATE TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view loyalty ledger" ON "public"."loyalty_ledger" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view own affiliate profile" ON "public"."affiliate_profiles" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view own favorites" ON "public"."customer_favorites" FOR SELECT TO "authenticated" USING (("customer_id" = "auth"."uid"()));



CREATE POLICY "Customers view own notifications" ON "public"."customer_notifications" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view own order history" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."orders" "o"
  WHERE (("o"."id" = "order_status_history"."order_id") AND (("o"."customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"())))));



CREATE POLICY "Customers view own payment proofs" ON "public"."payment_proofs" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view own referral rewards" ON "public"."referral_rewards" FOR SELECT TO "authenticated" USING (("referrer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Customers view own returns" ON "public"."order_returns" FOR SELECT TO "authenticated" USING (("customer_id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Drivers view assigned orders" ON "public"."orders" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR (EXISTS ( SELECT 1
   FROM "public"."drivers" "d"
  WHERE (("d"."id" = "orders"."driver_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Drivers view their order history" ON "public"."order_status_history" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."orders" "o"
     JOIN "public"."drivers" "d" ON (("d"."id" = "o"."driver_id")))
  WHERE (("o"."id" = "order_status_history"."order_id") AND ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid")))))));



CREATE POLICY "Drivers view their profile" ON "public"."drivers" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR ("user_id" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "No direct client access" ON "public"."ai_request_limits" AS RESTRICTIVE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "No direct client access" ON "public"."checkout_idempotency" AS RESTRICTIVE TO "authenticated" USING (false) WITH CHECK (false);



CREATE POLICY "Public view active collection products" ON "public"."storefront_collection_products" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."storefront_collections" "c"
  WHERE (("c"."id" = "storefront_collection_products"."collection_id") AND "c"."is_active"))));



CREATE POLICY "Public view active loyalty tiers" ON "public"."loyalty_tiers" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "Public view active payment methods" ON "public"."payment_methods" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



CREATE POLICY "Public view active storefront banners" ON "public"."storefront_banners" FOR SELECT TO "authenticated", "anon" USING (("is_active" AND ("starts_at" <= "timezone"('utc'::"text", "now"())) AND (("ends_at" IS NULL) OR ("ends_at" >= "timezone"('utc'::"text", "now"())))));



CREATE POLICY "Public view active storefront collections" ON "public"."storefront_collections" FOR SELECT TO "authenticated", "anon" USING ("is_active");



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("id" = ( SELECT "auth"."uid"() AS "uid")));



CREATE POLICY "Users can view own orders" ON "public"."orders" FOR SELECT TO "authenticated" USING ((("customer_id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



CREATE POLICY "Users can view own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR "public"."is_admin"()));



ALTER TABLE "public"."affiliate_commissions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."affiliate_profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ai_request_limits" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."checkout_idempotency" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupon_redemptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."coupons" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_favorites" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_notifications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."customer_push_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."delivery_zones" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."driver_last_locations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."drivers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."inventory_movements" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_ledger" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_settings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."loyalty_tiers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."notification_queue" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_returns" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."order_status_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_methods" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."payment_proofs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."promotions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."push_notification_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."referral_rewards" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."restock_subscriptions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."reviews" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."stock_transfers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storefront_banners" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storefront_collection_products" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."storefront_collections" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouse_inventory" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."warehouses" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."customer_notifications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."driver_last_locations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."order_status_history";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."orders";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































REVOKE ALL ON FUNCTION "public"."adjust_loyalty_points"("p_customer_id" "uuid", "p_points_delta" integer, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_loyalty_points"("p_customer_id" "uuid", "p_points_delta" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_loyalty_points"("p_customer_id" "uuid", "p_points_delta" integer, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."adjust_warehouse_inventory"("p_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity_delta" integer, "p_note" "text", "p_reorder_level" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."adjust_warehouse_inventory"("p_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity_delta" integer, "p_note" "text", "p_reorder_level" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."adjust_warehouse_inventory"("p_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity_delta" integer, "p_note" "text", "p_reorder_level" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_business_report"("p_start" "date", "p_end" "date") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_business_report"("p_start" "date", "p_end" "date") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_business_report"("p_start" "date", "p_end" "date") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_update_order_operation"("p_order_id" "uuid", "p_expected_status" "text", "p_status" "text", "p_driver_id" "uuid", "p_warehouse_id" "uuid", "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_update_order_operation"("p_order_id" "uuid", "p_expected_status" "text", "p_status" "text", "p_driver_id" "uuid", "p_warehouse_id" "uuid", "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_update_order_operation"("p_order_id" "uuid", "p_expected_status" "text", "p_status" "text", "p_driver_id" "uuid", "p_warehouse_id" "uuid", "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_growth_rewards"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_growth_rewards"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_order_loyalty_points"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_order_loyalty_points"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."checkout_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checkout_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."checkout_order_safe"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checkout_order_safe"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_order_safe"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."checkout_order_with_growth"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb", "p_coupon_code" "text", "p_points_to_redeem" integer, "p_referral_code" "text", "p_affiliate_code" "text", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."clear_driver_location"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."clear_driver_location"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."clear_driver_location"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_customer_notification"("p_customer_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_order_id" "uuid", "p_product_id" "uuid", "p_payload" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_customer_notification"("p_customer_id" "uuid", "p_type" "text", "p_title" "text", "p_body" "text", "p_order_id" "uuid", "p_product_id" "uuid", "p_payload" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order"("p_customer_name" "text", "p_phone" "text", "p_shipping_address" "text", "p_city" "text", "p_state" "text", "p_payment_method" "text", "p_items" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_profile_referral_code"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_profile_referral_code"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_admin_product_review_stats"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_admin_product_review_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_admin_product_review_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_product"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_product"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_product"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_product_reviews"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_public_product_sales_metrics"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_public_product_sales_metrics"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_product_sales_metrics"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_product_sales_metrics"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_public_products"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_public_products"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_public_products"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_reviewable_order_items"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_reviewable_order_items"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_reviewable_order_items"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."get_storefront_collections"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."get_storefront_collections"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_storefront_collections"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_storefront_collections"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."inventory_restock_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."inventory_restock_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."is_driver"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_driver"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_driver"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."moderate_product_review"("p_review_id" "uuid", "p_status" "text", "p_remove_images" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."moderate_product_review"("p_review_id" "uuid", "p_status" "text", "p_remove_images" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."moderate_product_review"("p_review_id" "uuid", "p_status" "text", "p_remove_images" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."notify_restock_subscribers"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."notify_restock_subscribers"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."order_create_internal_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_create_internal_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."order_create_review_request_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."order_create_review_request_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."prevent_profile_role_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."prevent_profile_role_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."products_restock_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."products_restock_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_order_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_order_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."queue_return_notification"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."queue_return_notification"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."refresh_product_review_summary"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_customer_push_token"("p_expo_push_token" "text", "p_platform" "text", "p_device_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_customer_push_token"("p_expo_push_token" "text", "p_platform" "text", "p_device_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_customer_push_token"("p_expo_push_token" "text", "p_platform" "text", "p_device_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."request_order_return"("p_order_id" "uuid", "p_items" "jsonb", "p_reason" "text", "p_requested_resolution" "text", "p_customer_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."request_order_return"("p_order_id" "uuid", "p_items" "jsonb", "p_reason" "text", "p_requested_resolution" "text", "p_customer_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."request_order_return"("p_order_id" "uuid", "p_items" "jsonb", "p_reason" "text", "p_requested_resolution" "text", "p_customer_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_affiliate_commission"("p_commission_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_affiliate_commission"("p_commission_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_affiliate_commission"("p_commission_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_order_return"("p_return_id" "uuid", "p_status" "text", "p_admin_note" "text", "p_restock" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_order_return"("p_return_id" "uuid", "p_status" "text", "p_admin_note" "text", "p_restock" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_order_return"("p_return_id" "uuid", "p_status" "text", "p_admin_note" "text", "p_restock" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."review_payment_proof"("p_proof_id" "uuid", "p_status" "text", "p_review_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."review_payment_proof"("p_proof_id" "uuid", "p_status" "text", "p_review_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."review_payment_proof"("p_proof_id" "uuid", "p_status" "text", "p_review_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_affiliate_status"("p_affiliate_id" "uuid", "p_status" "text", "p_commission_rate" numeric, "p_admin_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_affiliate_status"("p_affiliate_id" "uuid", "p_status" "text", "p_commission_rate" numeric, "p_admin_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_affiliate_status"("p_affiliate_id" "uuid", "p_status" "text", "p_commission_rate" numeric, "p_admin_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_driver_availability"("p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_driver_availability"("p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_driver_availability"("p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."share_driver_location"("p_latitude" numeric, "p_longitude" numeric, "p_accuracy_meters" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."share_driver_location"("p_latitude" numeric, "p_longitude" numeric, "p_accuracy_meters" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."share_driver_location"("p_latitude" numeric, "p_longitude" numeric, "p_accuracy_meters" numeric) TO "service_role";



GRANT ALL ON TABLE "public"."affiliate_profiles" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."affiliate_profiles" TO "authenticated";



REVOKE ALL ON FUNCTION "public"."submit_affiliate_application"("p_display_name" "text", "p_payout_method" "text", "p_payout_details" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_affiliate_application"("p_display_name" "text", "p_payout_method" "text", "p_payout_details" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_affiliate_application"("p_display_name" "text", "p_payout_method" "text", "p_payout_details" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_payment_proof"("p_order_id" "uuid", "p_payment_method" "text", "p_amount" numeric, "p_transaction_reference" "text", "p_proof_path" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_payment_proof"("p_order_id" "uuid", "p_payment_method" "text", "p_amount" numeric, "p_transaction_reference" "text", "p_proof_path" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_payment_proof"("p_order_id" "uuid", "p_payment_method" "text", "p_amount" numeric, "p_transaction_reference" "text", "p_proof_path" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."submit_purchased_product_review"("p_order_id" "uuid", "p_product_id" "uuid", "p_rating" integer, "p_comment" "text", "p_image_paths" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."submit_purchased_product_review"("p_order_id" "uuid", "p_product_id" "uuid", "p_rating" integer, "p_comment" "text", "p_image_paths" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."submit_purchased_product_review"("p_order_id" "uuid", "p_product_id" "uuid", "p_rating" integer, "p_comment" "text", "p_image_paths" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."subscribe_restock"("p_product_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."subscribe_restock"("p_product_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."subscribe_restock"("p_product_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."sync_product_stock_from_warehouses"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sync_product_stock_from_warehouses"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."transfer_warehouse_stock"("p_from_warehouse_id" "uuid", "p_to_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_warehouse_stock"("p_from_warehouse_id" "uuid", "p_to_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."transfer_warehouse_stock"("p_from_warehouse_id" "uuid", "p_to_warehouse_id" "uuid", "p_product_id" "uuid", "p_quantity" integer, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."trigger_order_status_push"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."trigger_order_status_push"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_driver_order_status"("p_order_id" "uuid", "p_status" "text", "p_note" "text", "p_failure_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_driver_order_status"("p_order_id" "uuid", "p_status" "text", "p_note" "text", "p_failure_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_driver_order_status"("p_order_id" "uuid", "p_status" "text", "p_note" "text", "p_failure_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_product_review_summary"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_product_review_summary"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_product_review_summary"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_product_review_summary"() TO "service_role";


















GRANT ALL ON TABLE "public"."affiliate_commissions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."affiliate_commissions" TO "authenticated";



GRANT ALL ON TABLE "public"."ai_request_limits" TO "service_role";



GRANT ALL ON TABLE "public"."checkout_idempotency" TO "service_role";



GRANT ALL ON TABLE "public"."coupon_redemptions" TO "service_role";
GRANT SELECT ON TABLE "public"."coupon_redemptions" TO "authenticated";



GRANT ALL ON TABLE "public"."coupons" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."coupons" TO "authenticated";



GRANT ALL ON TABLE "public"."customer_favorites" TO "authenticated";
GRANT ALL ON TABLE "public"."customer_favorites" TO "service_role";



GRANT ALL ON TABLE "public"."customer_notifications" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."customer_notifications" TO "authenticated";



GRANT ALL ON TABLE "public"."customer_push_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."delivery_zones" TO "service_role";
GRANT SELECT ON TABLE "public"."delivery_zones" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."delivery_zones" TO "authenticated";



GRANT ALL ON TABLE "public"."driver_last_locations" TO "service_role";
GRANT SELECT ON TABLE "public"."driver_last_locations" TO "authenticated";



GRANT ALL ON TABLE "public"."drivers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."drivers" TO "authenticated";



GRANT ALL ON TABLE "public"."inventory_movements" TO "service_role";
GRANT SELECT ON TABLE "public"."inventory_movements" TO "authenticated";



GRANT ALL ON TABLE "public"."loyalty_ledger" TO "service_role";
GRANT SELECT ON TABLE "public"."loyalty_ledger" TO "authenticated";



GRANT ALL ON TABLE "public"."loyalty_settings" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_settings" TO "authenticated";



GRANT ALL ON TABLE "public"."loyalty_tiers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."loyalty_tiers" TO "authenticated";



GRANT ALL ON TABLE "public"."notification_queue" TO "service_role";
GRANT SELECT ON TABLE "public"."notification_queue" TO "authenticated";



GRANT ALL ON TABLE "public"."order_returns" TO "service_role";
GRANT SELECT ON TABLE "public"."order_returns" TO "authenticated";



GRANT ALL ON TABLE "public"."order_status_history" TO "service_role";
GRANT SELECT ON TABLE "public"."order_status_history" TO "authenticated";



GRANT ALL ON TABLE "public"."orders" TO "service_role";
GRANT SELECT ON TABLE "public"."orders" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_methods" TO "service_role";
GRANT SELECT ON TABLE "public"."payment_methods" TO "anon";
GRANT SELECT ON TABLE "public"."payment_methods" TO "authenticated";



GRANT ALL ON TABLE "public"."payment_proofs" TO "service_role";
GRANT SELECT ON TABLE "public"."payment_proofs" TO "authenticated";



GRANT ALL ON TABLE "public"."products" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."products" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."promotions" TO "service_role";
GRANT SELECT ON TABLE "public"."promotions" TO "anon";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."promotions" TO "authenticated";



GRANT ALL ON TABLE "public"."push_notification_deliveries" TO "service_role";
GRANT SELECT ON TABLE "public"."push_notification_deliveries" TO "authenticated";



GRANT ALL ON TABLE "public"."referral_rewards" TO "service_role";
GRANT SELECT ON TABLE "public"."referral_rewards" TO "authenticated";



GRANT ALL ON TABLE "public"."restock_subscriptions" TO "service_role";
GRANT SELECT,UPDATE ON TABLE "public"."restock_subscriptions" TO "authenticated";



GRANT ALL ON TABLE "public"."reviews" TO "service_role";



GRANT ALL ON TABLE "public"."stock_transfers" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."stock_transfers" TO "authenticated";



GRANT ALL ON TABLE "public"."storefront_banners" TO "service_role";
GRANT SELECT ON TABLE "public"."storefront_banners" TO "anon";
GRANT SELECT ON TABLE "public"."storefront_banners" TO "authenticated";



GRANT ALL ON TABLE "public"."storefront_collection_products" TO "service_role";
GRANT SELECT ON TABLE "public"."storefront_collection_products" TO "authenticated";



GRANT ALL ON TABLE "public"."storefront_collections" TO "service_role";
GRANT SELECT ON TABLE "public"."storefront_collections" TO "authenticated";



GRANT ALL ON TABLE "public"."warehouse_inventory" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."warehouse_inventory" TO "authenticated";



GRANT ALL ON TABLE "public"."warehouses" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."warehouses" TO "authenticated";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































