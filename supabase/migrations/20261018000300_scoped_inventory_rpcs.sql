-- Warehouse managers may adjust and transfer stock only for warehouses in their scope.
-- Signatures are unchanged, so existing calls keep working.

DROP POLICY IF EXISTS "Warehouse managers view scoped order history" ON public.order_status_history;
CREATE POLICY "Warehouse managers view scoped order history"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (
    public.is_warehouse_manager()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_status_history.order_id
        AND o.fulfillment_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[])
    )
  );

CREATE OR REPLACE FUNCTION public.adjust_warehouse_inventory(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_quantity_delta integer,
  p_note text DEFAULT NULL::text,
  p_reorder_level integer DEFAULT NULL::integer
) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_quantity integer;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Administrator or warehouse manager access required';
  END IF;
  IF NOT public.can_manage_warehouse(p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse is outside your scope';
  END IF;
  IF p_quantity_delta = 0 THEN RAISE EXCEPTION 'Quantity change cannot be zero'; END IF;
  IF NOT public.is_admin() AND NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A note is required for warehouse adjustments';
  END IF;

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

REVOKE ALL ON FUNCTION public.adjust_warehouse_inventory(uuid, uuid, integer, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_warehouse_inventory(uuid, uuid, integer, text, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.transfer_warehouse_stock(
  p_from_warehouse_id uuid,
  p_to_warehouse_id uuid,
  p_product_id uuid,
  p_quantity integer,
  p_note text DEFAULT NULL::text
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_transfer_id uuid;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Administrator or warehouse manager access required';
  END IF;
  IF NOT public.can_manage_warehouse(p_from_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse is outside your scope';
  END IF;
  IF NOT public.can_manage_warehouse(p_to_warehouse_id) THEN
    RAISE EXCEPTION 'Destination warehouse is outside your scope';
  END IF;
  IF p_from_warehouse_id = p_to_warehouse_id THEN RAISE EXCEPTION 'Source and destination warehouses must differ'; END IF;
  IF p_quantity < 1 THEN RAISE EXCEPTION 'Transfer quantity must be positive'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = p_to_warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Destination warehouse is not active';
  END IF;
  IF NOT public.is_admin() AND NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A note is required for stock transfers';
  END IF;

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

REVOKE ALL ON FUNCTION public.transfer_warehouse_stock(uuid, uuid, uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_warehouse_stock(uuid, uuid, uuid, integer, text) TO authenticated, service_role;

-- DOWN (manual):
--   Recreate both functions from the baseline (20260920000000_baseline.sql): admin-only check, no note rule.
--   DROP POLICY "Warehouse managers view scoped order history" ON public.order_status_history;
--   Remove the destination-warehouse scope check from transfer_warehouse_stock.
