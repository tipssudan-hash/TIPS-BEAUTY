-- 20261008000300_full_cash_cycle.sql
-- Full order-to-payment-to-settlement cycle for COD and cash accounting.

-- ============================================================================
-- 1. driver_cash_remittances table
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.driver_cash_remittances (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
    warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
    amount numeric NOT NULL CHECK (amount > 0),
    status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'confirmed', 'rejected')),
    driver_notes text,
    supervisor_notes text,
    submitted_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL,
    confirmed_at timestamp with time zone,
    confirmed_by uuid REFERENCES auth.users(id),
    created_at timestamp with time zone DEFAULT timezone('utc', now()) NOT NULL
);

ALTER TABLE public.driver_cash_remittances ENABLE ROW LEVEL SECURITY;

-- Drivers see only their own remittances
CREATE POLICY "Drivers view own remittances"
  ON public.driver_cash_remittances FOR SELECT TO authenticated
  USING (
    driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()))
  );

-- Drivers can insert their own remittances
CREATE POLICY "Drivers insert own remittances"
  ON public.driver_cash_remittances FOR INSERT TO authenticated
  WITH CHECK (
    driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid()))
  );

-- Supervisors see remittances for their warehouse
CREATE POLICY "Supervisors view warehouse remittances"
  ON public.driver_cash_remittances FOR SELECT TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND (warehouse_id = public.my_warehouse_id() OR warehouse_id IS NULL)
  );

-- Supervisors can update (confirm/reject) remittances for their warehouse
CREATE POLICY "Supervisors update warehouse remittances"
  ON public.driver_cash_remittances FOR UPDATE TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND (warehouse_id = public.my_warehouse_id() OR warehouse_id IS NULL)
  )
  WITH CHECK (
    public.is_warehouse_supervisor()
    AND (warehouse_id = public.my_warehouse_id() OR warehouse_id IS NULL)
  );

-- Admins see everything
CREATE POLICY "Admins manage all remittances"
  ON public.driver_cash_remittances FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT ON public.driver_cash_remittances TO authenticated;
GRANT ALL ON public.driver_cash_remittances TO service_role;

-- ============================================================================
-- 2. Update update_driver_order_status to auto-mark COD as paid on delivery
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_driver_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_driver_id uuid;
  v_note text;
  v_payment_method text;
  v_payment_status text;
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

  UPDATE public.orders SET status = p_status
  WHERE id = p_order_id AND driver_id = v_driver_id
    AND ((p_status = 'shipped' AND status IN ('confirmed', 'preparing'))
      OR (p_status IN ('delivered', 'delivery_failed') AND status = 'shipped'))
  RETURNING status, payment_method, payment_status INTO p_status, v_payment_method, v_payment_status;

  IF NOT FOUND THEN RAISE EXCEPTION 'This status transition is not available for the assigned order'; END IF;

  -- Auto-mark COD as paid when driver confirms delivery
  IF p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_status = 'pending' THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        financial_status = 'paid'
    WHERE id = p_order_id;
  END IF;

  v_note := CASE
    WHEN p_status = 'delivery_failed' THEN
      concat('تعذر التسليم: ', trim(p_failure_reason),
             CASE WHEN NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN ''
                  ELSE concat(' — ', trim(p_note)) END)
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

-- ============================================================================
-- 3. Driver submit cash remittance RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.driver_submit_cash_remittance(
  p_amount numeric,
  p_notes text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_driver_id uuid;
  v_warehouse_id uuid;
  v_remittance_id uuid;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;

  SELECT id, warehouse_id INTO v_driver_id, v_warehouse_id
  FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile not found'; END IF;

  INSERT INTO public.driver_cash_remittances (driver_id, warehouse_id, amount, driver_notes, status)
  VALUES (v_driver_id, v_warehouse_id, p_amount, NULLIF(trim(COALESCE(p_notes, '')), ''), 'submitted')
  RETURNING id INTO v_remittance_id;

  RETURN v_remittance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_submit_cash_remittance(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_submit_cash_remittance(numeric, text) TO authenticated, service_role;

-- ============================================================================
-- 4. Supervisor confirm/reject cash remittance RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.supervisor_confirm_cash_remittance(
  p_remittance_id uuid,
  p_action text DEFAULT 'confirmed',
  p_notes text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT (public.is_warehouse_supervisor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;
  IF p_action NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Action must be confirmed or rejected';
  END IF;

  UPDATE public.driver_cash_remittances
  SET status = p_action,
      supervisor_notes = NULLIF(trim(COALESCE(p_notes, '')), ''),
      confirmed_at = CASE WHEN p_action = 'confirmed' THEN timezone('utc', now()) ELSE confirmed_at END,
      confirmed_by = CASE WHEN p_action = 'confirmed' THEN auth.uid() ELSE confirmed_by END
  WHERE id = p_remittance_id
    AND status = 'submitted'
  RETURNING status INTO v_status;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Remittance not found or already processed';
  END IF;

  RETURN v_status;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- 5. Supervisor: warehouse drivers list RPC
-- ============================================================================
CREATE OR REPLACE FUNCTION public.supervisor_get_warehouse_drivers()
RETURNS TABLE(id uuid, name text, phone text, status text, active_deliveries bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT d.id, d.name, d.phone, d.status,
         (SELECT count(*) FROM public.orders o WHERE o.driver_id = d.id AND o.status IN ('preparing', 'shipped'))
  FROM public.drivers d
  WHERE (public.is_warehouse_supervisor() AND (d.warehouse_id = public.my_warehouse_id() OR d.warehouse_id IS NULL))
     OR public.is_admin()
  ORDER BY d.name;
$$;

REVOKE ALL ON FUNCTION public.supervisor_get_warehouse_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_get_warehouse_drivers() TO authenticated, service_role;

-- ============================================================================
-- 6. Supervisor: assign driver to order
-- ============================================================================
CREATE OR REPLACE FUNCTION public.supervisor_assign_driver(
  p_order_id uuid,
  p_driver_id uuid
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_warehouse_supervisor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  UPDATE public.orders
  SET driver_id = p_driver_id,
      status = CASE WHEN status = 'new' THEN 'confirmed' WHEN status = 'confirmed' THEN 'preparing' ELSE status END
  WHERE id = p_order_id
    AND status IN ('new', 'confirmed', 'preparing');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found or not in assignable state';
  END IF;

  INSERT INTO public.order_status_history(order_id, status, note, changed_by)
  VALUES (p_order_id, (SELECT status FROM public.orders WHERE id = p_order_id),
          'تم إسناد الطلب للمندوب من قبل المشرف', auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_assign_driver(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_assign_driver(uuid, uuid) TO authenticated, service_role;

-- ============================================================================
-- 7. Supervisor: update order status/notes
-- ============================================================================
CREATE OR REPLACE FUNCTION public.supervisor_update_order(
  p_order_id uuid,
  p_status text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT (public.is_warehouse_supervisor() OR public.is_admin()) THEN
    RAISE EXCEPTION 'Supervisor or admin access required';
  END IF;

  IF p_status IS NOT NULL THEN
    UPDATE public.orders SET status = p_status WHERE id = p_order_id;
    INSERT INTO public.order_status_history(order_id, status, note, changed_by)
    VALUES (p_order_id, p_status, COALESCE(NULLIF(trim(p_notes), ''), 'تم التحديث من المشرف'), auth.uid());
  END IF;

  IF p_notes IS NOT NULL AND p_status IS NULL THEN
    UPDATE public.orders SET notes = p_notes WHERE id = p_order_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_update_order(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_update_order(uuid, text, text) TO authenticated, service_role;

-- ============================================================================
-- 8. Settlement & profit summary RPC (supervisor/admin)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_warehouse_settlement_summary(
  p_start date DEFAULT (CURRENT_DATE - interval '30 days')::date,
  p_end date DEFAULT CURRENT_DATE
)
RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_warehouse_id uuid;
  v_result jsonb;
BEGIN
  IF public.is_warehouse_supervisor() THEN
    v_warehouse_id := public.my_warehouse_id();
  ELSIF public.is_admin() THEN
    v_warehouse_id := NULL; -- all warehouses
  ELSE
    RAISE EXCEPTION 'Supervisor or admin access required';
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
        AND (v_warehouse_id IS NULL OR r.warehouse_id = v_warehouse_id)
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
          ), 0)
        ) AS driver_row
        FROM public.drivers d
        LEFT JOIN public.orders o2 ON o2.driver_id = d.id AND o2.created_at::date BETWEEN p_start AND p_end
        WHERE (v_warehouse_id IS NULL OR d.warehouse_id = v_warehouse_id)
        GROUP BY d.id, d.name
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.orders o
  WHERE o.created_at::date BETWEEN p_start AND p_end
    AND (v_warehouse_id IS NULL OR o.fulfillment_warehouse_id = v_warehouse_id);

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_warehouse_settlement_summary(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_warehouse_settlement_summary(date, date) TO authenticated, service_role;

-- ============================================================================
-- 9. Grant UPDATE on orders to authenticated (needed for supervisor status changes)
-- ============================================================================
GRANT UPDATE ON public.orders TO authenticated;
GRANT UPDATE ON public.driver_cash_remittances TO authenticated;
