-- Phase 5 (§7b.4): read-only operational views for warehouse staff: the split-fulfillment breakdown for an
-- order, the live driver map and the driver's own daily summary.

CREATE OR REPLACE FUNCTION public.staff_get_fulfillment_breakdown(p_order_id uuid)
RETURNS TABLE(
  line_no integer, product_id uuid, name_ar text, quantity integer,
  warehouse_id uuid, warehouse_name text, available integer, is_fulfillment_warehouse boolean
)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_manage_warehouse(v_order.fulfillment_warehouse_id) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;

  RETURN QUERY
  SELECT
    t.ord::integer,
    (t.i->>'id')::uuid,
    COALESCE(p.name_ar, t.i->>'name_ar'),
    (t.i->>'quantity')::integer,
    w.id,
    w.name,
    COALESCE(wi.quantity, 0)::integer,
    w.id = v_order.fulfillment_warehouse_id
  FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) WITH ORDINALITY t(i, ord)
  CROSS JOIN public.warehouses w
  LEFT JOIN public.products p ON p.id = (t.i->>'id')::uuid
  LEFT JOIN public.warehouse_inventory wi ON wi.warehouse_id = w.id AND wi.product_id = (t.i->>'id')::uuid
  WHERE w.is_active
  ORDER BY t.ord, (w.id = v_order.fulfillment_warehouse_id) DESC, w.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_driver_locations(p_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE(
  driver_id uuid, name text, status text, latitude numeric, longitude numeric,
  accuracy_meters numeric, updated_at timestamptz, active_order_numbers text[]
)
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
  SELECT
    d.id,
    d.name,
    d.status,
    l.latitude,
    l.longitude,
    l.accuracy_meters,
    l.updated_at,
    COALESCE(ARRAY(
      SELECT o.order_number FROM public.orders o
      WHERE o.driver_id = d.id AND o.status IN ('confirmed', 'preparing', 'shipped')
      ORDER BY o.created_at
    ), '{}'::text[])
  FROM public.driver_last_locations l
  JOIN public.drivers d ON d.id = l.driver_id
  WHERE (public.is_admin() OR d.warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]))
    AND (p_warehouse_id IS NULL OR d.warehouse_id = p_warehouse_id)
  ORDER BY d.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_driver_summary(p_from date, p_to date) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_driver_id uuid;
  v_delivered integer;
  v_failed integer;
  v_collected numeric;
  v_remitted numeric;
  v_adjustments numeric;
  v_outstanding numeric;
  v_pending numeric;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_from IS NULL OR p_to IS NULL OR p_from > p_to THEN
    RAISE EXCEPTION 'A valid date range is required';
  END IF;

  SELECT d.id INTO v_driver_id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid());
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;

  SELECT
    COUNT(DISTINCT h.order_id) FILTER (WHERE h.status = 'delivered'),
    COUNT(DISTINCT h.order_id) FILTER (WHERE h.status = 'delivery_failed')
  INTO v_delivered, v_failed
  FROM public.order_status_history h
  JOIN public.orders o ON o.id = h.order_id
  WHERE o.driver_id = v_driver_id
    AND h.status IN ('delivered', 'delivery_failed')
    AND public.business_date(h.created_at) BETWEEN p_from AND p_to;

  SELECT
    COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'cod_collected'), 0),
    COALESCE(-SUM(l.amount) FILTER (WHERE l.entry_type = 'remittance_confirmed'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'adjustment'), 0)
  INTO v_collected, v_remitted, v_adjustments
  FROM public.driver_cash_ledger l
  WHERE l.driver_id = v_driver_id AND l.business_date BETWEEN p_from AND p_to;

  SELECT COALESCE(SUM(l.amount), 0) INTO v_outstanding
  FROM public.driver_cash_ledger l
  WHERE l.driver_id = v_driver_id;

  SELECT COALESCE(SUM(r.amount), 0) INTO v_pending
  FROM public.driver_cash_remittances r
  WHERE r.driver_id = v_driver_id AND r.status = 'submitted';

  RETURN jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'delivered', v_delivered,
    'failed', v_failed,
    'cod_collected', v_collected,
    'remitted_confirmed', v_remitted,
    'adjustments', v_adjustments,
    'outstanding', v_outstanding,
    'pending_submitted', v_pending
  );
END;
$$;

REVOKE ALL ON FUNCTION public.staff_get_fulfillment_breakdown(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_fulfillment_breakdown(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_get_driver_locations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_driver_locations(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_my_driver_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_driver_summary(date, date) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.get_my_driver_summary(date, date);
--   DROP FUNCTION public.staff_get_driver_locations(uuid);
--   DROP FUNCTION public.staff_get_fulfillment_breakdown(uuid);
