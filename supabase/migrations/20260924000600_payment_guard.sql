-- 0600 Payment Guard: prevent order completion without payment verification.
-- Credit customers are exempt from this check.

-- 1. Add credit customer flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_credit_customer boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.is_credit_customer
  IS 'Credit customers may receive delivered orders without upfront payment confirmation.';

-- 2. Add COD confirmation columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS cod_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS cod_collected_by uuid REFERENCES auth.users(id);

-- 3. RPC: Confirm COD cash collection (admin/driver marks cash received)
CREATE OR REPLACE FUNCTION public.confirm_cod_payment(
  p_order_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;

  IF v_order.payment_method <> 'COD' THEN
    RAISE EXCEPTION 'This order does not use cash on delivery';
  END IF;

  IF v_order.payment_status = 'paid' THEN
    RETURN;
  END IF;

  UPDATE public.orders
  SET payment_status = 'paid',
      financial_status = 'paid',
      cod_collected_at = timezone('utc', now()),
      cod_collected_by = auth.uid()
  WHERE id = p_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_cod_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_cod_payment(uuid) TO service_role;

-- 4. Recreate admin_update_order_operation with payment guard
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
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

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

-- DOWN (manual):
--   DROP FUNCTION public.confirm_cod_payment(uuid);
--   ALTER TABLE public.orders DROP COLUMN cod_collected_at, DROP COLUMN cod_collected_by;
--   ALTER TABLE public.profiles DROP COLUMN is_credit_customer;
--   Recreate admin_update_order_operation from migration 0002.
