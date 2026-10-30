-- Accountant role (tasks.txt): reads orders, returns, customers, warehouse performance, driver and marketer
-- accounts, and receives drivers' cash custody together with administrators. Warehouse managers no longer
-- confirm cash remittances. Drivers may close a COD delivery paid by bank transfer by attaching the
-- receipt; that payment never enters the driver's cash ledger and is queued for review as a payment proof.

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text, 'driver'::text, 'warehouse_supervisor'::text, 'accountant'::text]));

CREATE OR REPLACE FUNCTION public.is_accountant() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'accountant'
  );
$$;
REVOKE ALL ON FUNCTION public.is_accountant() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_accountant() TO authenticated, service_role;

-- Read access ---------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Accountant view all orders" ON public.orders;
CREATE POLICY "Accountant view all orders" ON public.orders
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view order history" ON public.order_status_history;
CREATE POLICY "Accountant view order history" ON public.order_status_history
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view payment proofs" ON public.payment_proofs;
CREATE POLICY "Accountant view payment proofs" ON public.payment_proofs
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view all profiles" ON public.profiles;
CREATE POLICY "Accountant view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view all remittances" ON public.driver_cash_remittances;
CREATE POLICY "Accountant view all remittances" ON public.driver_cash_remittances
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view driver cash ledger" ON public.driver_cash_ledger;
CREATE POLICY "Accountant view driver cash ledger" ON public.driver_cash_ledger
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view all returns" ON public.order_returns;
CREATE POLICY "Accountant view all returns" ON public.order_returns
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view drivers" ON public.drivers;
CREATE POLICY "Accountant view drivers" ON public.drivers
  FOR SELECT TO authenticated USING (public.is_accountant());

DROP POLICY IF EXISTS "Accountant view warehouses" ON public.warehouses;
CREATE POLICY "Accountant view warehouses" ON public.warehouses
  FOR SELECT TO authenticated USING (public.is_accountant());

-- Role assignment -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_set_accountant(p_user_id uuid, p_is_accountant boolean) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role NOT IN ('customer', 'accountant') THEN
    RAISE EXCEPTION 'Only customer accounts can be made accountants';
  END IF;

  UPDATE public.profiles p
  SET role = CASE WHEN p_is_accountant THEN 'accountant' ELSE 'customer' END
  WHERE p.id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_accountant(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_accountant(uuid, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_warehouse_manager_access(
  p_user_id uuid,
  p_warehouse_ids uuid[],
  p_primary_warehouse_id uuid DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_ids uuid[] := COALESCE(p_warehouse_ids, '{}'::uuid[]);
  v_primary uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role IN ('admin', 'driver', 'accountant') THEN
    RAISE EXCEPTION 'Only customer or warehouse supervisor accounts can be assigned to a warehouse';
  END IF;

  IF cardinality(v_ids) = 0 THEN
    DELETE FROM public.warehouse_manager_access a WHERE a.user_id = p_user_id;
    UPDATE public.profiles p SET role = 'customer', assigned_warehouse_id = NULL WHERE p.id = p_user_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(warehouse_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = t.warehouse_id)
  ) THEN
    RAISE EXCEPTION 'Warehouse not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(warehouse_id)
    JOIN public.warehouses w ON w.id = t.warehouse_id
    WHERE NOT w.is_active
  ) THEN
    RAISE EXCEPTION 'Selected warehouse is not active';
  END IF;

  v_primary := COALESCE(p_primary_warehouse_id, v_ids[1]);
  IF NOT (v_primary = ANY (v_ids)) THEN
    RAISE EXCEPTION 'Primary warehouse must be one of the assigned warehouses';
  END IF;

  UPDATE public.warehouse_manager_access a SET is_primary = false
  WHERE a.user_id = p_user_id AND a.is_primary;

  DELETE FROM public.warehouse_manager_access a
  WHERE a.user_id = p_user_id AND NOT (a.warehouse_id = ANY (v_ids));

  INSERT INTO public.warehouse_manager_access (user_id, warehouse_id, is_primary, granted_by)
  SELECT p_user_id, d.warehouse_id, d.warehouse_id = v_primary, auth.uid()
  FROM (SELECT DISTINCT t.warehouse_id FROM unnest(v_ids) AS t(warehouse_id)) d
  ON CONFLICT (user_id, warehouse_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

  UPDATE public.profiles p
  SET role = 'warehouse_supervisor', assigned_warehouse_id = v_primary
  WHERE p.id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_manager_access(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_manager_access(uuid, uuid[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_staff_context() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_role text;
  v_is_admin boolean;
  v_is_manager boolean;
  v_is_accountant boolean;
  v_warehouses jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  v_is_admin := public.is_admin();
  v_is_manager := public.is_warehouse_manager();
  v_is_accountant := public.is_accountant();

  IF v_is_admin OR v_is_accountant THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'code', w.code, 'is_primary', false) ORDER BY w.name), '[]'::jsonb)
    INTO v_warehouses
    FROM public.warehouses w
    WHERE w.is_active;
  ELSIF v_is_manager THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'code', w.code, 'is_primary', a.is_primary) ORDER BY a.is_primary DESC, w.name), '[]'::jsonb)
    INTO v_warehouses
    FROM public.warehouse_manager_access a
    JOIN public.warehouses w ON w.id = a.warehouse_id
    WHERE a.user_id = v_uid;
  ELSE
    v_warehouses := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'is_admin', v_is_admin,
    'is_warehouse_manager', v_is_manager,
    'is_accountant', v_is_accountant,
    'warehouses', v_warehouses
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_staff_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_context() TO authenticated, service_role;

-- Accountant reports --------------------------------------------------------------------------

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
  v_all_scope boolean := public.is_admin() OR public.is_accountant();
BEGIN
  IF NOT (v_all_scope OR public.is_warehouse_manager()) THEN
    RAISE EXCEPTION 'Supervisor, admin or accountant access required';
  END IF;

  IF p_warehouse_id IS NOT NULL THEN
    IF NOT (v_all_scope OR public.can_manage_warehouse(p_warehouse_id)) THEN
      RAISE EXCEPTION 'Warehouse is outside your scope';
    END IF;
    v_scope := ARRAY[p_warehouse_id];
  ELSIF v_all_scope THEN
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

-- Cash custody is handed to an accountant or an administrator only.
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
  IF NOT (public.is_admin() OR public.is_accountant()) THEN
    RAISE EXCEPTION 'Accountant or admin access required';
  END IF;
  IF p_action NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Action must be confirmed or rejected';
  END IF;

  SELECT r.* INTO v_remittance FROM public.driver_cash_remittances r WHERE r.id = p_remittance_id FOR UPDATE;
  IF NOT FOUND OR v_remittance.status <> 'submitted' THEN
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

CREATE OR REPLACE FUNCTION public.admin_list_order_returns(
  p_limit   integer DEFAULT NULL,
  p_offset  integer DEFAULT 0,
  p_search  text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, customer_name text, phone text, city text, state text,
  customer_id uuid, items jsonb, reason text, requested_resolution text, status text,
  customer_note text, admin_note text, restocked_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  order_payment_status text, order_payment_method text, order_total numeric,
  refund_amount numeric, refund_reference text, refunded_at timestamptz,
  returned_items_value numeric, refundable_cap numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_accountant()) THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN QUERY
  SELECT r.id, r.order_id, o.order_number, o.customer_name, o.phone, o.city, o.state,
         r.customer_id, r.items, r.reason, r.requested_resolution, r.status,
         r.customer_note, r.admin_note, r.restocked_at, r.reviewed_at, r.created_at, r.updated_at,
         o.payment_status AS order_payment_status,
         o.payment_method AS order_payment_method,
         o.total AS order_total,
         r.refund_amount,
         r.refund_reference,
         r.refunded_at,
         caps.items_value,
         caps.refund_cap,
         count(*) OVER () AS total_count
  FROM public.order_returns r
  JOIN public.orders o ON o.id = r.order_id
  CROSS JOIN LATERAL public.order_return_refund_caps(r.order_id, r.id, r.items) caps
  WHERE p_search IS NULL
     OR strpos(lower(o.order_number), lower(p_search)) > 0
     OR strpos(lower(COALESCE(o.customer_name, '')), lower(p_search)) > 0
     OR strpos(COALESCE(o.phone, ''), p_search) > 0
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_order_returns(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_order_returns(integer, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_get_affiliates()
RETURNS TABLE(id uuid, display_name text, code text, phone text, email text, status text, commission_rate numeric, minimum_payout numeric, payout_method text, payout_details text, admin_note text, total_orders bigint, total_sales numeric, total_discount_given numeric, total_commission_earned numeric, total_payouts_paid numeric, pending_balance numeric, coupons_count bigint, created_at timestamp with time zone)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_accountant()) THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  RETURN QUERY
  SELECT
    ap.id,
    ap.display_name,
    ap.code,
    ap.phone,
    ap.email,
    ap.status,
    ap.commission_rate,
    ap.minimum_payout,
    ap.payout_method,
    ap.payout_details,
    ap.admin_note,
    COALESCE(ord.total_orders, 0)::bigint AS total_orders,
    COALESCE(ord.total_sales, 0)::numeric AS total_sales,
    COALESCE(ord.total_discount, 0)::numeric AS total_discount_given,
    COALESCE(comm.total_commission, 0)::numeric AS total_commission_earned,
    COALESCE(pay.total_paid, 0)::numeric AS total_payouts_paid,
    GREATEST(COALESCE(comm.total_commission, 0) - COALESCE(pay.total_paid, 0), 0)::numeric AS pending_balance,
    COALESCE(coup.coupons_count, 0)::bigint AS coupons_count,
    ap.created_at
  FROM public.affiliate_profiles ap
  LEFT JOIN LATERAL (
    SELECT
      count(*) AS total_orders,
      sum(GREATEST(o.total - COALESCE(o.shipping_fee, 0), 0)) AS total_sales,
      sum(COALESCE(o.discount_amount, 0)) AS total_discount
    FROM public.orders o
    WHERE o.affiliate_id = ap.id AND o.status = 'delivered'
  ) ord ON true
  LEFT JOIN LATERAL (
    SELECT sum(ac.commission_amount) AS total_commission
    FROM public.affiliate_commissions ac
    WHERE ac.affiliate_id = ap.id AND ac.status IN ('approved', 'paid')
  ) comm ON true
  LEFT JOIN LATERAL (
    SELECT sum(p.amount) AS total_paid
    FROM public.affiliate_payouts p
    WHERE p.affiliate_id = ap.id
  ) pay ON true
  LEFT JOIN LATERAL (
    SELECT count(*) AS coupons_count
    FROM public.coupons c
    WHERE c.affiliate_id = ap.id
  ) coup ON true
  ORDER BY ap.created_at DESC;
END;
$$;

-- COD paid by bank transfer -------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.cod_receipt_order_id(p_object_name text) RETURNS uuid
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN split_part(p_object_name, '/', 1) = 'cod-receipts'
     AND split_part(p_object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(p_object_name, '/', 2)::uuid
  END;
$$;
REVOKE ALL ON FUNCTION public.cod_receipt_order_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cod_receipt_order_id(text) TO authenticated, service_role;

DROP POLICY IF EXISTS "Assigned drivers upload COD receipts" ON storage.objects;
CREATE POLICY "Assigned drivers upload COD receipts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND public.is_assigned_driver(public.cod_receipt_order_id(storage.objects.name)));

DROP POLICY IF EXISTS "Accountants read payment proof files" ON storage.objects;
CREATE POLICY "Accountants read payment proof files" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_accountant());

DROP FUNCTION IF EXISTS public.update_driver_order_status(uuid, text, text, text, text, text);

CREATE FUNCTION public.update_driver_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_delivery_code text DEFAULT NULL,
  p_proof_path text DEFAULT NULL,
  p_payment_type text DEFAULT 'cash',
  p_receipt_path text DEFAULT NULL
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
  v_payment_type text := COALESCE(NULLIF(trim(p_payment_type), ''), 'cash');
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_status NOT IN ('shipped', 'delivered', 'delivery_failed') THEN
    RAISE EXCEPTION 'Drivers may only update active delivery states';
  END IF;
  IF p_status = 'delivery_failed' AND NULLIF(trim(COALESCE(p_failure_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'A delivery failure reason is required';
  END IF;
  IF v_payment_type NOT IN ('cash', 'bank_transfer') THEN
    RAISE EXCEPTION 'Unsupported payment type';
  END IF;

  SELECT id INTO v_driver_id FROM public.drivers WHERE user_id = auth.uid();
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;

  SELECT o.status, o.driver_id, o.payment_method INTO v_current_status, v_current_driver_id, v_payment_method
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

  IF p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_type = 'bank_transfer' THEN
    IF p_receipt_path IS NULL THEN
      RAISE EXCEPTION 'Attach the bank transfer receipt';
    END IF;
    IF public.cod_receipt_order_id(p_receipt_path) IS DISTINCT FROM p_order_id OR strpos(p_receipt_path, '..') > 0 THEN
      RAISE EXCEPTION 'The transfer receipt must be stored in the order folder';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects so WHERE so.bucket_id = 'payment-proofs' AND so.name = p_receipt_path) THEN
      RAISE EXCEPTION 'The transfer receipt was not found';
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

  IF p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_type = 'cash' AND COALESCE(v_total, 0) > 0 THEN
    INSERT INTO public.driver_cash_ledger (driver_id, warehouse_id, entry_type, amount, order_id, business_date, created_by)
    SELECT d.id, d.warehouse_id, 'cod_collected', v_total, p_order_id, public.business_date(now()), auth.uid()
    FROM public.drivers d
    WHERE d.id = v_driver_id
    ON CONFLICT (order_id) WHERE entry_type = 'cod_collected' DO NOTHING;
  END IF;

  IF p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_type = 'bank_transfer' AND v_customer_id IS NOT NULL THEN
    INSERT INTO public.payment_proofs (order_id, customer_id, payment_method, amount, proof_path, status, review_note)
    VALUES (p_order_id, v_customer_id, 'bankak', COALESCE(v_total, 0), p_receipt_path, 'pending',
            'إشعار تحويل بنكي رفعه المندوب عند التسليم')
    ON CONFLICT (order_id) DO UPDATE
      SET proof_path = EXCLUDED.proof_path,
          amount = EXCLUDED.amount,
          status = 'pending',
          review_note = EXCLUDED.review_note,
          reviewer_id = NULL,
          reviewed_at = NULL,
          submitted_at = timezone('utc', now());
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

  v_note := concat_ws(' — ',
    CASE
      WHEN p_status = 'delivery_failed' THEN concat('تعذر التسليم: ', trim(p_failure_reason))
      WHEN p_status = 'delivered' AND v_payment_method = 'COD' AND v_payment_type = 'bank_transfer' THEN 'تم التسليم والدفع بتحويل بنكي (إشعار مرفق)'
      WHEN p_status = 'delivered' AND v_payment_method = 'COD' THEN 'تم التسليم والتحصيل نقداً'
      WHEN p_status = 'delivered' THEN 'تم التسليم'
    END,
    CASE WHEN v_code_verified THEN 'تم التحقق من رمز التسليم' END,
    NULLIF(trim(COALESCE(p_note, '')), ''));
  v_note := COALESCE(NULLIF(v_note, ''), 'تم التحديث من بوابة المندوب');

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

REVOKE ALL ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text, text, text) TO authenticated, service_role;

-- DOWN (manual):
--   Restore update_driver_order_status() (6 arguments) from 20261022000200_packing_handover_proof.sql, then
--   DROP FUNCTION public.update_driver_order_status(uuid, text, text, text, text, text, text, text).
--   Restore supervisor_confirm_cash_remittance() and get_warehouse_settlement_summary() from 20261018000400,
--   admin_list_order_returns() from 20261024000200, get_my_staff_context() and admin_set_warehouse_manager_access()
--   from 20261018000100, admin_get_affiliates() from 20260930000100.
--   DROP POLICY "Assigned drivers upload COD receipts" / "Accountants read payment proof files" ON storage.objects;
--   DROP FUNCTION public.cod_receipt_order_id(text); DROP FUNCTION public.admin_set_accountant(uuid, boolean);
--   Drop the "Accountant view ..." policies, move accountants back to 'customer', DROP FUNCTION public.is_accountant(),
--   and restore profiles_role_check without 'accountant'.
