-- T2-12: close the gaps between request_order_return and the spec (docs/specs/tier-2.md §Returns):
-- the Return Window (7 days from the delivered entry in status history) was never enforced, and
-- store_credit was accepted even though the spec says to reject it. Also adds the in-app
-- Customer Notification on approve/reject/refunded (existing queue_return_notification only
-- queues the external WhatsApp message, not a customer_notifications row for the bell/list page),
-- and an admin-only RPC to list Returns joined with their Order for the new Admin Returns page.
-- Ticket: GitHub #14.

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
  v_user_id uuid := auth.uid(); v_return_id uuid; v_order_items jsonb; v_item jsonb; v_allowed_quantity integer;
  v_delivered_at timestamptz;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_requested_resolution NOT IN ('refund', 'exchange') THEN RAISE EXCEPTION 'Unsupported return resolution'; END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN RAISE EXCEPTION 'Return reason is required'; END IF;
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN RAISE EXCEPTION 'At least one item is required'; END IF;

  SELECT items INTO v_order_items FROM public.orders
  WHERE id = p_order_id AND customer_id = v_user_id AND status = 'delivered'
  FOR UPDATE;
  IF v_order_items IS NULL THEN RAISE EXCEPTION 'Only delivered orders can be returned'; END IF;

  SELECT created_at INTO v_delivered_at FROM public.order_status_history
  WHERE order_id = p_order_id AND status = 'delivered'
  ORDER BY created_at DESC LIMIT 1;
  IF v_delivered_at IS NULL OR timezone('utc', now()) > v_delivered_at + interval '7 days' THEN
    RAISE EXCEPTION 'Return window has expired';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
    IF NULLIF(v_item->>'id', '') IS NULL OR COALESCE((v_item->>'quantity')::integer, 0) < 1 THEN RAISE EXCEPTION 'Invalid return item'; END IF;
    SELECT (purchased_item->>'quantity')::integer INTO v_allowed_quantity
    FROM jsonb_array_elements(v_order_items) purchased_item
    WHERE purchased_item->>'id' = v_item->>'id'
    LIMIT 1;
    IF v_allowed_quantity IS NULL OR (v_item->>'quantity')::integer > v_allowed_quantity THEN RAISE EXCEPTION 'Return items must match the delivered order'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.order_returns r, jsonb_array_elements(r.items) returned_item
      WHERE r.order_id = p_order_id
        AND r.status NOT IN ('rejected', 'closed')
        AND returned_item->>'id' = v_item->>'id'
    ) THEN RAISE EXCEPTION 'An active return already exists for one of these items'; END IF;
  END LOOP;

  INSERT INTO public.order_returns (order_id, customer_id, items, reason, requested_resolution, customer_note)
  VALUES (p_order_id, v_user_id, p_items, trim(p_reason), p_requested_resolution, NULLIF(trim(p_customer_note), ''))
  RETURNING id INTO v_return_id;
  RETURN v_return_id;
END;
$$;

-- In-app bell notification for a Return decision (spec item #57) — mirrors order_create_internal_notification's
-- shape. The existing queue_return_notification trigger only feeds the external WhatsApp queue.
CREATE OR REPLACE FUNCTION public.return_create_internal_notification() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_order_number text; v_type text; v_title text; v_body text;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('approved', 'rejected', 'refunded') THEN RETURN NEW; END IF;

  SELECT order_number INTO v_order_number FROM public.orders WHERE id = NEW.order_id;
  v_type := 'return_' || NEW.status;
  v_title := CASE NEW.status
    WHEN 'approved' THEN 'تمت الموافقة على طلب الإرجاع'
    WHEN 'rejected' THEN 'تم رفض طلب الإرجاع'
    ELSE 'تم استرداد المبلغ'
  END;
  v_body := CASE NEW.status
    WHEN 'approved' THEN 'تمت الموافقة على طلب إرجاع الطلب رقم ' || COALESCE(v_order_number, '') || '.'
    WHEN 'rejected' THEN 'تم رفض طلب إرجاع الطلب رقم ' || COALESCE(v_order_number, '') || CASE WHEN NEW.admin_note IS NOT NULL THEN ': ' || NEW.admin_note ELSE '.' END
    ELSE 'تم استرداد مبلغ الطلب رقم ' || COALESCE(v_order_number, '') || '.'
  END;

  PERFORM public.create_customer_notification(NEW.customer_id, v_type, v_title, v_body, NEW.order_id, NULL, jsonb_build_object('return_id', NEW.id, 'status', NEW.status, 'url', '/orders'));
  RETURN NEW;
END;
$$;

ALTER FUNCTION public.return_create_internal_notification() OWNER TO postgres;

CREATE OR REPLACE TRIGGER returns_create_internal_notifications
AFTER UPDATE OF status ON public.order_returns
FOR EACH ROW EXECUTE FUNCTION public.return_create_internal_notification();

REVOKE ALL ON FUNCTION public.return_create_internal_notification() FROM PUBLIC;
GRANT ALL ON FUNCTION public.return_create_internal_notification() TO service_role;

-- Admin Returns page reads through this rather than two round trips (Returns, then Orders by id) —
-- mirrors the admin_get_affiliates style of a joined, admin-gated read RPC.
CREATE OR REPLACE FUNCTION public.admin_list_order_returns()
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, customer_name text, phone text, city text, state text,
  customer_id uuid, items jsonb, reason text, requested_resolution text, status text,
  customer_note text, admin_note text, restocked_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN QUERY
  SELECT r.id, r.order_id, o.order_number, o.customer_name, o.phone, o.city, o.state,
         r.customer_id, r.items, r.reason, r.requested_resolution, r.status,
         r.customer_note, r.admin_note, r.restocked_at, r.reviewed_at, r.created_at, r.updated_at
  FROM public.order_returns r
  JOIN public.orders o ON o.id = r.order_id
  ORDER BY r.created_at DESC;
END;
$$;

ALTER FUNCTION public.admin_list_order_returns() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_list_order_returns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_order_returns() TO authenticated, service_role;

-- Test-only: backdates a TEST-AUTOMATED order's 'delivered' history row so the Return Window
-- boundary can be exercised without waiting 7 real days. Mirrors admin_backdate_test_order's
-- own customer_name guard.
CREATE OR REPLACE FUNCTION public.admin_backdate_test_order_status(p_order_id uuid, p_status text, p_created_at timestamp with time zone) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.order_status_history h SET created_at = p_created_at
  WHERE h.status = p_status
    AND h.id = (
      SELECT h2.id FROM public.order_status_history h2
      JOIN public.orders o ON o.id = h2.order_id
      WHERE h2.order_id = p_order_id AND h2.status = p_status AND o.customer_name = 'TEST-AUTOMATED'
      ORDER BY h2.created_at DESC LIMIT 1
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a test order status row'; END IF;
END;
$$;

ALTER FUNCTION public.admin_backdate_test_order_status(uuid, text, timestamptz) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.admin_backdate_test_order_status(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backdate_test_order_status(uuid, text, timestamptz) TO authenticated, service_role;

-- DOWN (manual):
--   DROP TRIGGER returns_create_internal_notifications ON public.order_returns;
--   DROP FUNCTION public.return_create_internal_notification();
--   DROP FUNCTION public.admin_list_order_returns();
--   DROP FUNCTION public.admin_backdate_test_order_status(uuid, text, timestamptz);
--   -- request_order_return: revert to the prior CREATE OR REPLACE (store_credit allowed, no window check).
