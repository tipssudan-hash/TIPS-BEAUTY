-- Server-verified delivery code. The code is issued when an order ships, stored only as a bcrypt hash,
-- and delivered to the customer through a notification. Enforcement is controlled by app_settings.require_delivery_code.
-- update_driver_order_status() returns 'delivery_code_required', 'delivery_code_invalid' or 'delivery_code_locked'
-- instead of raising, because a raised exception would roll back the failed-attempt counter.

ALTER TABLE public.app_settings ADD COLUMN require_delivery_code boolean NOT NULL DEFAULT false;

CREATE TABLE public.order_delivery_codes (
  order_id        uuid PRIMARY KEY REFERENCES public.orders(id) ON DELETE CASCADE,
  code_hash       text NOT NULL,
  issued_at       timestamptz NOT NULL DEFAULT timezone('utc', now()),
  failed_attempts integer NOT NULL DEFAULT 0,
  verified_at     timestamptz,
  override_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  override_reason text
);

ALTER TABLE public.order_delivery_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.order_delivery_codes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.order_delivery_codes TO service_role;

CREATE OR REPLACE FUNCTION public.generate_delivery_code() RETURNS text
  LANGUAGE plpgsql VOLATILE
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_bytes bytea := extensions.gen_random_bytes(8);
  v_value numeric := 0;
  i integer;
BEGIN
  FOR i IN 0..7 LOOP
    v_value := v_value * 256 + get_byte(v_bytes, i);
  END LOOP;
  RETURN lpad(((trunc(v_value) % 1000000000000)::bigint)::text, 12, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.generate_delivery_code() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_delivery_code() TO service_role;

CREATE OR REPLACE FUNCTION public.customer_issue_delivery_code(p_order_id uuid) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_order public.orders%ROWTYPE;
  v_code text;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id AND o.customer_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF v_order.status NOT IN ('confirmed', 'preparing', 'shipped') THEN
    RAISE EXCEPTION 'A delivery code can only be issued for an active order';
  END IF;

  v_code := public.generate_delivery_code();

  INSERT INTO public.order_delivery_codes (order_id, code_hash, issued_at, failed_attempts, verified_at)
  VALUES (p_order_id, extensions.crypt(v_code, extensions.gen_salt('bf')), now(), 0, NULL)
  ON CONFLICT (order_id) DO UPDATE
    SET code_hash = EXCLUDED.code_hash,
        issued_at = EXCLUDED.issued_at,
        failed_attempts = 0,
        verified_at = NULL
    WHERE public.order_delivery_codes.issued_at <= now() - interval '60 seconds';
  IF NOT FOUND THEN RAISE EXCEPTION 'Please wait a minute before requesting a new delivery code'; END IF;

  RETURN v_code;
END;
$$;
REVOKE ALL ON FUNCTION public.customer_issue_delivery_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_issue_delivery_code(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.staff_override_delivery_code(p_order_id uuid, p_reason text) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason text := NULLIF(trim(COALESCE(p_reason, '')), '');
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'A reason is required to override the delivery code'; END IF;

  SELECT o.* INTO v_order FROM public.orders o WHERE o.id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found'; END IF;
  IF NOT (public.is_admin() OR public.can_manage_warehouse(v_order.fulfillment_warehouse_id)) THEN
    RAISE EXCEPTION 'Order is outside your warehouse scope';
  END IF;
  IF v_order.status IN ('delivered', 'cancelled') THEN
    RAISE EXCEPTION 'Delivery code override is not available for this order status';
  END IF;

  INSERT INTO public.order_delivery_codes (order_id, code_hash, override_by, override_reason)
  VALUES (p_order_id, extensions.crypt(public.generate_delivery_code(), extensions.gen_salt('bf')), auth.uid(), v_reason)
  ON CONFLICT (order_id) DO UPDATE
    SET override_by = EXCLUDED.override_by,
        override_reason = EXCLUDED.override_reason;

  INSERT INTO public.order_status_history (order_id, status, note, changed_by)
  VALUES (p_order_id, v_order.status, 'تجاوز رمز التسليم: ' || v_reason, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.staff_override_delivery_code(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.staff_override_delivery_code(uuid, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.update_driver_order_status(uuid, text, text, text);

CREATE FUNCTION public.update_driver_order_status(
  p_order_id uuid,
  p_status text,
  p_note text DEFAULT NULL,
  p_failure_reason text DEFAULT NULL,
  p_delivery_code text DEFAULT NULL
) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_driver_id uuid;
  v_note text;
  v_payment_method text;
  v_payment_status text;
  v_total numeric;
  v_customer_id uuid;
  v_order_number text;
  v_require_code boolean;
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

  SELECT COALESCE((SELECT s.require_delivery_code FROM public.app_settings s WHERE s.id = true), false)
  INTO v_require_code;

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

  UPDATE public.orders SET status = p_status
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

REVOKE ALL ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_driver_order_status(uuid, text, text, text, text) TO authenticated, service_role;

-- DOWN (manual):
--   Restore update_driver_order_status() (4 arguments) from 20261018000400_driver_cash_ledger.sql, then:
--   DROP FUNCTION public.staff_override_delivery_code(uuid, text);
--   DROP FUNCTION public.customer_issue_delivery_code(uuid);
--   DROP FUNCTION public.generate_delivery_code();
--   DROP TABLE public.order_delivery_codes;
--   ALTER TABLE public.app_settings DROP COLUMN require_delivery_code;
