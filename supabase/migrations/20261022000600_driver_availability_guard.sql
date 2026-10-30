-- Phase 5 (§7b.6): a driver with a shipped order cannot go offline. The driver UI already blocks this; the
-- server enforces it too. Body carries the baseline logic (20260920000000_baseline.sql) unchanged otherwise.

CREATE OR REPLACE FUNCTION public.set_driver_availability(p_status text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_driver_id uuid;
BEGIN
  IF NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_status NOT IN ('active', 'offline') THEN RAISE EXCEPTION 'Unsupported availability status'; END IF;

  SELECT d.id INTO v_driver_id FROM public.drivers d WHERE d.user_id = auth.uid() FOR UPDATE;
  IF v_driver_id IS NULL THEN RAISE EXCEPTION 'Driver profile is not linked to this account'; END IF;

  IF p_status = 'offline' AND EXISTS (
    SELECT 1 FROM public.orders o WHERE o.driver_id = v_driver_id AND o.status = 'shipped'
  ) THEN
    RAISE EXCEPTION 'Finish or fail the active delivery before going offline';
  END IF;

  UPDATE public.drivers SET status = p_status, updated_at = timezone('utc', now()) WHERE id = v_driver_id;
  IF p_status = 'offline' THEN DELETE FROM public.driver_last_locations WHERE driver_id = v_driver_id; END IF;
  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.set_driver_availability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_driver_availability(text) TO authenticated, service_role;

-- DOWN (manual):
--   Restore set_driver_availability(p_status text) from 20260920000000_baseline.sql (without the shipped-order guard).
