-- 20261028000100_accountant_role.sql
-- Adds 'accountant' role to the system with appropriate RLS policies
-- for read-only access to orders, returns, customers, and full access to
-- the cash remittance settlement workflow.

-- ============================================================================
-- 1. Helper: is_accountant()
-- ============================================================================
CREATE OR REPLACE FUNCTION public.is_accountant()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'accountant'
  );
$$;

REVOKE ALL ON FUNCTION public.is_accountant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_accountant() TO authenticated, service_role;

-- ============================================================================
-- 2. Orders: accountant can read all orders (same as admin)
-- ============================================================================
CREATE POLICY "Accountant view all orders"
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 3. Order history: accountant can read
-- ============================================================================
CREATE POLICY "Accountant view order history"
  ON public.order_status_history FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 4. Payment proofs: accountant can read
-- ============================================================================
CREATE POLICY "Accountant view payment proofs"
  ON public.payment_proofs FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 5. Profiles / customers: accountant can read
-- ============================================================================
CREATE POLICY "Accountant view all profiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 6. Cash remittances: accountant can read all + confirm/reject
-- ============================================================================
CREATE POLICY "Accountant view all remittances"
  ON public.driver_cash_remittances FOR SELECT TO authenticated
  USING (public.is_accountant());

CREATE POLICY "Accountant update remittances"
  ON public.driver_cash_remittances FOR UPDATE TO authenticated
  USING (public.is_accountant())
  WITH CHECK (public.is_accountant());

-- ============================================================================
-- 7. Returns: accountant can read all returns
-- ============================================================================
-- Note: admin_list_order_returns RPC is SECURITY DEFINER, so it already
-- bypasses RLS. But we add a direct-table policy for any future direct queries.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'order_returns'
  ) THEN
    EXECUTE '
      CREATE POLICY "Accountant view all returns"
        ON public.order_returns FOR SELECT TO authenticated
        USING (public.is_accountant())
    ';
  END IF;
END
$$;

-- ============================================================================
-- 8. Drivers: accountant can read drivers list for account summaries
-- ============================================================================
CREATE POLICY "Accountant view drivers"
  ON public.drivers FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 9. Warehouses: accountant can read warehouses for reporting
-- ============================================================================
CREATE POLICY "Accountant view warehouses"
  ON public.warehouses FOR SELECT TO authenticated
  USING (public.is_accountant());

-- ============================================================================
-- 10. get_warehouse_settlement_summary: allow accountant to call it
-- Update the function to accept accountant role as well
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_warehouse_settlement_summary(
  p_start date DEFAULT (CURRENT_DATE - 30),
  p_end   date DEFAULT CURRENT_DATE
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
  ELSIF public.is_admin() OR public.is_accountant() THEN
    v_warehouse_id := NULL; -- all warehouses
  ELSE
    RAISE EXCEPTION 'Supervisor, admin or accountant access required';
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
-- 11. supervisor_confirm_cash_remittance: allow accountant to call it
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
  IF NOT (public.is_warehouse_supervisor() OR public.is_admin() OR public.is_accountant()) THEN
    RAISE EXCEPTION 'Supervisor, admin or accountant access required';
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
-- 12. Storage policies for payment-proofs (allow drivers to upload COD receipts)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'storage' AND tablename = 'objects'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated insert payment proofs'
    ) THEN
      CREATE POLICY "Authenticated insert payment proofs"
        ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'payment-proofs');
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated read payment proofs'
    ) THEN
      CREATE POLICY "Authenticated read payment proofs"
        ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'payment-proofs');
    END IF;
  END IF;
END
$$;

-- Drivers can insert payment proof records upon delivery confirmation
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_proofs' AND policyname = 'Drivers insert payment proofs on delivery'
  ) THEN
    CREATE POLICY "Drivers insert payment proofs on delivery"
      ON public.payment_proofs FOR INSERT TO authenticated
      WITH CHECK (public.is_driver());
  END IF;
END
$$;

-- ============================================================================
-- 13. update_driver_order_status: Support COD Cash vs Bank Transfer with Receipt
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_driver_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_payment_type text DEFAULT 'cash',
  p_receipt_url text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_driver_id uuid;
  v_note text;
  v_payment_method text;
  v_payment_status text;
  v_customer_id uuid;
  v_order_total numeric;
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
  RETURNING status, payment_method, payment_status, customer_id, total
    INTO p_status, v_payment_method, v_payment_status, v_customer_id, v_order_total;

  IF NOT FOUND THEN RAISE EXCEPTION 'This status transition is not available for the assigned order'; END IF;

  -- Auto-mark COD as paid when driver confirms delivery
  IF p_status = 'delivered' AND v_payment_method = 'COD' THEN
    UPDATE public.orders
    SET payment_status = 'paid',
        financial_status = 'paid'
    WHERE id = p_order_id;

    -- If bank transfer with receipt, register in payment_proofs
    IF p_payment_type = 'bank_transfer' AND p_receipt_url IS NOT NULL THEN
      INSERT INTO public.payment_proofs (
        order_id,
        customer_id,
        payment_method,
        amount,
        proof_path,
        status,
        reviewer_id,
        review_note,
        reviewed_at
      )
      VALUES (
        p_order_id,
        v_customer_id,
        'bankak',
        v_order_total,
        p_receipt_url,
        'verified',
        auth.uid(),
        'تم استلام إشعار التحويل البنكي بواسطة المندوب عند التسليم',
        timezone('utc', now())
      )
      ON CONFLICT (order_id) DO UPDATE
      SET proof_path = EXCLUDED.proof_path,
          status = 'verified',
          review_note = EXCLUDED.review_note,
          reviewed_at = timezone('utc', now());
    END IF;
  END IF;

  v_note := CASE
    WHEN p_status = 'delivery_failed' THEN
      concat('تعذر التسليم: ', trim(p_failure_reason),
             CASE WHEN NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN ''
                  ELSE concat(' — ', trim(p_note)) END)
    WHEN p_status = 'delivered' AND v_payment_method = 'COD' AND p_payment_type = 'bank_transfer' THEN
      concat('تم التسليم والدفع بتحويل بنكي (إشعار مرفق)',
             CASE WHEN NULLIF(trim(COALESCE(p_note, '')), '') IS NULL THEN ''
                  ELSE concat(' — ', trim(p_note)) END)
    WHEN p_status = 'delivered' AND v_payment_method = 'COD' THEN
      concat('تم التسليم والتحصيل نقداً',
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

REVOKE ALL ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text) TO authenticated, service_role;

