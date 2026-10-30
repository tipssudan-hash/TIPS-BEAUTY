-- Paginated public product reviews (§7c.6). p_limit NULL returns every published, verified review.
-- total_count is the number of matching reviews before LIMIT/OFFSET.

DROP FUNCTION IF EXISTS public.get_public_product_reviews(uuid);

CREATE FUNCTION public.get_public_product_reviews(
  p_product_id uuid,
  p_limit integer DEFAULT NULL,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid,
  rating integer,
  comment text,
  image_paths text[],
  reviewer_label text,
  created_at timestamptz,
  verified_purchase boolean,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT r.id,
         r.rating,
         COALESCE(r.comment, ''),
         COALESCE(r.image_paths, '{}'::text[]),
         COALESCE(NULLIF(r.user_name, ''), 'عميلة تيبس'),
         r.created_at,
         r.is_verified_purchase,
         count(*) OVER ()
  FROM public.reviews r
  WHERE r.product_id = p_product_id
    AND r.status = 'published'
    AND r.is_verified_purchase
  ORDER BY r.created_at DESC
  LIMIT p_limit
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$$;

ALTER FUNCTION public.get_public_product_reviews(uuid, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_public_product_reviews(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product_reviews(uuid, integer, integer) TO anon, authenticated, service_role;

-- DOWN (manual):
--   DROP FUNCTION public.get_public_product_reviews(uuid, integer, integer);
--   Recreate get_public_product_reviews(uuid) from 20260920000000_baseline.sql (L501–521, LIMIT 50),
--   then GRANT EXECUTE TO anon, authenticated, service_role.
