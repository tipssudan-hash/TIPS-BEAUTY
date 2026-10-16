-- ==============================================================================
-- Migration: 20261017000100_fix_revenue_affiliate_and_refund_scams.sql
-- 1. Exclude 'delivery_failed' from admin business revenue and city breakdown
-- 2. Fix Cartesian product bug in admin_get_affiliate_details
-- 3. Fortify returns & refund flow with strict anti-scam safeguards:
--    - Verify order payment_status = 'paid' before permitting return requests or refunds
--    - Enforce sequential state transitions: requested -> approved -> received -> refunded/closed
--    - Prevent cumulative return quantity exploits across multiple requests
--    - Track refund_amount, refund_reference, and refunded_at for financial audits
-- ==============================================================================

-- 1. Exclude delivery_failed from admin_business_report
CREATE OR REPLACE FUNCTION public.admin_business_report(
  p_start date DEFAULT (CURRENT_DATE - 30),
  p_end date DEFAULT CURRENT_DATE
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_report jsonb;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT jsonb_build_object(
    'revenue', COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'delivery_failed')), 0),
    'paid_revenue', COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0),
    'orders', COUNT(*),
    'delivered_orders', COUNT(*) FILTER (WHERE o.status = 'delivered'),
    'pending_payments', COUNT(*) FILTER (WHERE o.payment_status IN ('pending', 'proof_submitted')),
    'returns', (SELECT COUNT(*) FROM public.order_returns r WHERE r.created_at::date BETWEEN p_start AND p_end),
    'by_city', COALESCE((
      SELECT jsonb_agg(city_row ORDER BY (city_row->>'revenue')::numeric DESC)
      FROM (
        SELECT jsonb_build_object(
          'city', COALESCE(city, 'غير محدد'),
          'orders', COUNT(*),
          'revenue', COALESCE(SUM(total), 0)
        ) AS city_row
        FROM public.orders
        WHERE created_at::date BETWEEN p_start AND p_end
          AND status NOT IN ('cancelled', 'delivery_failed')
        GROUP BY city
      ) s
    ), '[]'::jsonb),
    'low_stock', COALESCE((
      SELECT jsonb_agg(stock_row)
      FROM (
        SELECT jsonb_build_object(
          'product_id', wi.product_id,
          'product_name', p.name_ar,
          'warehouse', w.name,
          'quantity', wi.quantity,
          'reorder_level', wi.reorder_level
        ) AS stock_row
        FROM public.warehouse_inventory wi
        JOIN public.products p ON p.id = wi.product_id
        JOIN public.warehouses w ON w.id = wi.warehouse_id
        WHERE wi.quantity <= wi.reorder_level
        ORDER BY wi.quantity ASC
        LIMIT 10
      ) l
    ), '[]'::jsonb)
  ) INTO v_report
  FROM public.orders o
  WHERE o.created_at::date BETWEEN p_start AND p_end;

  RETURN COALESCE(v_report, '{}'::jsonb);
END;
$$;

ALTER FUNCTION public.admin_business_report(date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_business_report(date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_business_report(date, date) TO authenticated, service_role;


-- 2. Fix Cartesian product bug in admin_get_affiliate_details
CREATE OR REPLACE FUNCTION public.admin_get_affiliate_details(p_affiliate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_coupons jsonb;
  v_orders jsonb;
  v_commissions jsonb;
  v_payouts jsonb;
  v_stats record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_profile FROM public.affiliate_profiles WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found'; END IF;

  -- Coupons assigned to this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'name', c.name,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'max_discount_amount', c.max_discount_amount,
    'usage_count', c.usage_count,
    'is_active', c.is_active,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_coupons
  FROM public.coupons c
  WHERE c.affiliate_id = p_affiliate_id;

  -- Orders brought by this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'total', o.total,
    'discount_amount', o.discount_amount,
    'coupon_code', o.coupon_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'created_at', o.created_at
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM public.orders o
  WHERE o.affiliate_id = p_affiliate_id;

  -- Commissions history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ac.id,
    'order_id', ac.order_id,
    'order_number', o.order_number,
    'commission_amount', ac.commission_amount,
    'commission_rate', ac.commission_rate,
    'status', ac.status,
    'created_at', ac.created_at,
    'paid_at', ac.paid_at
  ) ORDER BY ac.created_at DESC), '[]'::jsonb)
  INTO v_commissions
  FROM public.affiliate_commissions ac
  LEFT JOIN public.orders o ON o.id = ac.order_id
  WHERE ac.affiliate_id = p_affiliate_id;

  -- Payouts history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ap.id,
    'amount', ap.amount,
    'payout_method', ap.payout_method,
    'reference_number', ap.reference_number,
    'notes', ap.notes,
    'created_at', ap.created_at
  ) ORDER BY ap.created_at DESC), '[]'::jsonb)
  INTO v_payouts
  FROM public.affiliate_payouts ap
  WHERE ap.affiliate_id = p_affiliate_id;

  -- Aggregated stats: Fix Cartesian Product by aggregating each entity independently
  SELECT
    (SELECT count(DISTINCT o.id) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_orders,
    (SELECT COALESCE(sum(GREATEST(o.total - COALESCE(o.shipping_fee, 0), 0)), 0) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_sales,
    (SELECT COALESCE(sum(COALESCE(o.discount_amount, 0)), 0) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_discounts,
    (SELECT COALESCE(sum(ac.commission_amount), 0) FROM public.affiliate_commissions ac WHERE ac.affiliate_id = p_affiliate_id AND ac.status IN ('approved', 'paid')) AS total_commission_earned,
    (SELECT COALESCE(sum(ap.amount), 0) FROM public.affiliate_payouts ap WHERE ap.affiliate_id = p_affiliate_id) AS total_paid
  INTO v_stats;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'code', v_profile.code,
      'phone', v_profile.phone,
      'email', v_profile.email,
      'status', v_profile.status,
      'commission_rate', v_profile.commission_rate,
      'minimum_payout', v_profile.minimum_payout,
      'payout_method', v_profile.payout_method,
      'payout_details', v_profile.payout_details,
      'admin_note', v_profile.admin_note,
      'created_at', v_profile.created_at
    ),
    'stats', jsonb_build_object(
      'total_orders', COALESCE(v_stats.total_delivered_orders, 0),
      'total_sales', COALESCE(v_stats.total_delivered_sales, 0),
      'total_discount_given', COALESCE(v_stats.total_delivered_discounts, 0),
      'total_commission_earned', COALESCE(v_stats.total_commission_earned, 0),
      'total_payouts_paid', COALESCE(v_stats.total_paid, 0),
      'pending_balance', GREATEST(COALESCE(v_stats.total_commission_earned, 0) - COALESCE(v_stats.total_paid, 0), 0)
    ),
    'coupons', v_coupons,
    'orders', v_orders,
    'commissions', v_commissions,
    'payouts', v_payouts
  );
END;
$$;

ALTER FUNCTION public.admin_get_affiliate_details(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_get_affiliate_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliate_details(uuid) TO authenticated, service_role;


-- 3. Add audit columns to order_returns for anti-scam refund tracking
ALTER TABLE public.order_returns ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2) DEFAULT NULL;
ALTER TABLE public.order_returns ADD COLUMN IF NOT EXISTS refund_reference text DEFAULT NULL;
ALTER TABLE public.order_returns ADD COLUMN IF NOT EXISTS refunded_at timestamp with time zone DEFAULT NULL;


-- 4. Fortify request_order_return: Verify order is paid + Prevent cumulative quantity exploits
CREATE OR REPLACE FUNCTION public.request_order_return(
  p_order_id uuid,
  p_items jsonb,
  p_reason text,
  p_requested_resolution text,
  p_customer_note text DEFAULT NULL::text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_return_id uuid;
  v_order_items jsonb;
  v_item jsonb;
  v_allowed_quantity integer;
  v_already_returned_qty integer;
  v_delivered_at timestamptz;
  v_payment_status text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_requested_resolution NOT IN ('refund', 'exchange') THEN RAISE EXCEPTION 'Unsupported return resolution'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'Return reason is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  -- Anti-scam: Only delivered AND paid orders can be returned
  SELECT items, payment_status INTO v_order_items, v_payment_status
  FROM public.orders
  WHERE id = p_order_id AND customer_id = v_user_id AND status = 'delivered'
  FOR UPDATE;

  IF v_order_items IS NULL THEN RAISE EXCEPTION 'Only delivered orders can be returned'; END IF;
  IF v_payment_status <> 'paid' THEN RAISE EXCEPTION 'Only fully paid orders can be returned'; END IF;

  -- Enforce 7-day return window from actual delivery entry in status history
  SELECT created_at INTO v_delivered_at FROM public.order_status_history
  WHERE order_id = p_order_id AND status = 'delivered'
  ORDER BY created_at DESC LIMIT 1;

  IF v_delivered_at IS NULL OR timezone('utc', now()) > v_delivered_at + interval '7 days' THEN
    RAISE EXCEPTION 'Return window has expired';
  END IF;

  -- Validate each return item and enforce cumulative quantity bounds
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(v_item->>'id', '') IS NULL OR COALESCE((v_item->>'quantity')::integer, 0) < 1 THEN
      RAISE EXCEPTION 'Invalid return item';
    END IF;

    SELECT (purchased_item->>'quantity')::integer INTO v_allowed_quantity
    FROM jsonb_array_elements(v_order_items) purchased_item
    WHERE purchased_item->>'id' = v_item->>'id'
    LIMIT 1;

    IF v_allowed_quantity IS NULL OR (v_item->>'quantity')::integer > v_allowed_quantity THEN
      RAISE EXCEPTION 'Return items must match the delivered order';
    END IF;

    -- Anti-scam: Check cumulative quantity already returned or pending in all non-rejected returns
    SELECT COALESCE(sum((returned_item->>'quantity')::integer), 0) INTO v_already_returned_qty
    FROM public.order_returns r, jsonb_array_elements(r.items) returned_item
    WHERE r.order_id = p_order_id
      AND r.status <> 'rejected'
      AND returned_item->>'id' = v_item->>'id';

    IF (v_item->>'quantity')::integer + v_already_returned_qty > v_allowed_quantity THEN
      RAISE EXCEPTION 'Requested return quantity exceeds remaining eligible quantity for this item';
    END IF;
  END LOOP;

  INSERT INTO public.order_returns (order_id, customer_id, items, reason, requested_resolution, customer_note)
  VALUES (p_order_id, v_user_id, p_items, trim(p_reason), p_requested_resolution, NULLIF(trim(p_customer_note), ''))
  RETURNING id INTO v_return_id;

  RETURN v_return_id;
END;
$$;

ALTER FUNCTION public.request_order_return(uuid, jsonb, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.request_order_return(uuid, jsonb, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_order_return(uuid, jsonb, text, text, text) TO authenticated, service_role;


-- 5. Fortify review_order_return: Enforce state machine + verify order payment + audit refund details
DROP FUNCTION IF EXISTS public.review_order_return(uuid, text, text, boolean);
CREATE OR REPLACE FUNCTION public.review_order_return(
  p_return_id uuid,
  p_status text,
  p_admin_note text DEFAULT NULL::text,
  p_restock boolean DEFAULT false,
  p_refund_amount numeric DEFAULT NULL::numeric,
  p_refund_reference text DEFAULT NULL::text
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return public.order_returns%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_warehouse_id uuid;
  v_item jsonb;
  v_calc_refund numeric := 0;
  v_item_line_total numeric;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_status NOT IN ('approved', 'rejected', 'received', 'refunded', 'closed') THEN
    RAISE EXCEPTION 'Unsupported return status';
  END IF;

  SELECT * INTO v_return FROM public.order_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return request not found'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_return.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Associated order not found'; END IF;

  -- Anti-scam 1: Finalized returns cannot be re-reviewed
  IF v_return.status IN ('refunded', 'closed', 'rejected') THEN
    RAISE EXCEPTION 'This return request has already been finalized (%)', v_return.status;
  END IF;

  -- Anti-scam 2: Strict transition progression
  IF v_return.status = 'requested' AND p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'A requested return must first be approved or rejected';
  END IF;

  IF v_return.status = 'approved' AND p_status NOT IN ('received', 'rejected') THEN
    RAISE EXCEPTION 'Approved return must be physically received before refunding or closing';
  END IF;

  IF v_return.status = 'received' AND p_status NOT IN ('refunded', 'closed') THEN
    RAISE EXCEPTION 'Received return can only be transitioned to refunded or closed';
  END IF;

  -- Anti-scam 3: Payment and resolution verification for refunds
  IF p_status = 'refunded' THEN
    IF v_return.requested_resolution <> 'refund' THEN
      RAISE EXCEPTION 'Cannot issue refund on an exchange return';
    END IF;

    IF v_order.payment_status <> 'paid' AND v_order.financial_status <> 'paid' THEN
      RAISE EXCEPTION 'Cannot refund an order that was not verified as paid (current payment status: %)', v_order.payment_status;
    END IF;

    -- Calculate item-based refund total from order items if not explicitly provided
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_return.items) LOOP
      SELECT COALESCE(
        (oi->>'line_total')::numeric,
        (oi->>'unit_price')::numeric * (v_item->>'quantity')::integer,
        0
      ) INTO v_item_line_total
      FROM jsonb_array_elements(v_order.items) oi
      WHERE oi->>'id' = v_item->>'id'
      LIMIT 1;

      v_calc_refund := v_calc_refund + COALESCE(v_item_line_total, 0);
    END LOOP;

    -- Validate refund amount
    IF p_refund_amount IS NOT NULL THEN
      IF p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be greater than zero';
      END IF;
      IF p_refund_amount > v_order.total THEN
        RAISE EXCEPTION 'Refund amount cannot exceed the total order amount';
      END IF;
      v_calc_refund := p_refund_amount;
    END IF;
  END IF;

  -- Update return record with audit trail
  UPDATE public.order_returns SET
    status = p_status,
    admin_note = NULLIF(trim(p_admin_note), ''),
    refund_amount = CASE WHEN p_status = 'refunded' THEN v_calc_refund ELSE refund_amount END,
    refund_reference = CASE WHEN p_status = 'refunded' THEN NULLIF(trim(p_refund_reference), '') ELSE refund_reference END,
    refunded_at = CASE WHEN p_status = 'refunded' AND refunded_at IS NULL THEN timezone('utc', now()) ELSE refunded_at END,
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    updated_at = timezone('utc', now())
  WHERE id = p_return_id;

  -- Restock items if requested and not yet restocked
  IF p_restock AND v_return.restocked_at IS NULL THEN
    v_warehouse_id := v_order.fulfillment_warehouse_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_return.items) LOOP
      IF v_warehouse_id IS NOT NULL THEN
        INSERT INTO public.warehouse_inventory (warehouse_id, product_id, quantity)
        VALUES (v_warehouse_id, (v_item->>'id')::uuid, (v_item->>'quantity')::integer)
        ON CONFLICT (warehouse_id, product_id)
        DO UPDATE SET quantity = public.warehouse_inventory.quantity + EXCLUDED.quantity, updated_at = timezone('utc', now());

        INSERT INTO public.inventory_movements (warehouse_id, product_id, quantity_delta, movement_type, note, reference_id, created_by)
        VALUES (v_warehouse_id, (v_item->>'id')::uuid, (v_item->>'quantity')::integer, 'adjustment', 'إعادة مخزون من مرتجع معتمد', v_return.order_id, auth.uid());
      ELSE
        UPDATE public.products SET stock = stock + (v_item->>'quantity')::integer WHERE id = (v_item->>'id')::uuid;
      END IF;
    END LOOP;
    UPDATE public.order_returns SET restocked_at = timezone('utc', now()) WHERE id = p_return_id;
  END IF;

  -- Update order financial status
  IF p_status = 'refunded' THEN
    UPDATE public.orders
    SET payment_status = 'refunded',
        financial_status = 'refunded'
    WHERE id = v_return.order_id;
  END IF;

  RETURN p_status;
END;
$$;

ALTER FUNCTION public.review_order_return(uuid, text, text, boolean, numeric, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.review_order_return(uuid, text, text, boolean, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_order_return(uuid, text, text, boolean, numeric, text) TO authenticated, service_role;


-- 6. Update admin_list_order_returns to include payment status and audit info
DROP FUNCTION IF EXISTS public.admin_list_order_returns();
CREATE OR REPLACE FUNCTION public.admin_list_order_returns()
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, customer_name text, phone text, city text, state text,
  customer_id uuid, items jsonb, reason text, requested_resolution text, status text,
  customer_note text, admin_note text, restocked_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  order_payment_status text, order_payment_method text, order_total numeric,
  refund_amount numeric, refund_reference text, refunded_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN QUERY
  SELECT r.id, r.order_id, o.order_number, o.customer_name, o.phone, o.city, o.state,
         r.customer_id, r.items, r.reason, r.requested_resolution, r.status,
         r.customer_note, r.admin_note, r.restocked_at, r.reviewed_at, r.created_at, r.updated_at,
         o.payment_status AS order_payment_status,
         o.payment_method AS order_payment_method,
         o.total AS order_total,
         r.refund_amount,
         r.refund_reference,
         r.refunded_at
  FROM public.order_returns r
  JOIN public.orders o ON o.id = r.order_id
  ORDER BY r.created_at DESC;
END;
$$;

ALTER FUNCTION public.admin_list_order_returns() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_order_returns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_order_returns() TO authenticated, service_role;
