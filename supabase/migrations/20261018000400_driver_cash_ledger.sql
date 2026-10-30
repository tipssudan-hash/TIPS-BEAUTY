-- Driver cash ledger: COD collections, confirmed remittances and manual adjustments are recorded as
-- append-only rows. driver_outstanding_cod() becomes the sum of the driver's ledger rows.

CREATE OR REPLACE FUNCTION public.business_date(p_ts timestamptz) RETURNS date
  LANGUAGE sql STABLE
  SET search_path TO 'public'
AS $$
  SELECT (p_ts AT TIME ZONE 'Africa/Khartoum')::date;
$$;
REVOKE ALL ON FUNCTION public.business_date(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.business_date(timestamptz) TO service_role;

DO $$
DECLARE
  v_dup record;
  v_resolved integer := 0;
BEGIN
  FOR v_dup IN
    SELECT s.id
    FROM (
      SELECT r.id,
             row_number() OVER (PARTITION BY r.driver_id ORDER BY r.submitted_at DESC, r.id DESC) AS rn
      FROM public.driver_cash_remittances r
      WHERE r.status = 'submitted'
    ) s
    WHERE s.rn > 1
  LOOP
    UPDATE public.driver_cash_remittances
    SET status = 'rejected',
        supervisor_notes = concat_ws(' | ', NULLIF(supervisor_notes, ''), 'رُفضت تلقائياً: تسوية مكررة قبل تطبيق الفهرس الفريد (20261018000400)')
    WHERE id = v_dup.id;
    v_resolved := v_resolved + 1;
  END LOOP;
  RAISE NOTICE 'driver_cash_remittances: % duplicate submitted remittance(s) rejected', v_resolved;
END;
$$;

CREATE TABLE public.driver_cash_ledger (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id     uuid NOT NULL REFERENCES public.drivers(id) ON DELETE RESTRICT,
  warehouse_id  uuid REFERENCES public.warehouses(id) ON DELETE SET NULL,
  entry_type    text NOT NULL CHECK (entry_type IN ('cod_collected','remittance_confirmed','adjustment')),
  amount        numeric(14,2) NOT NULL CHECK (amount <> 0),
  order_id      uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  remittance_id uuid REFERENCES public.driver_cash_remittances(id) ON DELETE RESTRICT,
  business_date date NOT NULL,
  note          text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT driver_cash_ledger_shape CHECK (
    (entry_type = 'cod_collected' AND order_id IS NOT NULL AND amount > 0)
    OR (entry_type = 'remittance_confirmed' AND remittance_id IS NOT NULL AND amount < 0)
    OR (entry_type = 'adjustment' AND note IS NOT NULL))
);

CREATE UNIQUE INDEX driver_cash_ledger_order_unique ON public.driver_cash_ledger (order_id) WHERE entry_type = 'cod_collected';
CREATE UNIQUE INDEX driver_cash_ledger_remittance_unique ON public.driver_cash_ledger (remittance_id) WHERE entry_type = 'remittance_confirmed';
CREATE INDEX driver_cash_ledger_driver_day_idx ON public.driver_cash_ledger (driver_id, business_date);
CREATE UNIQUE INDEX driver_cash_remittances_one_submitted ON public.driver_cash_remittances (driver_id) WHERE status = 'submitted';

ALTER TABLE public.driver_cash_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.driver_cash_ledger FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.driver_cash_ledger TO authenticated;
GRANT ALL ON public.driver_cash_ledger TO service_role;

CREATE POLICY "Admins view driver cash ledger"
  ON public.driver_cash_ledger FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Managers view scoped driver cash ledger"
  ON public.driver_cash_ledger FOR SELECT TO authenticated
  USING (public.is_warehouse_manager() AND warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]));

CREATE POLICY "Drivers view own cash ledger"
  ON public.driver_cash_ledger FOR SELECT TO authenticated
  USING (driver_id IN (SELECT d.id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid())));

INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, order_id, business_date, created_at)
SELECT o.driver_id, d.warehouse_id, 'cod_collected', o.total, o.id,
       public.business_date(h.first_delivered), h.first_delivered
FROM public.orders o
JOIN public.drivers d ON d.id = o.driver_id
JOIN LATERAL (
  SELECT min(x.created_at) AS first_delivered
  FROM public.order_status_history x
  WHERE x.order_id = o.id AND x.status = 'delivered'
) h ON h.first_delivered IS NOT NULL
WHERE o.payment_method = 'COD' AND o.status = 'delivered' AND o.total > 0
ON CONFLICT (order_id) WHERE entry_type = 'cod_collected' DO NOTHING;

INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, remittance_id, business_date, created_by, created_at)
SELECT r.driver_id, r.warehouse_id, 'remittance_confirmed', -r.amount, r.id,
       public.business_date(COALESCE(r.confirmed_at, r.submitted_at)), r.confirmed_by,
       COALESCE(r.confirmed_at, r.submitted_at)
FROM public.driver_cash_remittances r
WHERE r.status = 'confirmed'
ON CONFLICT (remittance_id) WHERE entry_type = 'remittance_confirmed' DO NOTHING;

DO $$
DECLARE
  v_row record;
  v_differs integer := 0;
BEGIN
  FOR v_row IN
    SELECT d.id AS driver_id,
           COALESCE((
             SELECT SUM(o.total) FROM public.orders o
             WHERE o.driver_id = d.id AND o.payment_method = 'COD' AND o.status = 'delivered'
           ), 0) - COALESCE((
             SELECT SUM(r.amount) FROM public.driver_cash_remittances r
             WHERE r.driver_id = d.id AND r.status = 'confirmed'
           ), 0) AS legacy_outstanding,
           COALESCE((
             SELECT SUM(l.amount) FROM public.driver_cash_ledger l WHERE l.driver_id = d.id
           ), 0) AS ledger_outstanding
    FROM public.drivers d
  LOOP
    IF v_row.legacy_outstanding IS DISTINCT FROM v_row.ledger_outstanding THEN
      v_differs := v_differs + 1;
      RAISE NOTICE 'driver % outstanding differs: legacy=% ledger=%', v_row.driver_id, v_row.legacy_outstanding, v_row.ledger_outstanding;
    END IF;
  END LOOP;
  RAISE NOTICE 'driver cash reconciliation: % driver(s) differ from the legacy formula', v_differs;
END;
$$;

CREATE OR REPLACE FUNCTION public.driver_outstanding_cod(p_driver_id uuid) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(SUM(l.amount), 0) FROM public.driver_cash_ledger l WHERE l.driver_id = p_driver_id;
$$;
REVOKE ALL ON FUNCTION public.driver_outstanding_cod(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_outstanding_cod(uuid) TO service_role;

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
  v_total numeric;
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
  RETURNING status, payment_method, payment_status, total INTO p_status, v_payment_method, v_payment_status, v_total;

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

  SELECT d.id, d.warehouse_id INTO v_driver_id, v_warehouse_id
  FROM public.drivers d WHERE d.user_id = auth.uid() FOR UPDATE;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile not found'; END IF;

  IF EXISTS (SELECT 1 FROM public.driver_cash_remittances r WHERE r.driver_id = v_driver_id AND r.status = 'submitted') THEN
    RAISE EXCEPTION 'A cash remittance is already awaiting confirmation';
  END IF;
  IF p_amount > public.driver_outstanding_cod(v_driver_id) THEN
    RAISE EXCEPTION 'Remittance amount exceeds the outstanding COD balance';
  END IF;

  INSERT INTO public.driver_cash_remittances (driver_id, warehouse_id, amount, driver_notes, status)
  VALUES (v_driver_id, v_warehouse_id, p_amount, NULLIF(trim(COALESCE(p_notes, '')), ''), 'submitted')
  RETURNING id INTO v_remittance_id;

  RETURN v_remittance_id;
END;
$$;

REVOKE ALL ON FUNCTION public.driver_submit_cash_remittance(numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.driver_submit_cash_remittance(numeric, text) TO authenticated, service_role;

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

  IF p_action = 'confirmed' THEN
    INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, remittance_id, business_date, created_by)
    VALUES (v_remittance.driver_id, v_remittance.warehouse_id, 'remittance_confirmed', -v_remittance.amount,
            v_remittance.id, public.business_date(now()), auth.uid());
  END IF;

  RETURN p_action;
END;
$$;

REVOKE ALL ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supervisor_confirm_cash_remittance(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_cash_position(p_business_date date DEFAULT NULL) RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_driver_id uuid;
  v_date date := COALESCE(p_business_date, public.business_date(now()));
  v_opening numeric;
  v_collected numeric;
  v_remitted numeric;
  v_adjustments numeric;
  v_pending numeric;
  v_entries jsonb;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  SELECT d.id INTO v_driver_id FROM public.drivers d WHERE d.user_id = (SELECT auth.uid());
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;

  SELECT
    COALESCE(SUM(l.amount) FILTER (WHERE l.business_date < v_date), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE l.business_date = v_date AND l.entry_type = 'cod_collected'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE l.business_date = v_date AND l.entry_type = 'remittance_confirmed'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE l.business_date = v_date AND l.entry_type = 'adjustment'), 0)
  INTO v_opening, v_collected, v_remitted, v_adjustments
  FROM public.driver_cash_ledger l
  WHERE l.driver_id = v_driver_id AND l.business_date <= v_date;

  SELECT COALESCE(SUM(r.amount), 0) INTO v_pending
  FROM public.driver_cash_remittances r
  WHERE r.driver_id = v_driver_id AND r.status = 'submitted';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'order_number', e.order_number,
    'entry_type', e.entry_type,
    'amount', e.amount,
    'created_at', e.created_at
  ) ORDER BY e.created_at), '[]'::jsonb)
  INTO v_entries
  FROM (
    SELECT o.order_number, l.entry_type, l.amount, l.created_at
    FROM public.driver_cash_ledger l
    LEFT JOIN public.orders o ON o.id = l.order_id
    WHERE l.driver_id = v_driver_id AND l.business_date = v_date
  ) e;

  RETURN jsonb_build_object(
    'business_date', v_date,
    'opening_balance', v_opening,
    'collected', v_collected,
    'remitted_confirmed', v_remitted,
    'adjustments', v_adjustments,
    'pending_submitted', v_pending,
    'closing_balance', v_opening + v_collected + v_remitted + v_adjustments,
    'entries', v_entries
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_cash_position(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_cash_position(date) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_adjust_driver_cash(p_driver_id uuid, p_amount numeric, p_note text) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_warehouse_id uuid;
  v_entry_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_amount IS NULL OR round(p_amount, 2) = 0 THEN RAISE EXCEPTION 'Adjustment amount cannot be zero'; END IF;
  IF NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN RAISE EXCEPTION 'A note is required for cash adjustments'; END IF;

  SELECT d.warehouse_id INTO v_warehouse_id FROM public.drivers d WHERE d.id = p_driver_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver not found'; END IF;

  INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, business_date, note, created_by)
  VALUES (p_driver_id, v_warehouse_id, 'adjustment', round(p_amount, 2), public.business_date(now()), trim(p_note), auth.uid())
  RETURNING id INTO v_entry_id;

  RETURN v_entry_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_adjust_driver_cash(uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_adjust_driver_cash(uuid, numeric, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_my_deliveries(uuid);

CREATE FUNCTION public.get_my_deliveries(p_order_id uuid DEFAULT NULL)
RETURNS TABLE(
  id uuid, order_number text, status text, created_at timestamp with time zone, status_changed_at timestamp with time zone,
  customer_name text, phone text, shipping_address text, city text, state text, notes text,
  items jsonb, item_count integer, payment_method text, cod_amount numeric, warehouse_name text,
  customer_lat numeric, customer_lng numeric, cod_collected boolean
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
         EXISTS (SELECT 1 FROM public.driver_cash_ledger l WHERE l.order_id = o.id AND l.entry_type = 'cod_collected')
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
    'cash_ledger', (
      SELECT jsonb_build_object(
        'cod_collected', COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'cod_collected' AND l.business_date BETWEEN p_start AND p_end), 0),
        'remitted_confirmed', COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'remittance_confirmed' AND l.business_date BETWEEN p_start AND p_end), 0),
        'adjustments', COALESCE(SUM(l.amount) FILTER (WHERE l.entry_type = 'adjustment' AND l.business_date BETWEEN p_start AND p_end), 0),
        'outstanding', COALESCE(SUM(l.amount), 0)
      )
      FROM public.driver_cash_ledger l
      WHERE v_scope IS NULL OR l.warehouse_id = ANY (v_scope)
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
--   Restore driver_outstanding_cod(), supervisor_confirm_cash_remittance(), driver_submit_cash_remittance(),
--   update_driver_order_status() (4 arguments), get_my_deliveries() (20261008000200 body, drop first) and
--   get_warehouse_settlement_summary() (20261018000200 body) from their previous migrations.
--   DROP FUNCTION public.get_my_cash_position(date); DROP FUNCTION public.admin_adjust_driver_cash(uuid, numeric, text);
--   DROP FUNCTION public.business_date(timestamptz);
--   DROP TABLE public.driver_cash_ledger;
--   Duplicate remittances rejected by this migration keep status 'rejected' and the note 'رُفضت تلقائياً'.
--   Find them with: SELECT id FROM driver_cash_remittances WHERE supervisor_notes LIKE '%20261018000400%';
--   and restore status = 'submitted' manually if the rejection is wrong.
