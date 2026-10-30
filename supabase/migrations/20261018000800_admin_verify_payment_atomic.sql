-- Payment verification and the order transition run in one transaction. The shared logic lives in
-- internal_* functions (service_role only); review_payment_proof() and admin_update_order_operation() keep
-- their public signatures and admin checks.

CREATE OR REPLACE FUNCTION public.internal_review_payment_proof(
  p_proof_id uuid,
  p_status text,
  p_review_note text
) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
BEGIN
  IF p_status NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Unsupported review status'; END IF;

  UPDATE public.payment_proofs
  SET status = p_status,
      reviewer_id = (SELECT auth.uid()),
      review_note = NULLIF(trim(p_review_note), ''),
      reviewed_at = timezone('utc', now())
  WHERE id = p_proof_id AND status = 'pending'
  RETURNING order_id INTO v_order_id;

  IF v_order_id IS NULL THEN RAISE EXCEPTION 'Payment proof is not pending'; END IF;

  UPDATE public.orders
  SET payment_status = CASE WHEN p_status = 'verified' THEN 'paid' ELSE 'pending' END,
      financial_status = CASE WHEN p_status = 'verified' THEN 'paid' ELSE financial_status END
  WHERE id = v_order_id;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_review_payment_proof(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_review_payment_proof(uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.review_payment_proof(
  p_proof_id uuid,
  p_status text,
  p_review_note text DEFAULT NULL::text
) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN public.internal_review_payment_proof(p_proof_id, p_status, p_review_note);
END;
$$;

REVOKE ALL ON FUNCTION public.review_payment_proof(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_payment_proof(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.internal_admin_update_order_operation(
  p_order_id uuid,
  p_expected_status text,
  p_status text DEFAULT NULL::text,
  p_driver_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text
) RETURNS TABLE(id uuid, status text, driver_id uuid, fulfillment_warehouse_id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_next_status text;
  v_next_driver uuid;
  v_next_warehouse uuid;
  v_driver_warehouse uuid;
  v_driver_status text;
  v_changed boolean := false;
  v_is_credit boolean := false;
BEGIN
  SELECT o.* INTO v_order FROM public.orders AS o WHERE o.id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF p_expected_status IS NOT NULL AND p_expected_status <> v_order.status THEN
    RAISE EXCEPTION 'This order was updated by another user; reload and try again';
  END IF;

  v_next_status := COALESCE(NULLIF(trim(p_status), ''), v_order.status);
  v_next_driver := COALESCE(p_driver_id, v_order.driver_id);
  v_next_warehouse := COALESCE(p_warehouse_id, v_order.fulfillment_warehouse_id);

  IF p_status IS NOT NULL AND p_status <> v_order.status THEN
    IF NOT (
      (v_order.status = 'new' AND v_next_status IN ('confirmed', 'cancelled')) OR
      (v_order.status = 'confirmed' AND v_next_status IN ('preparing', 'cancelled', 'shipped')) OR
      (v_order.status = 'preparing' AND v_next_status IN ('shipped', 'cancelled')) OR
      (v_order.status = 'shipped' AND v_next_status IN ('delivered', 'delivery_failed')) OR
      (v_order.status = 'delivery_failed' AND v_next_status IN ('confirmed', 'cancelled'))
    ) THEN RAISE EXCEPTION 'This status transition is not allowed'; END IF;

    -- PAYMENT GUARD: Block delivered status unless payment is confirmed
    IF v_next_status = 'delivered' AND v_order.payment_status <> 'paid' THEN
      -- Check if customer is a credit customer
      IF v_order.customer_id IS NOT NULL THEN
        SELECT p.is_credit_customer INTO v_is_credit
        FROM public.profiles AS p
        WHERE p.id = v_order.customer_id;
      END IF;

      IF NOT v_is_credit THEN
        RAISE EXCEPTION 'لا يمكن تسليم الطلب قبل تأكيد الدفع. يرجى تأكيد استلام المبلغ (نقداً أو تحويل) أولاً.';
      END IF;
    END IF;
  END IF;

  IF (p_driver_id IS NOT NULL AND p_driver_id IS DISTINCT FROM v_order.driver_id)
     OR (p_warehouse_id IS NOT NULL AND p_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id) THEN
    IF v_order.status NOT IN ('new', 'confirmed', 'preparing', 'delivery_failed') THEN
      RAISE EXCEPTION 'Assignments cannot change after delivery has started';
    END IF;
  END IF;

  IF p_warehouse_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.warehouses AS w WHERE w.id = p_warehouse_id AND w.is_active) THEN
    RAISE EXCEPTION 'Selected warehouse is not active';
  END IF;

  IF p_driver_id IS NOT NULL THEN
    SELECT d.warehouse_id, d.status INTO v_driver_warehouse, v_driver_status
    FROM public.drivers AS d WHERE d.id = p_driver_id FOR UPDATE;
    IF NOT FOUND OR v_driver_status NOT IN ('active', 'busy') THEN
      RAISE EXCEPTION 'Selected driver is not available';
    END IF;
    IF v_driver_warehouse IS NOT NULL AND v_next_warehouse IS NOT NULL AND v_driver_warehouse <> v_next_warehouse THEN
      RAISE EXCEPTION 'Selected driver is assigned to another warehouse';
    END IF;
  END IF;

  IF v_next_status = 'shipped' AND v_next_driver IS NULL THEN
    RAISE EXCEPTION 'Assign a driver before starting delivery';
  END IF;

  UPDATE public.orders AS o
  SET status = v_next_status,
      driver_id = v_next_driver,
      fulfillment_warehouse_id = v_next_warehouse
  WHERE o.id = v_order.id
  RETURNING
    o.status <> v_order.status
      OR o.driver_id IS DISTINCT FROM v_order.driver_id
      OR o.fulfillment_warehouse_id IS DISTINCT FROM v_order.fulfillment_warehouse_id,
    o.id, o.status, o.driver_id, o.fulfillment_warehouse_id, timezone('utc', now())
  INTO v_changed, id, status, driver_id, fulfillment_warehouse_id, updated_at;

  IF v_changed THEN
    INSERT INTO public.order_status_history(order_id, status, note, changed_by)
    VALUES (
      v_order.id, v_next_status,
      COALESCE(
        NULLIF(trim(p_note), ''),
        CASE WHEN v_next_status <> v_order.status
          THEN 'تم التحديث من لوحة الإدارة'
          ELSE 'تم تحديث تعيين التجهيز أو المندوب من لوحة الإدارة'
        END
      ),
      auth.uid()
    );
  END IF;

  IF v_next_status = 'cancelled' AND v_order.status <> 'cancelled' THEN
    PERFORM public.release_order_resources(v_order.id);
  END IF;

  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.internal_admin_update_order_operation(uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.internal_admin_update_order_operation(uuid, text, text, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_update_order_operation(
  p_order_id uuid,
  p_expected_status text,
  p_status text DEFAULT NULL::text,
  p_driver_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_note text DEFAULT NULL::text
) RETURNS TABLE(id uuid, status text, driver_id uuid, fulfillment_warehouse_id uuid, updated_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN QUERY
  SELECT * FROM public.internal_admin_update_order_operation(p_order_id, p_expected_status, p_status, p_driver_id, p_warehouse_id, p_note);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_order_operation(uuid, text, text, uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_order_operation(uuid, text, text, uuid, uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_verify_payment_and_advance(
  p_proof_id uuid,
  p_expected_status text,
  p_target_status text DEFAULT NULL,
  p_review_note text DEFAULT NULL,
  p_allow_duplicate_reference boolean DEFAULT false
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_proof public.payment_proofs%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_reference text;
  v_note text := NULLIF(trim(COALESCE(p_review_note, '')), '');
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_proof FROM public.payment_proofs WHERE id = p_proof_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment proof not found'; END IF;
  IF v_proof.status <> 'pending' THEN RAISE EXCEPTION 'Payment proof is not pending'; END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = v_proof.order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF p_expected_status IS NOT NULL AND p_expected_status <> v_order.status THEN
    RAISE EXCEPTION 'This order was updated by another user; reload and try again';
  END IF;

  v_reference := lower(NULLIF(trim(COALESCE(v_proof.transaction_reference, '')), ''));
  IF v_reference IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.payment_proofs p
    WHERE p.status = 'verified'
      AND p.order_id <> v_proof.order_id
      AND lower(trim(p.transaction_reference)) = v_reference
  ) THEN
    IF NOT p_allow_duplicate_reference THEN
      RAISE EXCEPTION 'This transaction reference is already verified on another order';
    END IF;
    IF v_note IS NULL THEN
      RAISE EXCEPTION 'A note is required to verify a duplicate transaction reference';
    END IF;
  END IF;

  PERFORM public.internal_review_payment_proof(p_proof_id, 'verified', v_note);

  IF p_target_status IS NOT NULL THEN
    PERFORM public.internal_admin_update_order_operation(v_proof.order_id, p_expected_status, p_target_status, NULL, NULL, NULL);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_verify_payment_and_advance(uuid, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_verify_payment_and_advance(uuid, text, text, text, boolean) TO authenticated, service_role;

-- DOWN (manual):
--   Restore review_payment_proof() (baseline body) and admin_update_order_operation() (20260924000600_payment_guard.sql body).
--   DROP FUNCTION public.admin_verify_payment_and_advance(uuid, text, text, text, boolean);
--   DROP FUNCTION public.internal_admin_update_order_operation(uuid, text, text, uuid, uuid, text);
--   DROP FUNCTION public.internal_review_payment_proof(uuid, text, text);
