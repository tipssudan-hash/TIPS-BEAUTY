-- 0002 Release order resources on cancellation
-- checkout_order reserves stock (warehouse_inventory or products.stock), consumes a coupon
-- and debits loyalty points. Nothing reversed those on cancel. This adds one internal
-- function that reverses all three, idempotently, and wires it into the admin cancel path.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS resources_released_at timestamp with time zone;

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('new', 'confirmed', 'preparing', 'shipped', 'delivered', 'cancelled', 'delivery_failed')) NOT VALID;

ALTER TABLE public.inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_movement_type_check;
ALTER TABLE public.inventory_movements ADD CONSTRAINT inventory_movements_movement_type_check
  CHECK (movement_type IN ('adjustment', 'transfer_in', 'transfer_out', 'order_reservation', 'order_release'));

CREATE OR REPLACE FUNCTION public.release_order_resources(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_movement record;
  v_item record;
  v_coupon_id uuid;
  v_restored_from_movements boolean := false;
BEGIN
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.resources_released_at IS NOT NULL THEN RETURN; END IF;

  -- Stock: exact reservation rows when the order was fulfilled from a warehouse.
  -- Locks follow the same product order as checkout_order (cart order) to avoid deadlocks.
  FOR v_movement IN
    SELECT im.warehouse_id, im.product_id, -im.quantity_delta AS quantity
    FROM public.inventory_movements im
    WHERE im.reference_id = p_order_id AND im.movement_type = 'order_reservation'
    ORDER BY im.created_at, im.id
  LOOP
    v_restored_from_movements := true;
    PERFORM 1 FROM public.products p WHERE p.id = v_movement.product_id FOR UPDATE;
    INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity, updated_at)
    VALUES (v_movement.warehouse_id, v_movement.product_id, v_movement.quantity, timezone('utc', now()))
    ON CONFLICT (warehouse_id, product_id)
    DO UPDATE SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = timezone('utc', now());
    INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
    VALUES (v_movement.warehouse_id, v_movement.product_id, v_movement.quantity, 'order_release', 'إرجاع حجز الطلب ' || COALESCE(v_order.order_number, ''), p_order_id, auth.uid());
  END LOOP;

  IF NOT v_restored_from_movements THEN
    FOR v_item IN
      SELECT (value->>'id')::uuid AS product_id, (value->>'quantity')::integer AS quantity
      FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) WITH ORDINALITY AS t(value, ord)
      ORDER BY ord
    LOOP
      IF v_item.product_id IS NULL OR COALESCE(v_item.quantity, 0) < 1 THEN CONTINUE; END IF;
      UPDATE public.products SET stock = COALESCE(stock, 0) + v_item.quantity WHERE id = v_item.product_id;
    END LOOP;
  END IF;

  -- Coupon
  IF v_order.coupon_code IS NOT NULL THEN
    SELECT c.id INTO v_coupon_id FROM public.coupons c WHERE c.code = v_order.coupon_code FOR UPDATE;
    DELETE FROM public.coupon_redemptions WHERE order_id = p_order_id;
    IF v_coupon_id IS NOT NULL THEN
      UPDATE public.coupons SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = v_coupon_id;
    END IF;
  END IF;

  -- Loyalty points redeemed at checkout
  IF COALESCE(v_order.points_redeemed, 0) > 0 AND v_order.customer_id IS NOT NULL THEN
    PERFORM 1 FROM public.profiles WHERE id = v_order.customer_id FOR UPDATE;
    UPDATE public.profiles SET beauty_points = COALESCE(beauty_points, 0) + v_order.points_redeemed WHERE id = v_order.customer_id;
    INSERT INTO public.loyalty_ledger (customer_id, order_id, points_delta, event_type, note, created_by)
    VALUES (v_order.customer_id, p_order_id, v_order.points_redeemed, 'refund_reversal', 'إرجاع النقاط بعد إلغاء الطلب ' || COALESCE(v_order.order_number, ''), auth.uid());
  END IF;

  UPDATE public.orders SET resources_released_at = timezone('utc', now()) WHERE id = p_order_id;
END;
$$;

-- Internal only: callable from other definer functions, never from clients.
REVOKE ALL ON FUNCTION public.release_order_resources(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_resources(uuid) TO service_role;

-- Same body as the baseline, plus the release call on the cancel transition.
CREATE OR REPLACE FUNCTION public.admin_update_order_operation(p_order_id uuid, p_expected_status text, p_status text DEFAULT NULL::text, p_driver_id uuid DEFAULT NULL::uuid, p_warehouse_id uuid DEFAULT NULL::uuid, p_note text DEFAULT NULL::text) RETURNS TABLE(id uuid, status text, driver_id uuid, fulfillment_warehouse_id uuid, updated_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
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
  IF v_next_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
    PERFORM public.release_order_resources(v_order.id);
  END IF;
  RETURN NEXT;
END;
$$;

-- DOWN (manual):
--   recreate admin_update_order_operation from the baseline migration;
--   DROP FUNCTION public.release_order_resources(uuid);
--   ALTER TABLE public.orders DROP CONSTRAINT orders_status_check; ALTER TABLE public.orders DROP COLUMN resources_released_at;
--   restore inventory_movements_movement_type_check without 'order_release' (after deleting such rows).
