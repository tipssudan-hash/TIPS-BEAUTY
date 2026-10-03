-- GPS-06: warehouse_supervisor role + warehouse-scoped visibility.
-- Decision: supervisors see only their assigned warehouse's orders and inventory.
--
-- Nothing existing is dropped: every new policy has its own name (DROP POLICY IF EXISTS only
-- makes re-runs idempotent), and the profiles RLS policies are untouched, so a supervisor still
-- reads only their own profile through "Users can view own profile".

-- 1. profiles: new role value + the warehouse a supervisor manages ------------------------------
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role = ANY (ARRAY['customer'::text, 'admin'::text, 'driver'::text, 'warehouse_supervisor'::text]));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.profiles.assigned_warehouse_id IS 'For warehouse_supervisor role: the warehouse this supervisor manages. NULL for all other roles.';

-- 2. Role guard ------------------------------------------------------------------------------
-- The baseline trigger prevent_profile_role_change was replaced by prevent_profile_protected_change
-- (lockdown migration). It already lets administrators change `role` to any value the CHECK
-- allows, so warehouse_supervisor needs no change there. It does NOT cover the new column though,
-- and "Users can update own profile" lets a user write their own row: without this a supervisor
-- could re-point assigned_warehouse_id at another warehouse and read its orders. Same function,
-- same SECURITY INVOKER semantics, one extra protected column.
CREATE OR REPLACE FUNCTION public.prevent_profile_protected_change() RETURNS trigger
    LANGUAGE plpgsql SECURITY INVOKER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.email IS DISTINCT FROM OLD.email
     OR NEW.role IS DISTINCT FROM OLD.role
     OR NEW.assigned_warehouse_id IS DISTINCT FROM OLD.assigned_warehouse_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.beauty_points IS DISTINCT FROM OLD.beauty_points
     OR NEW.loyalty_lifetime_points IS DISTINCT FROM OLD.loyalty_lifetime_points
     OR NEW.loyalty_tier IS DISTINCT FROM OLD.loyalty_tier
     OR NEW.referral_code IS DISTINCT FROM OLD.referral_code
     OR NEW.referred_by IS DISTINCT FROM OLD.referred_by THEN
    RAISE EXCEPTION 'This profile field can only be changed by an administrator';
  END IF;
  RETURN NEW;
END;
$$;

-- 3. Helpers ---------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_warehouse_supervisor() RETURNS boolean
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = (SELECT auth.uid()) AND role = 'warehouse_supervisor'
  );
$$;
REVOKE ALL ON FUNCTION public.is_warehouse_supervisor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_warehouse_supervisor() TO authenticated, service_role;

-- Returns the warehouse_id assigned to the current supervisor (NULL if not a supervisor).
CREATE OR REPLACE FUNCTION public.my_warehouse_id() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT assigned_warehouse_id FROM public.profiles
  WHERE id = (SELECT auth.uid()) AND role = 'warehouse_supervisor';
$$;
REVOKE ALL ON FUNCTION public.my_warehouse_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_warehouse_id() TO authenticated, service_role;

-- 4. orders: warehouse-scoped access ---------------------------------------------------------
-- A NULL warehouse never matches (NULL = NULL is not true), so an unassigned supervisor sees nothing.
DROP POLICY IF EXISTS "Warehouse supervisors view own warehouse orders" ON public.orders;
CREATE POLICY "Warehouse supervisors view own warehouse orders"
  ON public.orders FOR SELECT TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND fulfillment_warehouse_id = public.my_warehouse_id()
  );

-- NOTE: `authenticated` holds only SELECT on public.orders (baseline grants), so this policy takes
-- effect only if UPDATE is ever granted. Order status changes today go through
-- admin_update_order_operation, which is admin-only. Granting UPDATE here would expose every
-- column (total, payment_status, ...), so it is deliberately left to a column-scoped follow-up.
DROP POLICY IF EXISTS "Warehouse supervisors update own warehouse orders" ON public.orders;
CREATE POLICY "Warehouse supervisors update own warehouse orders"
  ON public.orders FOR UPDATE TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND fulfillment_warehouse_id = public.my_warehouse_id()
  )
  WITH CHECK (
    public.is_warehouse_supervisor()
    AND fulfillment_warehouse_id = public.my_warehouse_id()
  );

-- 5. warehouse_inventory: warehouse-scoped access --------------------------------------------
DROP POLICY IF EXISTS "Warehouse supervisors view own warehouse inventory" ON public.warehouse_inventory;
CREATE POLICY "Warehouse supervisors view own warehouse inventory"
  ON public.warehouse_inventory FOR SELECT TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND warehouse_id = public.my_warehouse_id()
  );

DROP POLICY IF EXISTS "Warehouse supervisors update own warehouse inventory" ON public.warehouse_inventory;
CREATE POLICY "Warehouse supervisors update own warehouse inventory"
  ON public.warehouse_inventory FOR UPDATE TO authenticated
  USING (
    public.is_warehouse_supervisor()
    AND warehouse_id = public.my_warehouse_id()
  )
  WITH CHECK (
    public.is_warehouse_supervisor()
    AND warehouse_id = public.my_warehouse_id()
  );

-- 6. Admin-only assignment RPC ---------------------------------------------------------------
-- p_warehouse_id NULL removes the assignment and returns a supervisor to 'customer'.
-- Administrators and drivers are refused so this RPC can never demote or repurpose them.
CREATE OR REPLACE FUNCTION public.admin_set_warehouse_supervisor(
  p_user_id uuid,
  p_warehouse_id uuid  -- NULL to remove assignment
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found'; END IF;
  IF v_role IN ('admin', 'driver') THEN
    RAISE EXCEPTION 'Only customer or warehouse supervisor accounts can be assigned to a warehouse';
  END IF;

  IF p_warehouse_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id) THEN
    RAISE EXCEPTION 'Warehouse not found';
  END IF;

  UPDATE public.profiles
  SET role = CASE WHEN p_warehouse_id IS NOT NULL THEN 'warehouse_supervisor' ELSE 'customer' END,
      assigned_warehouse_id = p_warehouse_id
  WHERE id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_set_warehouse_supervisor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_warehouse_supervisor(uuid, uuid) TO authenticated, service_role;
