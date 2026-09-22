-- 0022 Driver account linking (launch step 6).
-- A Driver signs up like any customer; staff then link the drivers row to that login. Two writes
-- have to happen together — drivers.user_id (admin policy already allows it) and profiles.role =
-- 'driver' (no admin UPDATE policy on other profiles, by design) — so one SECURITY DEFINER RPC does
-- both. Unlinking reverses it and takes the driver off the road. admin_get_drivers gives the Drivers
-- page the linked email and the last location time without exposing profiles or locations directly.

CREATE OR REPLACE FUNCTION public.admin_link_driver_user(p_driver_id uuid, p_email text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id uuid; v_role text; v_email text := lower(trim(coalesce(p_email, '')));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF v_email = '' THEN RAISE EXCEPTION 'Email is required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = p_driver_id) THEN RAISE EXCEPTION 'Driver not found'; END IF;
  SELECT p.id, p.role INTO v_user_id, v_role FROM public.profiles p WHERE lower(p.email) = v_email;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'No account with this email; the driver must sign up first'; END IF;
  IF v_role = 'admin' THEN RAISE EXCEPTION 'An administrator account cannot be a driver'; END IF;
  IF EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = v_user_id AND d.id <> p_driver_id) THEN RAISE EXCEPTION 'This account is already linked to another driver'; END IF;
  UPDATE public.profiles SET role = 'driver' WHERE id = v_user_id;
  UPDATE public.drivers SET user_id = v_user_id, updated_at = timezone('utc', now()) WHERE id = p_driver_id;
  RETURN v_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_unlink_driver_user(p_driver_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT user_id INTO v_user_id FROM public.drivers WHERE id = p_driver_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Driver not found'; END IF;
  IF v_user_id IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.orders o WHERE o.driver_id = p_driver_id AND o.status = 'shipped') THEN
    RAISE EXCEPTION 'This driver has a delivery in progress; complete it first';
  END IF;
  DELETE FROM public.driver_last_locations WHERE driver_id = p_driver_id;
  UPDATE public.drivers SET user_id = NULL, status = 'offline', updated_at = timezone('utc', now()) WHERE id = p_driver_id;
  UPDATE public.profiles SET role = 'customer' WHERE id = v_user_id AND role = 'driver';
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_drivers()
RETURNS TABLE(id uuid, name text, phone text, company text, status text, warehouse_id uuid, vehicle text, user_id uuid, user_email text, location_updated_at timestamp with time zone, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT d.id, d.name, d.phone, d.company, d.status, d.warehouse_id, d.vehicle, d.user_id, p.email, l.updated_at, d.created_at
  FROM public.drivers d
  LEFT JOIN public.profiles p ON p.id = d.user_id
  LEFT JOIN public.driver_last_locations l ON l.driver_id = d.id
  WHERE public.is_admin()
  ORDER BY d.created_at;
$$;

REVOKE ALL ON FUNCTION public.admin_link_driver_user(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_link_driver_user(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_unlink_driver_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unlink_driver_user(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_get_drivers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_drivers() TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_get_drivers();
--   DROP FUNCTION public.admin_unlink_driver_user(uuid);
--   DROP FUNCTION public.admin_link_driver_user(uuid, text);
