-- 0010 Anonymous visitors hit RLS policies that call is_admin() (delivery_zones, promotions,
-- storefront_banners). The function is safe for anon: it just returns false.
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;

-- DOWN: REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon;
