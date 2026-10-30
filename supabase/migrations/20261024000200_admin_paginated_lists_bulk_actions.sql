-- Server-side pagination for the admin product and return lists, plus admin-only bulk actions (§7d.2).
-- p_limit NULL returns every row, so existing callers keep working. total_count counts the rows that match
-- the search before LIMIT/OFFSET.

DROP FUNCTION IF EXISTS public.get_admin_products();

CREATE FUNCTION public.get_admin_products(
  p_limit   integer DEFAULT NULL,
  p_offset  integer DEFAULT 0,
  p_search  text DEFAULT NULL
) RETURNS TABLE(
  id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, cost_price numeric,
  category text, brand text, image text, images text[], description text, benefits text[], ingredients text[],
  usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[],
  reviews_count integer, average_rating numeric, created_at timestamptz, variants jsonb, is_active boolean,
  weight_grams integer, length_cm numeric, width_cm numeric, height_cm numeric, category_id uuid, brand_id uuid,
  average_cost numeric, average_cost_updated_at timestamptz, total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage, p.cost_price,
         p.category, p.brand, p.image, p.images, p.description, p.benefits, p.ingredients,
         p.usage, p.origin, p.expiry, p.stock, p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at, p.variants, p.is_active,
         p.weight_grams, p.length_cm, p.width_cm, p.height_cm, p.category_id, p.brand_id,
         p.average_cost, p.average_cost_updated_at,
         count(*) OVER () AS total_count
  FROM public.products p
  WHERE public.is_admin()
    AND (p_search IS NULL
         OR strpos(lower(p.name_ar), lower(p_search)) > 0
         OR strpos(lower(COALESCE(p.name_en, '')), lower(p_search)) > 0
         OR strpos(lower(COALESCE(p.brand, '')), lower(p_search)) > 0)
  ORDER BY p.created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

ALTER FUNCTION public.get_admin_products(integer, integer, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_admin_products(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_products(integer, integer, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_list_order_returns();

CREATE FUNCTION public.admin_list_order_returns(
  p_limit   integer DEFAULT NULL,
  p_offset  integer DEFAULT 0,
  p_search  text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, order_id uuid, order_number text, customer_name text, phone text, city text, state text,
  customer_id uuid, items jsonb, reason text, requested_resolution text, status text,
  customer_note text, admin_note text, restocked_at timestamptz, reviewed_at timestamptz,
  created_at timestamptz, updated_at timestamptz,
  order_payment_status text, order_payment_method text, order_total numeric,
  refund_amount numeric, refund_reference text, refunded_at timestamptz,
  returned_items_value numeric, refundable_cap numeric, total_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  RETURN QUERY
  SELECT r.id, r.order_id, o.order_number, o.customer_name, o.phone, o.city, o.state,
         r.customer_id, r.items, r.reason, r.requested_resolution, r.status,
         r.customer_note, r.admin_note, r.restocked_at, r.reviewed_at, r.created_at, r.updated_at,
         o.payment_status AS order_payment_status,
         o.payment_method AS order_payment_method,
         o.total AS order_total,
         r.refund_amount,
         r.refund_reference,
         r.refunded_at,
         caps.items_value,
         caps.refund_cap,
         count(*) OVER () AS total_count
  FROM public.order_returns r
  JOIN public.orders o ON o.id = r.order_id
  CROSS JOIN LATERAL public.order_return_refund_caps(r.order_id, r.id, r.items) caps
  WHERE p_search IS NULL
     OR strpos(lower(o.order_number), lower(p_search)) > 0
     OR strpos(lower(COALESCE(o.customer_name, '')), lower(p_search)) > 0
     OR strpos(COALESCE(o.phone, ''), p_search) > 0
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_order_returns(integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_order_returns(integer, integer, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_products_active(p_ids uuid[], p_is_active boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_is_active IS NULL THEN RAISE EXCEPTION 'is_active is required'; END IF;
  IF cardinality(COALESCE(p_ids, '{}'::uuid[])) > 500 THEN RAISE EXCEPTION 'At most 500 ids per bulk action'; END IF;

  UPDATE public.products SET is_active = p_is_active WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_review_status(p_ids uuid[], p_status text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_review_id uuid;
  v_count integer := 0;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_status NOT IN ('published', 'hidden') THEN RAISE EXCEPTION 'Unsupported review status.'; END IF;
  IF cardinality(COALESCE(p_ids, '{}'::uuid[])) > 500 THEN RAISE EXCEPTION 'At most 500 ids per bulk action'; END IF;

  FOR v_review_id IN SELECT r.id FROM public.reviews r WHERE r.id = ANY(p_ids) ORDER BY r.id LOOP
    PERFORM public.moderate_product_review(v_review_id, p_status, false);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_set_coupons_active(p_ids uuid[], p_is_active boolean) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_is_active IS NULL THEN RAISE EXCEPTION 'is_active is required'; END IF;
  IF cardinality(COALESCE(p_ids, '{}'::uuid[])) > 500 THEN RAISE EXCEPTION 'At most 500 ids per bulk action'; END IF;

  UPDATE public.coupons SET is_active = p_is_active WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_bulk_assign_category(p_ids uuid[], p_category_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF cardinality(COALESCE(p_ids, '{}'::uuid[])) > 500 THEN RAISE EXCEPTION 'At most 500 ids per bulk action'; END IF;
  IF p_category_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.categories c WHERE c.id = p_category_id) THEN
    RAISE EXCEPTION 'Category not found';
  END IF;

  UPDATE public.products SET category_id = p_category_id WHERE id = ANY(p_ids);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_bulk_set_products_active(uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bulk_set_review_status(uuid[], text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bulk_set_coupons_active(uuid[], boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_bulk_assign_category(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_products_active(uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_review_status(uuid[], text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_set_coupons_active(uuid[], boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_bulk_assign_category(uuid[], uuid) TO authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.admin_bulk_assign_category(uuid[], uuid);
--   DROP FUNCTION public.admin_bulk_set_coupons_active(uuid[], boolean);
--   DROP FUNCTION public.admin_bulk_set_review_status(uuid[], text);
--   DROP FUNCTION public.admin_bulk_set_products_active(uuid[], boolean);
--   DROP FUNCTION public.admin_list_order_returns(integer, integer, text);
--     then recreate admin_list_order_returns() from 20261018000700_refund_cap_by_returned_items.sql (section 6).
--   DROP FUNCTION public.get_admin_products(integer, integer, text);
--     then recreate get_admin_products() from 20260920000100_lockdown.sql (RETURNS SETOF public.products).
