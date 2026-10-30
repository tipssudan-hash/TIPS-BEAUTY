-- Closes the direct-write paths a warehouse manager could use and moves every supervisor RPC onto
-- can_manage_warehouse(). Writes to orders, remittances and inventory now go through RPCs only.

REVOKE UPDATE ON public.orders FROM authenticated;
REVOKE INSERT, UPDATE ON public.driver_cash_remittances FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.warehouse_inventory, public.stock_transfers FROM authenticated;

DROP POLICY IF EXISTS "Warehouse supervisors update own warehouse orders" ON public.orders;
DROP POLICY IF EXISTS "Warehouse supervisors update own warehouse inventory" ON public.warehouse_inventory;
DROP POLICY IF EXISTS "Supervisors update warehouse remittances" ON public.driver_cash_remittances;
DROP POLICY IF EXISTS "Drivers insert own remittances" ON public.driver_cash_remittances;

DROP POLICY IF EXISTS "Warehouse supervisors view own warehouse orders" ON public.orders;
CREATE POLICY "Warehouse supervisors view own warehouse orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND fulfillment_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

DROP POLICY IF EXISTS "Warehouse supervisors view own warehouse inventory" ON public.warehouse_inventory;
CREATE POLICY "Warehouse supervisors view own warehouse inventory"
  ON public.warehouse_inventory FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

DROP POLICY IF EXISTS "Supervisors view warehouse remittances" ON public.driver_cash_remittances;
CREATE POLICY "Supervisors view warehouse remittances"
  ON public.driver_cash_remittances FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

DROP POLICY IF EXISTS "Warehouse managers view scoped inventory movements" ON public.inventory_movements;
CREATE POLICY "Warehouse managers view scoped inventory movements"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

DROP POLICY IF EXISTS "Warehouse managers view scoped stock transfers" ON public.stock_transfers;
CREATE POLICY "Warehouse managers view scoped stock transfers"
  ON public.stock_transfers FOR SELECT TO authenticated
  USING (
    public.is_warehouse_manager()
    AND (from_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]) OR to_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]))
  );

DROP POLICY IF EXISTS "Warehouse managers view own warehouses" ON public.warehouses;
CREATE POLICY "Warehouse managers view own warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

DROP FUNCTION IF EXISTS public.supervisor_update_order(uuid, text, text);
CREATE OR REPLACE FUNCTION public.supervisor_update_order(
  p_order_id uuid,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_expected_status text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next text;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.is_admin() OR public.can_manage_warehouse(v_order.fulfillment_warehouse_id)) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_order.status THEN
    RAISE EXCEPTION 'This order was updated by another user; reload and try again';
  END IF;

  v_next := COALESCE(NULLIF(trim(p_status), ''), v_order.status);

  IF v_next <> v_order.status THEN
    IF NOT (
      (v_order.status = 'new' AND v_next IN ('confirmed', 'cancelled')) OR
      (v_order.status = 'confirmed' AND v_next IN ('preparing', 'cancelled')) OR
      (v_order.status = 'preparing' AND v_next IN ('shipped', 'cancelled')) OR
      (v_order.status = 'delivery_failed' AND v_next IN ('confirmed', 'cancelled'))
    ) THEN RAISE EXCEPTION 'This status transition is not allowed for warehouse managers'; END IF;

    IF v_next = 'shipped' AND v_order.driver_id IS NULL THEN
      RAISE EXCEPTION 'Assign a driver before starting delivery';
    END IF;

    IF v_next = 'cancelled' AND v_order.payment_status = 'paid' AND v_order.payment_method IS DISTINCT FROM 'COD' THEN
      RAISE EXCEPTION 'Paid orders must be refunded by an administrator before cancellation';
    END IF;

    UPDATE public.orders o SET status = v_next WHERE o.id = v_order.id;

    IF v_next = 'cancelled' THEN
      PERFORM public.release_order_resources(v_order.id);
    END IF;
  END IF;

  IF p_notes IS NOT NULL AND v_next IN ('new', 'confirmed', 'preparing') THEN
    UPDATE public.orders o SET notes = p_notes WHERE o.id = v_order.id;
  END IF;

  IF v_next <> v_order.status OR p_notes IS NOT NULL THEN
    INSERT INTO public.order_status_history (order_id, status, note, changed_by)
    VALUES (v_order.id, v_next, COALESCE(NULLIF(trim(p_notes), ''), 'تم التحديث من المشرف'), auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_update_order(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_update_order(uuid, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisor_assign_driver(
  p_order_id uuid,
  p_driver_id uuid
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_driver_warehouse uuid;
  v_driver_status text;
  v_next text;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.is_admin() OR public.can_manage_warehouse(v_order.fulfillment_warehouse_id)) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'delivery_failed') THEN
    RAISE EXCEPTION 'Order not in assignable state';
  END IF;

  SELECT d.warehouse_id, d.status INTO v_driver_warehouse, v_driver_status
  FROM public.drivers d WHERE d.id = p_driver_id FOR UPDATE;
  IF NOT FOUND OR v_driver_status NOT IN ('active', 'busy') THEN
    RAISE EXCEPTION 'Selected driver is not available';
  END IF;
  IF v_driver_warehouse IS DISTINCT FROM v_order.fulfillment_warehouse_id
     AND NOT (v_driver_warehouse IS NULL AND public.is_admin()) THEN
    RAISE EXCEPTION 'Selected driver is assigned to another warehouse';
  END IF;

  v_next := CASE
    WHEN v_order.status = 'new' THEN 'confirmed'
    WHEN v_order.status = 'confirmed' THEN 'preparing'
    ELSE v_order.status
  END;

  UPDATE public.orders o SET driver_id = p_driver_id, status = v_next WHERE o.id = v_order.id;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (v_order.id, v_next, 'تم إسناد الطلب للمندوب من قبل المشرف', auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_assign_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_assign_driver(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.supervisor_confirm_cash_remittance(
  p_remittance_id uuid,
  p_action text DEFAULT 'confirmed',
  p_notes text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_remittance public.driver_cash_remittances%ROWTYPE;
  v_note text := NULLIF(trim(COALESCE(p_notes, '')), '');
  v_outstanding numeric;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;
  IF p_action NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Action must be confirmed or rejected';
  END IF;

  SELECT r.* INTO v_remittance FROM public.driver_cash_remittances r WHERE r.id = p_remittance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Remittance not found or already processed'; END IF;
  IF NOT (public.is_admin() OR public.can_manage_warehouse(v_remittance.warehouse_id)) THEN
    RAISE EXCEPTION 'Remittance is outside your warehouse scope';
  END IF;
  IF v_remittance.status <> 'submitted' THEN
    RAISE EXCEPTION 'Remittance not found or already processed';
  END IF;

  IF p_action = 'confirmed' THEN
    v_outstanding := public.driver_outstanding_cod(v_remittance.driver_id);
    IF v_remittance.amount > v_outstanding THEN
      IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Confirmed amount exceeds the driver outstanding COD';
      END IF;
      IF v_note IS NULL THEN
        RAISE EXCEPTION 'A note is required to confirm more than the driver outstanding COD';
      END IF;
    END IF;
  END IF;

  UPDATE public.driver_cash_remittances r
  SET status = p_action,
      supervisor_notes = v_note,
      confirmed_at = timezone('utc', now()),
      confirmed_by = auth.uid()
  WHERE r.id = v_remittance.id;

  RETURN p_action;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.supervisor_get_warehouse_drivers();
CREATE OR REPLACE FUNCTION public.supervisor_get_warehouse_drivers(p_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid, name text, phone text, status text, active_deliveries bigint)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;
  IF p_warehouse_id IS NOT NULL AND NOT public.can_manage_warehouse(p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse is outside your scope';
  END IF;

  RETURN QUERY
  SELECT d.id, d.name, d.phone, d.status,
         (SELECT count(*) FROM public.orders o WHERE o.driver_id = d.id AND o.status IN ('preparing', 'shipped'))
  FROM public.drivers d
  WHERE (public.is_admin() OR d.warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]))
    AND (p_warehouse_id IS NULL OR d.warehouse_id = p_warehouse_id)
  ORDER BY d.name;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_get_warehouse_drivers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_get_warehouse_drivers(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_warehouse_settlement_summary(date, date);
CREATE OR REPLACE FUNCTION public.get_warehouse_settlement_summary(
  p_start date DEFAULT (CURRENT_DATE - interval '30 days')::date,
  p_end date DEFAULT CURRENT_DATE,
  p_warehouse_id uuid DEFAULT NULL
)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_scope uuid[];
  v_result jsonb;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    IF NOT public.can_manage_warehouse(p_warehouse_id) THEN
      RAISE EXCEPTION 'Warehouse is outside your scope';
    END IF;
    v_scope := ARRAY[p_warehouse_id];
  ELSIF public.is_admin() THEN
    v_scope := NULL;
  ELSE
    v_scope := public.my_warehouse_ids();
  END IF;

  SELECT jsonb_build_object(
    'period', jsonb_build_object('start', p_start, 'end', p_end),
    'total_orders', COUNT(*),
    'delivered_orders', COUNT(*) FILTER (WHERE o.status = 'delivered'),
    'failed_orders', COUNT(*) FILTER (WHERE o.status = 'delivery_failed'),
    'cancelled_orders', COUNT(*) FILTER (WHERE o.status = 'cancelled'),
    'total_revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered'), 0),
    'cod_collected', COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.payment_method = 'COD'), 0),
    'online_paid', COALESCE(SUM(o.total) FILTER (WHERE o.status = 'delivered' AND o.payment_method <> 'COD'), 0),
    'pending_payment', COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'pending' AND o.status NOT IN ('cancelled', 'delivery_failed')), 0),
    'paid_confirmed', COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0),
    'shipping_fees_collected', COALESCE(SUM(o.shipping_fee) FILTER (WHERE o.status = 'delivered'), 0),
    'cash_remittances', (
      SELECT jsonb_build_object(
        'total_submitted', COALESCE(SUM(r.amount) FILTER (WHERE r.status IN ('submitted', 'confirmed')), 0),
        'total_confirmed', COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'confirmed'), 0),
        'pending_confirmation', COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'submitted'), 0),
        'rejected', COALESCE(SUM(r.amount) FILTER (WHERE r.status = 'rejected'), 0)
      )
      FROM public.driver_cash_remittances r
      WHERE r.submitted_at::date BETWEEN p_start AND p_end
        AND (v_scope IS NULL OR r.warehouse_id = ANY (v_scope))
    ),
    'driver_performance', COALESCE((
      SELECT jsonb_agg(driver_row ORDER BY (driver_row->>'delivered')::int DESC)
      FROM (
        SELECT jsonb_build_object(
          'driver_id', d.id,
          'driver_name', d.name,
          'delivered', COUNT(*) FILTER (WHERE o2.status = 'delivered'),
          'failed', COUNT(*) FILTER (WHERE o2.status = 'delivery_failed'),
          'cod_collected', COALESCE(SUM(o2.total) FILTER (WHERE o2.status = 'delivered' AND o2.payment_method = 'COD'), 0),
          'cash_submitted', COALESCE((
            SELECT SUM(r.amount) FROM public.driver_cash_remittances r
            WHERE r.driver_id = d.id AND r.submitted_at::date BETWEEN p_start AND p_end
          ), 0),
          'cash_confirmed', COALESCE((
            SELECT SUM(r.amount) FROM public.driver_cash_remittances r
            WHERE r.driver_id = d.id AND r.status = 'confirmed' AND r.submitted_at::date BETWEEN p_start AND p_end
          ), 0),
          'outstanding_cod', public.driver_outstanding_cod(d.id)
        ) AS driver_row
        FROM public.drivers d
        LEFT JOIN public.orders o2 ON o2.driver_id = d.id AND o2.created_at::date BETWEEN p_start AND p_end
        WHERE (v_scope IS NULL OR d.warehouse_id = ANY (v_scope))
        GROUP BY d.id, d.name
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  WHERE o.created_at::date BETWEEN p_start AND p_end
    AND (v_scope IS NULL OR o.fulfillment_warehouse_id = ANY (v_scope));

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_settlement_summary(date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_warehouse_settlement_summary(date, date, uuid) TO authenticated, service_role;

-- DOWN (manual):
--   Restore the policies and function bodies from 20261001000800_gps06_warehouse_supervisor.sql and 20261008000300_full_cash_cycle.sql.
--   GRANT UPDATE ON public.orders TO authenticated; GRANT INSERT, UPDATE ON public.driver_cash_remittances TO authenticated;
--   GRANT INSERT, UPDATE, DELETE ON public.warehouse_inventory, public.stock_transfers TO authenticated;
--   DROP POLICY "Warehouse managers view own warehouses" ON public.warehouses; (and the scoped movement, transfer, and supervisor SELECT policies added here)
--   DROP FUNCTION public.supervisor_update_order(uuid, text, text, text); recreate the 3-argument version from full_cash_cycle.sql.
