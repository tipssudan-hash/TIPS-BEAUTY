-- 0024 Customer delivery view (launch step 8).
-- driver_last_locations is admin-only under RLS on purpose: a customer sees a driver's position
-- only through this function, only for their own Order, and only while it is out for delivery.
-- The driver's first name is shown; the phone number is returned solely to build the "Call
-- driver" action and is never rendered as text (owner decision).

CREATE OR REPLACE FUNCTION public.get_my_delivery(p_order_id uuid)
RETURNS TABLE(driver_name text, driver_phone text, latitude numeric, longitude numeric, accuracy_meters numeric, location_updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT split_part(trim(d.name), ' ', 1), d.phone, l.latitude, l.longitude, l.accuracy_meters, l.updated_at
  FROM public.orders o
  JOIN public.drivers d ON d.id = o.driver_id
  LEFT JOIN public.driver_last_locations l ON l.driver_id = d.id
  WHERE o.id = p_order_id
    AND o.customer_id = (SELECT auth.uid())
    AND o.status = 'shipped';
$$;

REVOKE ALL ON FUNCTION public.get_my_delivery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_delivery(uuid) TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.get_my_delivery(uuid);
