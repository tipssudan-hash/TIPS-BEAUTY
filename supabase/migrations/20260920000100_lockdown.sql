-- 0001 Lockdown
-- 1. New objects are private by default (previously GRANT ALL to anon/authenticated).
-- 2. Customers can no longer edit their own loyalty/referral/identity columns on profiles.
-- 3. cost_price is no longer readable by customers; admins read products through an RPC.

-- 1. Default privileges -------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.refresh_product_review_summary(uuid) FROM anon, authenticated;

-- 2. Profile column guard ------------------------------------------------------
DROP TRIGGER IF EXISTS profiles_prevent_role_change ON public.profiles;

-- SECURITY INVOKER on purpose: current_user is 'authenticated'/'anon' for direct
-- client writes but the definer owner for backend functions (checkout, loyalty),
-- which must keep working without being admins.
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

CREATE TRIGGER profiles_prevent_protected_change
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_protected_change();

DROP FUNCTION IF EXISTS public.prevent_profile_role_change();

-- 3. cost_price ------------------------------------------------------------------
REVOKE SELECT ON TABLE public.products FROM authenticated;
GRANT SELECT (
  id, name_ar, name_en, price, discount_percentage, category, brand, image, images,
  description, benefits, ingredients, usage, origin, expiry, stock, is_imported,
  skin_type, reviews_count, average_rating, created_at, variants
) ON TABLE public.products TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_products() RETURNS SETOF public.products
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.* FROM public.products p
  WHERE public.is_admin()
  ORDER BY p.created_at DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_product(p_product_id uuid) RETURNS SETOF public.products
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.* FROM public.products p
  WHERE public.is_admin() AND p.id = p_product_id;
$$;

REVOKE ALL ON FUNCTION public.get_admin_products() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_product(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_product(uuid) TO authenticated, service_role;

-- DOWN (manual):
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
--   DROP TRIGGER profiles_prevent_protected_change ON public.profiles; DROP FUNCTION public.prevent_profile_protected_change();
--   (recreate prevent_profile_role_change + trigger from the baseline migration)
--   GRANT SELECT ON TABLE public.products TO authenticated;
--   DROP FUNCTION public.get_admin_products(); DROP FUNCTION public.get_admin_product(uuid);
