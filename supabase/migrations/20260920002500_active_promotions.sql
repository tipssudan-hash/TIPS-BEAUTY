-- 0025 Public offers (launch step 9).
-- 0019 took public reads off the promotions table; the Offers page needs a public view of what is
-- running now. Status is derived by promotion_status; the sample products per Promotion are resolved
-- here so the target rules live in one place (the same match effective_price uses).

CREATE OR REPLACE FUNCTION public.get_active_promotions()
RETURNS TABLE(id uuid, title text, description text, discount_type text, discount_value numeric, target_kind text, target_value text, start_date timestamp with time zone, end_date timestamp with time zone, product_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, pr.title, pr.description, pr.discount_type, pr.discount_value, pr.target_kind, pr.target_value, pr.start_date, pr.end_date,
         COALESCE((
           SELECT array_agg(p.id ORDER BY p.created_at DESC)
           FROM (
             SELECT p.id, p.created_at FROM public.products p
             WHERE p.is_active
               AND CASE pr.target_kind
                     WHEN 'all' THEN true
                     WHEN 'category' THEN p.category = pr.target_value
                     WHEN 'brand' THEN p.brand = pr.target_value
                     WHEN 'products' THEN p.id = ANY (pr.target_product_ids)
                     ELSE false
                   END
             ORDER BY p.created_at DESC
             LIMIT 8
           ) p
         ), '{}'::uuid[])
  FROM public.promotions pr
  WHERE public.promotion_status(pr.start_date, pr.end_date) = 'active'
  ORDER BY pr.discount_value DESC, pr.start_date DESC;
$$;

REVOKE ALL ON FUNCTION public.get_active_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_promotions() TO anon, authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.get_active_promotions();
