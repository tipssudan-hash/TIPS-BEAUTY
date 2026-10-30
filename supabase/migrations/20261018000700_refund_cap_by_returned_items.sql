-- A refund can no longer exceed the value of the returned items (plus shipping only for a full-order return)
-- or the order total minus refunds already issued. Refunds also reduce unpaid affiliate commissions.

CREATE OR REPLACE FUNCTION public.order_return_refund_caps(
  p_order_id uuid,
  p_return_id uuid,
  p_items jsonb
) RETURNS TABLE(items_value numeric, shipping_part numeric, refund_cap numeric)
  LANGUAGE plpgsql STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_item jsonb;
  v_line jsonb;
  v_qty integer;
  v_line_qty integer;
  v_line_total numeric;
  v_value numeric := 0;
  v_full boolean;
  v_prior_refunds numeric;
BEGIN
  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Associated order not found'; END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_qty := COALESCE((v_item->>'quantity')::integer, 0);

    SELECT oi.value INTO v_line
    FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) oi
    WHERE oi.value->>'id' = v_item->>'id'
    LIMIT 1;

    IF v_line IS NULL OR v_qty < 1 THEN RAISE EXCEPTION 'Return items must match the delivered order'; END IF;
    v_line_qty := COALESCE((v_line->>'quantity')::integer, 0);
    IF v_qty > v_line_qty THEN RAISE EXCEPTION 'Return items must match the delivered order'; END IF;

    v_line_total := (v_line->>'line_total')::numeric;
    IF v_line_total IS NOT NULL AND v_line_qty > 0 THEN
      v_value := v_value + CASE WHEN v_qty = v_line_qty THEN v_line_total
                                ELSE round(v_line_total / v_line_qty * v_qty, 2) END;
    ELSE
      v_value := v_value + round(COALESCE((v_line->>'effective_unit_price')::numeric, (v_line->>'unit_price')::numeric, 0) * v_qty, 2);
    END IF;
  END LOOP;

  v_full := NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(v_order.items, '[]'::jsonb)) oi
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) ri
      WHERE ri->>'id' = oi.value->>'id'
        AND (ri->>'quantity')::integer >= (oi.value->>'quantity')::integer
    )
  );

  SELECT COALESCE(SUM(r.refund_amount), 0) INTO v_prior_refunds
  FROM public.order_returns r
  WHERE r.order_id = p_order_id AND r.status = 'refunded' AND (p_return_id IS NULL OR r.id <> p_return_id);

  items_value := v_value;
  shipping_part := CASE WHEN v_full THEN COALESCE(v_order.shipping_fee, 0) ELSE 0 END;
  refund_cap := LEAST(v_value + shipping_part, GREATEST(COALESCE(v_order.total, 0) - v_prior_refunds, 0));
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.order_return_refund_caps(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_return_refund_caps(uuid, uuid, jsonb) TO service_role;

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
  v_refund_cap numeric := 0;
  v_calc_refund numeric := 0;
  v_base numeric;
  v_refunded_total numeric;
  v_new_amount numeric;
  v_comm public.affiliate_commissions%ROWTYPE;
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

    SELECT c.refund_cap INTO v_refund_cap
    FROM public.order_return_refund_caps(v_return.order_id, p_return_id, v_return.items) c;

    v_calc_refund := v_refund_cap;
    IF p_refund_amount IS NOT NULL THEN
      IF p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be greater than zero';
      END IF;
      v_calc_refund := round(p_refund_amount, 2);
    END IF;

    IF v_calc_refund > v_refund_cap THEN
      RAISE EXCEPTION 'Refund amount exceeds the refundable cap for this return (%)', v_refund_cap;
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

    v_base := GREATEST(COALESCE(v_order.total, 0) - COALESCE(v_order.shipping_fee, 0), 0);
    SELECT COALESCE(SUM(r.refund_amount), 0) INTO v_refunded_total
    FROM public.order_returns r
    WHERE r.order_id = v_return.order_id AND r.status = 'refunded';

    FOR v_comm IN
      SELECT * FROM public.affiliate_commissions c
      WHERE c.order_id = v_return.order_id AND c.status IN ('pending', 'approved', 'paid')
      FOR UPDATE
    LOOP
      IF v_comm.status = 'paid' OR v_comm.paid_amount > 0 THEN
        UPDATE public.affiliate_commissions
        SET review_note = concat_ws(' | ', NULLIF(v_comm.review_note, ''), 'مرتجع بعد صرف جزء من العمولة: يلزم مراجعة يدوية')
        WHERE id = v_comm.id;
      ELSE
        v_new_amount := LEAST(v_comm.commission_amount,
                              round(v_comm.commission_rate * GREATEST(v_base - v_refunded_total, 0) / 100, 2));
        UPDATE public.affiliate_commissions
        SET commission_amount = v_new_amount,
            status = CASE WHEN v_new_amount <= 0 THEN 'reversed' ELSE status END,
            review_note = concat_ws(' | ', NULLIF(v_comm.review_note, ''), 'خُفّضت العمولة بسبب مرتجع')
        WHERE id = v_comm.id;
      END IF;
    END LOOP;
  END IF;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.review_order_return(uuid, text, text, boolean, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_order_return(uuid, text, text, boolean, numeric, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_list_order_returns();
CREATE OR REPLACE FUNCTION public.admin_list_order_returns()
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, customer_name text, phone text, city text, state text,
  customer_id uuid, items jsonb, reason text, requested_resolution text, status text,
  customer_note text, admin_note text, restocked_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  order_payment_status text, order_payment_method text, order_total numeric,
  refund_amount numeric, refund_reference text, refunded_at timestamptz,
  returned_items_value numeric, refundable_cap numeric
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
         r.refunded_at,
         caps.items_value,
         caps.refund_cap
  FROM public.order_returns r
  JOIN public.orders o ON o.id = r.order_id
  CROSS JOIN LATERAL public.order_return_refund_caps(r.order_id, r.id, r.items) caps
  ORDER BY r.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_order_returns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_order_returns() TO authenticated, service_role;

-- DOWN (manual):
--   Restore review_order_return() from 20261017000100_fix_revenue_affiliate_and_refund_scams.sql (section 5).
--   DROP FUNCTION public.admin_list_order_returns(); then recreate it from 20261017000100 (section 6).
--   DROP FUNCTION public.order_return_refund_caps(uuid, uuid, jsonb);
