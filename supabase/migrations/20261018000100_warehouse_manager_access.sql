-- Warehouse managers (profiles.role = 'warehouse_supervisor') can cover several warehouses.
-- profiles.assigned_warehouse_id keeps the primary warehouse for backward compatibility.

CREATE TABLE IF NOT EXISTS public.warehouse_manager_access (
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  is_primary   boolean NOT NULL DEFAULT false,
  granted_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at   timestamptz NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (user_id, warehouse_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS warehouse_manager_access_one_primary
  ON public.warehouse_manager_access (user_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS warehouse_manager_access_warehouse_idx
  ON public.warehouse_manager_access (warehouse_id);

ALTER TABLE public.warehouse_manager_access ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.warehouse_manager_access FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.warehouse_manager_access TO authenticated;
GRANT ALL ON public.warehouse_manager_access TO service_role;

DROP POLICY IF EXISTS "Admins view warehouse manager access" ON public.warehouse_manager_access;
CREATE POLICY "Admins view warehouse manager access"
  ON public.warehouse_manager_access FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Managers view own warehouse access" ON public.warehouse_manager_access;
CREATE POLICY "Managers view own warehouse access"
  ON public.warehouse_manager_access FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

INSERT INTO public.warehouse_manager_access (user_id, warehouse_id, is_primary)
SELECT p.id, p.assigned_warehouse_id, true
FROM public.profiles p
WHERE p.role = 'warehouse_supervisor' AND p.assigned_warehouse_id IS NOT NULL
ON CONFLICT (user_id, warehouse_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_warehouse_manager() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role = 'warehouse_supervisor'
  );
$$;
REVOKE ALL ON FUNCTION public.is_warehouse_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_warehouse_manager() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_warehouse_supervisor() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT public.is_warehouse_manager();
$$;
REVOKE ALL ON FUNCTION public.is_warehouse_supervisor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_warehouse_supervisor() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.my_warehouse_ids() RETURNS uuid[]
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE(array_agg(a.warehouse_id ORDER BY a.is_primary DESC, a.warehouse_id), '{}'::uuid[])
  FROM public.warehouse_manager_access a
  WHERE a.user_id = (SELECT auth.uid()) AND public.is_warehouse_manager();
$$;
REVOKE ALL ON FUNCTION public.my_warehouse_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_warehouse_ids() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.can_manage_warehouse(p_warehouse_id uuid) RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT p_warehouse_id IS NOT NULL AND (
    public.is_admin()
    OR (public.is_warehouse_manager() AND p_warehouse_id = ANY ((SELECT public.my_warehouse_ids())::uuid[]))
  );
$$;
REVOKE ALL ON FUNCTION public.can_manage_warehouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_warehouse(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_staff_context() RETURNS jsonb
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_role text;
  v_is_admin boolean;
  v_is_manager boolean;
  v_warehouses jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = v_uid;
  v_is_admin := public.is_admin();
  v_is_manager := public.is_warehouse_manager();

  IF v_is_admin THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'code', w.code, 'is_primary', false) ORDER BY w.name), '[]'::jsonb)
    INTO v_warehouses
    FROM public.warehouses w
    WHERE w.is_active;
  ELSIF v_is_manager THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'code', w.code, 'is_primary', a.is_primary) ORDER BY a.is_primary DESC, w.name), '[]'::jsonb)
    INTO v_warehouses
    FROM public.warehouse_manager_access a
    JOIN public.warehouses w ON w.id = a.warehouse_id
    WHERE a.user_id = v_uid;
  ELSE
    v_warehouses := '[]'::jsonb;
  END IF;

  RETURN jsonb_build_object(
    'role', v_role,
    'is_admin', v_is_admin,
    'is_warehouse_manager', v_is_manager,
    'warehouses', v_warehouses
  );
END;
$$;
REVOKE ALL ON FUNCTION public.get_my_staff_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_staff_context() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.driver_outstanding_cod(p_driver_id uuid) RETURNS numeric
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT COALESCE((
    SELECT SUM(o.total) FROM public.orders o
    WHERE o.driver_id = p_driver_id AND o.payment_method = 'COD' AND o.status = 'delivered'
  ), 0) - COALESCE((
    SELECT SUM(r.amount) FROM public.driver_cash_remittances r
    WHERE r.driver_id = p_driver_id AND r.status = 'confirmed'
  ), 0);
$$;
REVOKE ALL ON FUNCTION public.driver_outstanding_cod(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.driver_outstanding_cod(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_set_warehouse_manager_access(
  p_user_id uuid,
  p_warehouse_ids uuid[],
  p_primary_warehouse_id uuid DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_ids uuid[] := COALESCE(p_warehouse_ids, '{}'::uuid[]);
  v_primary uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT p.role INTO v_role FROM public.profiles p WHERE p.id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role IN ('admin', 'driver') THEN
    RAISE EXCEPTION 'Only customer or warehouse supervisor accounts can be assigned to a warehouse';
  END IF;

  IF cardinality(v_ids) = 0 THEN
    DELETE FROM public.warehouse_manager_access a WHERE a.user_id = p_user_id;
    UPDATE public.profiles p SET role = 'customer', assigned_warehouse_id = NULL WHERE p.id = p_user_id;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(warehouse_id)
    WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.id = t.warehouse_id)
  ) THEN
    RAISE EXCEPTION 'Warehouse not found';
  END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(v_ids) AS t(warehouse_id)
    JOIN public.warehouses w ON w.id = t.warehouse_id
    WHERE NOT w.is_active
  ) THEN
    RAISE EXCEPTION 'Selected warehouse is not active';
  END IF;

  v_primary := COALESCE(p_primary_warehouse_id, v_ids[1]);
  IF NOT (v_primary = ANY (v_ids)) THEN
    RAISE EXCEPTION 'Primary warehouse must be one of the assigned warehouses';
  END IF;

  UPDATE public.warehouse_manager_access a SET is_primary = false
  WHERE a.user_id = p_user_id AND a.is_primary;

  DELETE FROM public.warehouse_manager_access a
  WHERE a.user_id = p_user_id AND NOT (a.warehouse_id = ANY (v_ids));

  INSERT INTO public.warehouse_manager_access (user_id, warehouse_id, is_primary, granted_by)
  SELECT p_user_id, d.warehouse_id, d.warehouse_id = v_primary, auth.uid()
  FROM (SELECT DISTINCT t.warehouse_id FROM unnest(v_ids) AS t(warehouse_id)) d
  ON CONFLICT (user_id, warehouse_id) DO UPDATE SET is_primary = EXCLUDED.is_primary;

  UPDATE public.profiles p
  SET role = 'warehouse_supervisor', assigned_warehouse_id = v_primary
  WHERE p.id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_manager_access(uuid, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_manager_access(uuid, uuid[], uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_set_warehouse_supervisor(
  p_user_id uuid,
  p_warehouse_id uuid
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.admin_set_warehouse_manager_access(
    p_user_id,
    CASE WHEN p_warehouse_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[p_warehouse_id] END,
    p_warehouse_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_supervisor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_supervisor(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_list_warehouse_managers()
RETURNS TABLE(user_id uuid, full_name text, email text, phone text, warehouse_ids uuid[], primary_warehouse_id uuid)
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.email,
    p.phone,
    ARRAY(SELECT a.warehouse_id FROM public.warehouse_manager_access a WHERE a.user_id = p.id ORDER BY a.warehouse_id),
    (SELECT a.warehouse_id FROM public.warehouse_manager_access a WHERE a.user_id = p.id AND a.is_primary)
  FROM public.profiles p
  WHERE p.role = 'warehouse_supervisor'
  ORDER BY p.full_name NULLS LAST, p.email;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_list_warehouse_managers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_warehouse_managers() TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.admin_list_warehouse_managers();
--   DROP FUNCTION public.admin_set_warehouse_supervisor(uuid, uuid);
--   DROP FUNCTION public.admin_set_warehouse_manager_access(uuid, uuid[], uuid);
--   DROP FUNCTION public.driver_outstanding_cod(uuid);
--   DROP FUNCTION public.get_my_staff_context();
--   DROP FUNCTION public.can_manage_warehouse(uuid);
--   DROP FUNCTION public.my_warehouse_ids();
--   Restore is_warehouse_supervisor() to its GPS-06 body (20261001000800_gps06_warehouse_supervisor.sql), then DROP FUNCTION public.is_warehouse_manager();
--   DROP TABLE public.warehouse_manager_access;
--   Restore admin_set_warehouse_supervisor() to its GPS-06 body.
