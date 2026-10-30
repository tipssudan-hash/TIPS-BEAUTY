-- Phase 5 (§7b.2): packing checklist, pickup checklist, handover signature, delivery proof photo and
-- the failed-delivery return to the warehouse. Both gates default off (app_settings flags).

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS packed_at timestamptz,
  ADD COLUMN IF NOT EXISTS packed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handed_over_at timestamptz,
  ADD COLUMN IF NOT EXISTS delivery_proof_path text,
  ADD COLUMN IF NOT EXISTS returned_to_warehouse_at timestamptz,
  ADD COLUMN IF NOT EXISTS returned_received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS require_packing_check boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_delivery_proof boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.order_item_checks (
  order_id    uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  stage       text NOT NULL CHECK (stage IN ('packing', 'pickup')),
  line_no     integer NOT NULL,
  checked_qty integer NOT NULL CHECK (checked_qty >= 0),
  checked_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at  timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (order_id, stage, line_no)
);

ALTER TABLE public.order_item_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_item_checks FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.order_item_checks TO authenticated;
GRANT ALL ON public.order_item_checks TO service_role;

CREATE OR REPLACE FUNCTION public.is_assigned_driver(p_order_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p_order_id IS NOT NULL AND public.is_driver() AND EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.drivers d ON d.id = o.driver_id
    WHERE o.id = p_order_id AND d.user_id = (SELECT auth.uid())
  );
$$;
REVOKE ALL ON FUNCTION public.is_assigned_driver(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_assigned_driver(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.order_line_quantity(p_items jsonb, p_line_no integer) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_line_no BETWEEN 1 AND jsonb_array_length(COALESCE(p_items, '[]'::jsonb))
    THEN (p_items -> (p_line_no - 1) ->> 'quantity')::integer
  END;
$$;
REVOKE ALL ON FUNCTION public.order_line_quantity(jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_line_quantity(jsonb, integer) TO service_role;

DROP POLICY IF EXISTS "Staff view scoped order item checks" ON public.order_item_checks;
CREATE POLICY "Staff view scoped order item checks"
  ON public.order_item_checks FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_item_checks.order_id
      AND public.can_manage_warehouse(o.fulfillment_warehouse_id)
  ));

DROP POLICY IF EXISTS "Assigned drivers view order item checks" ON public.order_item_checks;
CREATE POLICY "Assigned drivers view order item checks"
  ON public.order_item_checks FOR SELECT TO authenticated
  USING (public.is_assigned_driver(order_item_checks.order_id));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('delivery-proofs', 'delivery-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

CREATE OR REPLACE FUNCTION public.delivery_proof_order_id(p_object_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN split_part(p_object_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_object_name, '/', 1)::uuid
  END;
$$;
REVOKE ALL ON FUNCTION public.delivery_proof_order_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delivery_proof_order_id(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Assigned drivers upload delivery proofs" ON storage.objects;
CREATE POLICY "Assigned drivers upload delivery proofs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'delivery-proofs' AND public.is_assigned_driver(public.delivery_proof_order_id(storage.objects.name)));

DROP POLICY IF EXISTS "Staff read delivery proofs" ON storage.objects;
CREATE POLICY "Staff read delivery proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'delivery-proofs' AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = public.delivery_proof_order_id(storage.objects.name)
      AND public.can_manage_warehouse(o.fulfillment_warehouse_id)
  ));

CREATE OR REPLACE FUNCTION public.staff_set_item_check(p_order_id uuid, p_line_no integer, p_checked_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line_qty integer;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_manage_warehouse(v_order.fulfillment_warehouse_id) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.status NOT IN ('confirmed', 'preparing') OR v_order.packed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Items can only be checked for packing before the order is packed';
  END IF;

  v_line_qty := public.order_line_quantity(v_order.items, p_line_no);
  IF v_line_qty IS NULL THEN RAISE EXCEPTION 'Order line % does not exist', p_line_no; END IF;
  IF p_checked_qty IS NULL OR p_checked_qty < 0 OR p_checked_qty > v_line_qty THEN
    RAISE EXCEPTION 'Checked quantity must be between 0 and %', v_line_qty;
  END IF;

  INSERT INTO public.order_item_checks (order_id, stage, line_no, checked_qty, checked_by, checked_at)
  VALUES (p_order_id, 'packing', p_line_no, p_checked_qty, auth.uid(), timezone('utc', now()))
  ON CONFLICT (order_id, stage, line_no) DO UPDATE SET
    checked_qty = EXCLUDED.checked_qty,
    checked_by = EXCLUDED.checked_by,
    checked_at = EXCLUDED.checked_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_mark_packed(p_order_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_lines integer;
  v_next_status text;
BEGIN
  IF NOT (public.is_admin() OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_manage_warehouse(v_order.fulfillment_warehouse_id) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.packed_at IS NOT NULL THEN RETURN; END IF;
  IF v_order.status NOT IN ('confirmed', 'preparing') THEN
    RAISE EXCEPTION 'Only confirmed or preparing orders can be packed';
  END IF;

  v_lines := jsonb_array_length(COALESCE(v_order.items, '[]'::jsonb));
  IF v_lines = 0 THEN RAISE EXCEPTION 'The order has no items to pack'; END IF;
  IF EXISTS (
    SELECT 1 FROM generate_series(1, v_lines) AS n(line_no)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.order_item_checks c
      WHERE c.order_id = v_order.id AND c.stage = 'packing' AND c.line_no = n.line_no
        AND c.checked_qty >= public.order_line_quantity(v_order.items, n.line_no)
    )
  ) THEN
    RAISE EXCEPTION 'Every item must be checked in full before the order is packed';
  END IF;

  v_next_status := CASE WHEN v_order.status = 'confirmed' THEN 'preparing' ELSE v_order.status END;

  UPDATE public.orders o
  SET packed_at = now(), packed_by = auth.uid(), status = v_next_status
  WHERE o.id = v_order.id;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (v_order.id, v_next_status, 'تم تجهيز الطلب وفحص بنوده', auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_get_item_checks(p_order_id uuid)
RETURNS TABLE(stage text, line_no integer, checked_qty integer, checked_at timestamptz)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_warehouse_id uuid;
BEGIN
  SELECT o.fulfillment_warehouse_id INTO v_warehouse_id FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.can_manage_warehouse(v_warehouse_id) OR public.is_assigned_driver(p_order_id)) THEN
    RAISE EXCEPTION 'Order is outside your scope';
  END IF;

  RETURN QUERY
  SELECT c.stage, c.line_no, c.checked_qty, c.checked_at
  FROM public.order_item_checks c
  WHERE c.order_id = p_order_id
  ORDER BY c.stage, c.line_no;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_set_pickup_check(p_order_id uuid, p_line_no integer, p_checked_qty integer) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line_qty integer;
BEGIN
  IF NOT public.is_assigned_driver(p_order_id) THEN
    RAISE EXCEPTION 'Order is not assigned to you';
  END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('confirmed', 'preparing') OR v_order.handed_over_at IS NOT NULL THEN
    RAISE EXCEPTION 'Pickup checks are only possible before the order is handed over';
  END IF;

  v_line_qty := public.order_line_quantity(v_order.items, p_line_no);
  IF v_line_qty IS NULL THEN RAISE EXCEPTION 'Order line % does not exist', p_line_no; END IF;
  IF p_checked_qty IS NULL OR p_checked_qty < 0 OR p_checked_qty > v_line_qty THEN
    RAISE EXCEPTION 'Checked quantity must be between 0 and %', v_line_qty;
  END IF;

  INSERT INTO public.order_item_checks (order_id, stage, line_no, checked_qty, checked_by, checked_at)
  VALUES (p_order_id, 'pickup', p_line_no, p_checked_qty, auth.uid(), timezone('utc', now()))
  ON CONFLICT (order_id, stage, line_no) DO UPDATE SET
    checked_qty = EXCLUDED.checked_qty,
    checked_by = EXCLUDED.checked_by,
    checked_at = EXCLUDED.checked_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.staff_confirm_failed_delivery_return(p_order_id uuid, p_note text DEFAULT NULL) RETURNS void
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

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT public.can_manage_warehouse(v_order.fulfillment_warehouse_id) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.status <> 'delivery_failed' THEN
    RAISE EXCEPTION 'Only a failed delivery can be confirmed as returned to the warehouse';
  END IF;
  IF v_order.returned_to_warehouse_at IS NOT NULL THEN RETURN; END IF;

  UPDATE public.orders o
  SET returned_to_warehouse_at = now(), returned_received_by = auth.uid()
  WHERE o.id = v_order.id;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (v_order.id, 'delivery_failed', concat('استلام المرتجع في المستودع', CASE WHEN v_note IS NULL THEN '' ELSE concat(' — ', v_note) END), auth.uid());
END;
$$;

DROP FUNCTION IF EXISTS public.update_driver_order_status(uuid, text, text, text, text);

CREATE FUNCTION public.update_driver_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_delivery_code text DEFAULT NULL,
  p_proof_path text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_driver_id uuid;
  v_current_status text;
  v_current_driver_id uuid;
  v_note text;
  v_payment_method text;
  v_payment_status text;
  v_total numeric;
  v_customer_id uuid;
  v_order_number text;
  v_require_code boolean;
  v_require_packing boolean;
  v_require_proof boolean;
  v_code_row public.order_delivery_codes%ROWTYPE;
  v_code text;
  v_code_verified boolean := false;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_status NOT IN ('shipped', 'delivered', 'delivery_failed') THEN
    RAISE EXCEPTION 'Drivers may only update active delivery states';
  END IF;
  IF p_status = 'delivery_failed' AND NULLIF(trim(COALESCE(p_failure_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A delivery failure reason is required';
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;

  SELECT o.status, o.driver_id INTO v_current_status, v_current_driver_id
  FROM public.orders o WHERE o.id = p_order_id FOR UPDATE;
  IF v_current_status = p_status AND v_current_driver_id = v_driver_id THEN
    RETURN p_status;
  END IF;

  IF p_proof_path IS NOT NULL THEN
    IF NOT starts_with(p_proof_path, p_order_id::text || '/') OR strpos(p_proof_path, '..') > 0 THEN
      RAISE EXCEPTION 'The delivery proof must be stored in the order folder';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'delivery-proofs' AND so.name = p_proof_path) THEN
      RAISE EXCEPTION 'The delivery proof photo was not found';
    END IF;
  END IF;

  SELECT COALESCE(s.require_delivery_code, false), COALESCE(s.require_packing_check, false), COALESCE(s.require_delivery_proof, false)
  INTO v_require_code, v_require_packing, v_require_proof
  FROM public.app_settings s WHERE s.id = true;

  IF p_status = 'shipped' AND v_require_packing THEN
    IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.packed_at IS NOT NULL) THEN
      RAISE EXCEPTION 'The order must be packed before it is handed to the driver';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM public.orders o, jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) WITH ORDINALITY t(i, ord)
      WHERE o.id = p_order_id
        AND NOT EXISTS (
          SELECT 1 FROM public.order_item_checks c
          WHERE c.order_id = o.id AND c.stage = 'pickup' AND c.line_no = t.ord
            AND c.checked_qty >= (t.i->>'quantity')::integer
        )
    ) THEN
      RAISE EXCEPTION 'Every item must be checked at pickup before handover';
    END IF;
  END IF;

  IF p_status = 'delivered' AND v_require_proof AND p_proof_path IS NULL THEN
    RAISE EXCEPTION 'A delivery proof photo is required';
  END IF;

  IF p_status = 'delivered' AND v_require_code THEN
    SELECT c.* INTO v_code_row FROM public.order_delivery_codes c WHERE c.order_id = p_order_id FOR UPDATE;
    IF v_code_row.override_by IS NULL THEN
      IF NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.id = p_order_id AND o.driver_id = v_driver_id AND o.status = 'shipped') THEN
        RAISE EXCEPTION 'This status transition is not available for the assigned order';
      END IF;
      IF v_code_row.order_id IS NULL OR NULLIF(trim(COALESCE(p_delivery_code, '')), '') IS NULL THEN
        RETURN 'delivery_code_required';
      END IF;
      IF v_code_row.failed_attempts >= 5 THEN
        RETURN 'delivery_code_locked';
      END IF;
      IF extensions.crypt(trim(p_delivery_code), v_code_row.code_hash) <> v_code_row.code_hash THEN
        UPDATE public.order_delivery_codes SET failed_attempts = failed_attempts + 1 WHERE order_id = p_order_id;
        IF v_code_row.failed_attempts + 1 >= 5 THEN
          RETURN 'delivery_code_locked';
        END IF;
        RETURN 'delivery_code_invalid';
      END IF;
      UPDATE public.order_delivery_codes SET verified_at = now() WHERE order_id = p_order_id;
      v_code_verified := true;
    END IF;
  END IF;

  UPDATE public.orders
  SET status = p_status,
      handed_over_at = CASE WHEN p_status = 'shipped' THEN now() ELSE handed_over_at END,
      delivery_proof_path = COALESCE(p_proof_path, delivery_proof_path)
  WHERE id = p_order_id AND driver_id = v_driver_id
    AND ((p_status = 'shipped' AND status IN ('confirmed', 'preparing'))
      OR (p_status IN ('delivered', 'delivery_failed') AND status = 'shipped'))
  RETURNING status, payment_method, payment_status, total, customer_id, order_number
  INTO p_status, v_payment_method, v_payment_status, v_total, v_customer_id, v_order_number;

  IF NOT FOUND THEN RAISE EXCEPTION 'This status transition is not available for the assigned order'; END IF;

  IF p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_status = 'pending' THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        financial_status = 'paid'
    WHERE id = p_order_id;
  END IF;

  IF p_status = 'delivered' AND v_payment_method = 'COD' AND COALESCE(v_total, 0) > 0 THEN
    INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, order_id, business_date, created_by)
    SELECT d.id, d.warehouse_id, 'cod_collected', v_total, p_order_id, public.business_date(now()), auth.uid()
    FROM public.drivers d
    WHERE d.id = v_driver_id
    ON CONFLICT (order_id) WHERE entry_type = 'cod_collected' DO NOTHING;
  END IF;

  IF p_status = 'shipped' THEN
    v_code := public.generate_delivery_code();
    INSERT INTO public.order_delivery_codes (order_id, code_hash, issued_at, failed_attempts, verified_at)
    VALUES (p_order_id, extensions.crypt(v_code, extensions.gen_salt('bf')), now(), 0, NULL)
    ON CONFLICT (order_id) DO UPDATE
      SET code_hash = EXCLUDED.code_hash,
          issued_at = EXCLUDED.issued_at,
          failed_attempts = 0,
          verified_at = NULL;

    IF v_customer_id IS NOT NULL THEN
      PERFORM public.create_customer_notification(
        v_customer_id,
        'delivery_code',
        'رمز استلام طلبك',
        'رمز التسليم لطلبك رقم ' || COALESCE(v_order_number, '') || ': ' || v_code || '. أعطِه للمندوب عند الاستلام.',
        p_order_id,
        NULL,
        jsonb_build_object('order_number', v_order_number, 'url', '/orders')
      );
    END IF;
  END IF;

  v_note := CASE
    WHEN p_status = 'delivery_failed' THEN
      concat('تعذر التسليم: ', trim(p_failure_reason),
             CASE WHEN NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN ''
                  ELSE concat(' — ', trim(p_note)) END)
    WHEN v_code_verified THEN
      concat_ws(' — ', 'تم التحقق من رمز التسليم', NULLIF(trim(COALESCE(p_note, '')), ''))
    ELSE COALESCE(NULLIF(trim(p_note), ''), 'تم التحديث من بوابة المندوب')
  END;

  INSERT INTO public.order_status_history(order_id, status, note, changed_by)
  VALUES (p_order_id, p_status, v_note, auth.uid());

  UPDATE public.drivers
  SET status = CASE WHEN p_status = 'shipped' THEN 'busy' ELSE 'active' END,
      updated_at = timezone('utc', now())
  WHERE id = v_driver_id;

  IF p_status IN ('delivered', 'delivery_failed')
     AND NOT EXISTS (SELECT 1 FROM public.orders WHERE driver_id = v_driver_id AND status = 'shipped') THEN
    DELETE FROM public.driver_last_locations WHERE driver_id = v_driver_id;
  END IF;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text) TO authenticated, service_role;

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

    IF v_next = 'shipped' AND v_order.packed_at IS NULL
       AND COALESCE((SELECT s.require_packing_check FROM public.app_settings s WHERE s.id = true), false) THEN
      RAISE EXCEPTION 'Pack the order before it leaves the warehouse';
    END IF;

    IF v_next = 'cancelled' AND v_order.status = 'delivery_failed' AND v_order.returned_to_warehouse_at IS NULL THEN
      RAISE EXCEPTION 'Confirm that the failed delivery has returned to the warehouse before cancelling';
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

REVOKE ALL ON FUNCTION public.staff_set_item_check(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_set_item_check(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_mark_packed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_mark_packed(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_get_item_checks(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_get_item_checks(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.driver_set_pickup_check(uuid, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_set_pickup_check(uuid, integer, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.staff_confirm_failed_delivery_return(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_confirm_failed_delivery_return(uuid, text) TO authenticated, service_role;

-- DOWN (manual):
--   Restore update_driver_order_status() (5 arguments) from 20261018000500_delivery_code_verification.sql, and
--   supervisor_update_order() from 20261022000100_order_eta_needs_action.sql, then:
--   DROP FUNCTION public.staff_confirm_failed_delivery_return(uuid, text); DROP FUNCTION public.driver_set_pickup_check(uuid, integer, integer);
--   DROP FUNCTION public.staff_get_item_checks(uuid); DROP FUNCTION public.staff_mark_packed(uuid); DROP FUNCTION public.staff_set_item_check(uuid, integer, integer);
--   DROP POLICY "Staff read delivery proofs" ON storage.objects; DROP POLICY "Assigned drivers upload delivery proofs" ON storage.objects;
--   DROP FUNCTION public.delivery_proof_order_id(text); DROP FUNCTION public.order_line_quantity(jsonb, integer); DROP FUNCTION public.is_assigned_driver(uuid);
--   DROP TABLE public.order_item_checks;
--   ALTER TABLE public.app_settings DROP COLUMN require_packing_check, DROP COLUMN require_delivery_proof;
--   ALTER TABLE public.orders DROP COLUMN packed_at, DROP COLUMN packed_by, DROP COLUMN handed_over_at, DROP COLUMN delivery_proof_path, DROP COLUMN returned_to_warehouse_at, DROP COLUMN returned_received_by;
--   The delivery-proofs bucket is kept (it may hold photos). Delete it in the dashboard only when it is empty.
