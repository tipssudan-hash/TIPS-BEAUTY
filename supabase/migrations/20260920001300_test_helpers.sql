-- 0013 Admin-only helpers for the Order Expiry sweep test (T2-04).
-- cancel_stale_orders is service_role only, so the Vitest suite cannot drive it. These two
-- helpers keep that lockdown while letting an admin (a) backdate a tagged test Order — never a
-- real one — and (b) run the sweep with its default 48h rule ahead of the pg_cron schedule,
-- which is the same action the schedule performs every 15 minutes. The spec's alternative
-- (wait for the schedule window inside the test) was rejected: the cron interval is far longer
-- than the suite's 60s timeout, and a sweep an admin can only run with the default rule adds no
-- power an admin does not already have (cancelling `new` Orders one by one).
-- 'TEST-AUTOMATED' mirrors TEST_TAG in tests/backend/helpers.ts.

CREATE OR REPLACE FUNCTION public.admin_backdate_test_order(p_order_id uuid, p_created_at timestamp with time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.orders SET created_at = p_created_at
  WHERE id = p_order_id AND customer_name = 'TEST-AUTOMATED';
  IF NOT FOUND THEN RAISE EXCEPTION 'Not a test order'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_run_stale_order_sweep() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN public.cancel_stale_orders();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backdate_test_order(uuid, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_backdate_test_order(uuid, timestamp with time zone) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_run_stale_order_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_stale_order_sweep() TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_backdate_test_order(uuid, timestamp with time zone);
--   DROP FUNCTION public.admin_run_stale_order_sweep();
