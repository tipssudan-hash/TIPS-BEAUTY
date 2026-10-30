-- Phase 5 (§7b.1): estimated delivery time, staff-only internal notes and the "needs action" queue.
-- Customers read their own orders through RLS and a table-wide GRANT SELECT, so the warehouse note is kept
-- in order_staff_notes (staff-only RLS) instead of a column on orders.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS estimated_delivery_at timestamptz;

CREATE TABLE IF NOT EXISTS public.order_staff_notes (
  order_id   uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  note       text NOT NULL CHECK (length(trim(note)) > 0),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.order_staff_notes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_staff_notes FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_staff_notes TO authenticated;
GRANT ALL ON public.order_staff_notes TO service_role;

DROP POLICY IF EXISTS "Staff view scoped order staff notes" ON public.order_staff_notes;
CREATE POLICY "Staff view scoped order staff notes"
  ON public.order_staff_notes FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_staff_notes.order_id
      AND public.can_manage_warehouse(o.fulfillment_warehouse_id)
  ));

CREATE OR REPLACE FUNCTION public.staff_set_order_eta(
  p_order_id uuid,
  p_estimated_delivery_at timestamptz,
  p_note text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_note text := NULLIF(trim(COALESCE(p_note, '')), '');
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;
  IF p_estimated_delivery_at IS NULL THEN
    RAISE EXCEPTION 'An estimated delivery time is required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_manage_warehouse(v_order.fulfillment_warehouse_id) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'shipped', 'delivery_failed') THEN
    RAISE EXCEPTION 'The estimated delivery time can only be changed before delivery';
  END IF;

  UPDATE public.orders SET estimated_delivery_at = p_estimated_delivery_at WHERE id = v_order.id;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (
    v_order.id,
    v_order.status,
    concat('تحديث الموعد: ', to_char(p_estimated_delivery_at AT TIME ZONE 'Africa/Khartoum', 'YYYY-MM-DD HH24:MI'),
           CASE WHEN v_note IS NULL THEN '' ELSE concat(' — ', v_note) END),
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_orders_needing_action(p_warehouse_id uuid DEFAULT NULL)
RETURNS TABLE(order_id uuid, order_number text, status text, reason text, since timestamptz, warehouse_id uuid)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT o.id AS oid,
           o.order_number AS onumber,
           o.status AS ostatus,
           o.created_at AS ocreated,
           o.needs_fulfillment_review AS oreview,
           o.returned_to_warehouse_at AS oreturned,
           o.fulfillment_warehouse_id AS owarehouse,
           COALESCE((
             SELECT max(h.created_at) FROM public.order_status_history h
             WHERE h.order_id = o.id AND h.status = o.status
           ), o.created_at) AS osince
    FROM public.orders o
    WHERE public.can_manage_warehouse(o.fulfillment_warehouse_id)
      AND (p_warehouse_id IS NULL OR o.fulfillment_warehouse_id = p_warehouse_id)
  ),
  reasons AS (
    SELECT s.oid, s.onumber, s.ostatus, 'delivery_failed'::text AS rreason, s.osince AS rsince, s.owarehouse AS rwarehouse
    FROM scoped s
    WHERE s.ostatus = 'delivery_failed' AND s.oreturned IS NOT NULL
    UNION ALL
    SELECT s.oid, s.onumber, s.ostatus, 'failed_return_pending', s.osince, s.owarehouse
    FROM scoped s
    WHERE s.ostatus = 'delivery_failed' AND s.oreturned IS NULL
    UNION ALL
    SELECT s.oid, s.onumber, s.ostatus, 'needs_fulfillment_review', s.ocreated, s.owarehouse
    FROM scoped s
    WHERE s.oreview AND s.ostatus NOT IN ('delivered', 'cancelled')
    UNION ALL
    SELECT s.oid, s.onumber, s.ostatus, 'stale', s.osince, s.owarehouse
    FROM scoped s
    WHERE s.ostatus IN ('confirmed', 'preparing') AND s.osince < now() - interval '6 hours'
  )
  SELECT r.oid, r.onumber, r.ostatus, r.rreason, r.rsince, r.rwarehouse
  FROM reasons r
  ORDER BY r.rsince, r.onumber;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_deliveries(uuid);

CREATE FUNCTION public.get_my_deliveries(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, order_number text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone,
  customer_name text, phone text, shipping_address text, city text, state text, notes text,
  items jsonb, item_count integer, payment_method text, cod_amount numeric, warehouse_name text,
  customer_lat numeric, customer_lng numeric, cod_collected boolean,
  estimated_delivery_at timestamp with time zone, staff_note text
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
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
              'product_id', i->>'id',
              'name_ar', i->>'name_ar',
              'variant_name', i->>'variant_name',
              'quantity', (i->>'quantity')::integer,
              'unit_price', (i->>'effective_unit_price')::numeric,
              'line_total', (i->>'line_total')::numeric
           ) ORDER BY ord)
           FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) WITH ORDINALITY t(i, ord)), '[]'::jsonb),
         (SELECT COALESCE(sum((i->>'quantity')::integer), 0)::integer FROM jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) i),
         o.payment_method,
         CASE WHEN o.payment_method = 'COD' THEN o.total END,
         w.name,
         o.customer_lat,
         o.customer_lng,
         EXISTS (SELECT 1 FROM public.driver_cash_ledger l WHERE l.order_id = o.id AND l.entry_type = 'cod_collected'),
         o.estimated_delivery_at,
         (SELECT n.note FROM public.order_staff_notes n WHERE n.order_id = o.id)
  FROM public.orders o
  JOIN me ON o.driver_id = me.id
  LEFT JOIN public.warehouses w ON w.id = o.fulfillment_warehouse_id
  WHERE (p_order_id IS NULL OR o.id = p_order_id)
    AND (
      o.status IN ('confirmed', 'preparing', 'shipped')
      OR (o.status IN ('delivered', 'delivery_failed') AND o.id IN (
            SELECT h.order_id FROM public.order_status_history h
            WHERE h.order_id = o.id AND h.status = o.status
              AND public.business_date(h.created_at) = public.business_date(now())))
      OR p_order_id IS NOT NULL
    )
  ORDER BY CASE o.status WHEN 'shipped' THEN 0 WHEN 'preparing' THEN 1 WHEN 'confirmed' THEN 2 ELSE 3 END, o.created_at;
$$;

REVOKE ALL ON FUNCTION public.get_my_deliveries(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_deliveries(uuid) TO authenticated, service_role;

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
    IF NULLIF(trim(p_notes), '') IS NULL THEN
      DELETE FROM public.order_staff_notes n WHERE n.order_id = v_order.id;
    ELSE
      INSERT INTO public.order_staff_notes AS n (order_id, note, updated_by)
      VALUES (v_order.id, trim(p_notes), auth.uid())
      ON CONFLICT (order_id) DO UPDATE SET
        note = EXCLUDED.note,
        updated_by = EXCLUDED.updated_by,
        updated_at = timezone('utc', now());
    END IF;
  END IF;

  IF v_next <> v_order.status OR p_notes IS NOT NULL THEN
    INSERT INTO public.order_status_history (order_id, status, note, changed_by)
    VALUES (v_order.id, v_next, COALESCE(NULLIF(trim(p_notes), ''), 'تم التحديث من المشرف'), auth.uid());
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_update_order(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_update_order(uuid, text, text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_set_order_eta(uuid, timestamptz, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_order_eta(uuid, timestamptz, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.staff_get_orders_needing_action(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_orders_needing_action(uuid) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.staff_get_orders_needing_action(uuid);
--   DROP FUNCTION public.staff_set_order_eta(uuid, timestamptz, text);
--   Restore get_my_deliveries() (20261018000400 body, drop first) and supervisor_update_order() (20261018000200 body).
--   DROP TABLE public.order_staff_notes;
--   ALTER TABLE public.orders DROP COLUMN estimated_delivery_at;
--
-- ETA tag cleanup (run by hand AFTER reviewing a sample; NOT executed by this migration).
-- Earlier versions of SupervisorHomePage prepended "[الموعد المتوقع: …]" and "[تحديث: …]" to orders.notes.
-- 1) Count the affected orders:
--    SELECT count(*) FROM public.orders WHERE notes ~ '\[(الموعد المتوقع|تحديث):';
-- 2) Review a sample before changing anything:
--    SELECT id, order_number, notes FROM public.orders WHERE notes ~ '\[(الموعد المتوقع|تحديث):' ORDER BY created_at DESC LIMIT 20;
-- 3) Only after review, strip the tags (the ETA itself is not recovered from the text):
--    UPDATE public.orders SET notes = NULLIF(btrim(regexp_replace(notes, '\[(الموعد المتوقع|تحديث):[^\]]*\]\s*', '', 'g')), '') WHERE notes ~ '\[(الموعد المتوقع|تحديث):';
