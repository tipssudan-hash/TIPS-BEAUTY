-- 0018 Admin-only cleanup of tagged test Orders.
-- cleanupTestOrders (tests/backend/helpers.ts) cancels tagged Orders through the admin RPC and
-- then tried to DELETE them directly; the lockdown left authenticated with SELECT only on
-- orders, so the delete was a silent no-op and cancelled test Orders piled up (350+) until the
-- per-order cleanup loop outran the suite's hook timeout. This helper deletes cancelled Orders
-- tagged 'TEST-AUTOMATED' (mirrors TEST_TAG) in one call; dependants cascade, and the two
-- NO ACTION references (loyalty_ledger, checkout_idempotency) are unlinked first. Real Orders
-- can never match the tag filter.

CREATE OR REPLACE FUNCTION public.admin_delete_test_orders() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.loyalty_ledger SET order_id = NULL
  WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name = 'TEST-AUTOMATED' AND status = 'cancelled');
  DELETE FROM public.checkout_idempotency
  WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name = 'TEST-AUTOMATED' AND status = 'cancelled');
  DELETE FROM public.reviews
  WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name = 'TEST-AUTOMATED' AND status = 'cancelled');
  DELETE FROM public.orders WHERE customer_name = 'TEST-AUTOMATED' AND status = 'cancelled';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_test_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_test_orders() TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_delete_test_orders();
