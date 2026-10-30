-- Phase 2 (plan §5.3): admin and public RPCs for categories and brands, and the catalogue readers
-- that expose category_id / brand_id. Readers keep their bodies from 20260920001700 (catalogue) and
-- 20260920001400 (collections); the new columns are appended to the end of RETURNS TABLE.

-- Admin: categories --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_categories()
RETURNS TABLE(id uuid, parent_id uuid, name_ar text, name_en text, slug text, image_url text, icon text, sort_order integer, is_active boolean, product_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.id, c.parent_id, c.name_ar, c.name_en, c.slug, c.image_url, c.icon, c.sort_order, c.is_active,
         (SELECT count(*) FROM public.products p WHERE p.category_id = c.id)
  FROM public.categories c
  WHERE public.is_admin()
  ORDER BY c.sort_order, c.name_ar;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_category(
  p_name_ar text, p_id uuid DEFAULT NULL, p_parent_id uuid DEFAULT NULL, p_name_en text DEFAULT NULL, p_slug text DEFAULT NULL,
  p_image_url text DEFAULT NULL, p_icon text DEFAULT NULL, p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text := NULLIF(btrim(COALESCE(p_name_ar, '')), '');
  v_slug text := NULLIF(btrim(COALESCE(p_slug, '')), '');
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Category name is required'; END IF;
  IF v_slug IS NOT NULL AND v_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Category slug is invalid'; END IF;
  IF p_id IS NOT NULL AND p_id = p_parent_id THEN RAISE EXCEPTION 'Category cannot be its own parent'; END IF;
  IF EXISTS (SELECT 1 FROM public.categories c WHERE lower(btrim(c.name_ar)) = lower(v_name) AND c.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Category name already exists';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.categories (parent_id, name_ar, name_en, slug, image_url, icon, sort_order, is_active)
    VALUES (p_parent_id, v_name, NULLIF(btrim(COALESCE(p_name_en, '')), ''), v_slug,
            NULLIF(btrim(COALESCE(p_image_url, '')), ''), NULLIF(btrim(COALESCE(p_icon, '')), ''),
            COALESCE(p_sort_order, 0), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.categories SET
      parent_id = p_parent_id, name_ar = v_name, name_en = NULLIF(btrim(COALESCE(p_name_en, '')), ''), slug = v_slug,
      image_url = NULLIF(btrim(COALESCE(p_image_url, '')), ''), icon = NULLIF(btrim(COALESCE(p_icon, '')), ''),
      sort_order = COALESCE(p_sort_order, 0), is_active = COALESCE(p_is_active, true)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Category not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reorder_categories(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF COALESCE(cardinality(p_ids), 0) = 0 THEN RETURN; END IF;
  IF (SELECT count(DISTINCT t.id) FROM unnest(p_ids) AS t(id)) <> cardinality(p_ids) THEN RAISE EXCEPTION 'Category list has duplicates'; END IF;
  IF (SELECT count(*) FROM public.categories c WHERE c.id = ANY (p_ids)) <> cardinality(p_ids) THEN RAISE EXCEPTION 'Category not found'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.categories c
    WHERE c.id = ANY (p_ids)
      AND c.parent_id IS DISTINCT FROM (SELECT x.parent_id FROM public.categories x WHERE x.id = p_ids[1])
  ) THEN
    RAISE EXCEPTION 'Categories to reorder must share one parent';
  END IF;

  UPDATE public.categories c SET sort_order = t.pos
  FROM (SELECT u.id, ((u.ord - 1) * 10)::integer AS pos FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)) t
  WHERE c.id = t.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_category(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT c.name_ar INTO v_name FROM public.categories c WHERE c.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Category not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.categories c WHERE c.parent_id = p_id) THEN
    RAISE EXCEPTION 'Category has subcategories; deactivate it instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.category_id = p_id) THEN
    RAISE EXCEPTION 'Category has products; deactivate it instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.storefront_banners b WHERE b.action_type = 'category' AND b.action_value = v_name)
     OR EXISTS (
       SELECT 1 FROM public.storefront_collections s
       WHERE s.rule_type = 'category'
         AND ((s.rule_config->>'category_id' = p_id::text)
           OR (NULLIF(s.rule_config->>'category_id', '') IS NULL AND s.rule_config->>'category' = v_name)))
     OR EXISTS (SELECT 1 FROM public.promotions pr WHERE pr.target_kind = 'category' AND pr.target_value = v_name) THEN
    RAISE EXCEPTION 'Category is used by a banner, collection or promotion; deactivate it instead';
  END IF;
  DELETE FROM public.categories WHERE id = p_id;
END;
$$;

-- Admin: brands ------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_brands()
RETURNS TABLE(id uuid, name_ar text, name_en text, slug text, logo_url text, sort_order integer, is_active boolean, product_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT b.id, b.name_ar, b.name_en, b.slug, b.logo_url, b.sort_order, b.is_active,
         (SELECT count(*) FROM public.products p WHERE p.brand_id = b.id)
  FROM public.brands b
  WHERE public.is_admin()
  ORDER BY b.sort_order, b.name_ar;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_brand(
  p_name_ar text, p_id uuid DEFAULT NULL, p_name_en text DEFAULT NULL, p_slug text DEFAULT NULL, p_logo_url text DEFAULT NULL,
  p_sort_order integer DEFAULT 0, p_is_active boolean DEFAULT true
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text := NULLIF(btrim(COALESCE(p_name_ar, '')), '');
  v_slug text := NULLIF(btrim(COALESCE(p_slug, '')), '');
  v_id uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Brand name is required'; END IF;
  IF v_slug IS NOT NULL AND v_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Brand slug is invalid'; END IF;
  IF EXISTS (SELECT 1 FROM public.brands b WHERE lower(btrim(b.name_ar)) = lower(v_name) AND b.id IS DISTINCT FROM p_id) THEN
    RAISE EXCEPTION 'Brand name already exists';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.brands (name_ar, name_en, slug, logo_url, sort_order, is_active)
    VALUES (v_name, NULLIF(btrim(COALESCE(p_name_en, '')), ''), v_slug, NULLIF(btrim(COALESCE(p_logo_url, '')), ''),
            COALESCE(p_sort_order, 0), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.brands SET
      name_ar = v_name, name_en = NULLIF(btrim(COALESCE(p_name_en, '')), ''), slug = v_slug,
      logo_url = NULLIF(btrim(COALESCE(p_logo_url, '')), ''), sort_order = COALESCE(p_sort_order, 0), is_active = COALESCE(p_is_active, true)
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Brand not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reorder_brands(p_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF COALESCE(cardinality(p_ids), 0) = 0 THEN RETURN; END IF;
  IF (SELECT count(DISTINCT t.id) FROM unnest(p_ids) AS t(id)) <> cardinality(p_ids) THEN RAISE EXCEPTION 'Brand list has duplicates'; END IF;
  IF (SELECT count(*) FROM public.brands b WHERE b.id = ANY (p_ids)) <> cardinality(p_ids) THEN RAISE EXCEPTION 'Brand not found'; END IF;

  UPDATE public.brands b SET sort_order = t.pos
  FROM (SELECT u.id, ((u.ord - 1) * 10)::integer AS pos FROM unnest(p_ids) WITH ORDINALITY AS u(id, ord)) t
  WHERE b.id = t.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_brand(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  SELECT b.name_ar INTO v_name FROM public.brands b WHERE b.id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Brand not found'; END IF;
  IF EXISTS (SELECT 1 FROM public.products p WHERE p.brand_id = p_id) THEN
    RAISE EXCEPTION 'Brand has products; deactivate it instead';
  END IF;
  IF EXISTS (SELECT 1 FROM public.promotions pr WHERE pr.target_kind = 'brand' AND pr.target_value = v_name) THEN
    RAISE EXCEPTION 'Brand is used by a promotion; deactivate it instead';
  END IF;
  DELETE FROM public.brands WHERE id = p_id;
END;
$$;

-- Public -------------------------------------------------------------------------------------------
-- product_count: active Products in the Category and in its active subcategories.
CREATE OR REPLACE FUNCTION public.get_public_categories()
RETURNS TABLE(id uuid, parent_id uuid, name_ar text, name_en text, slug text, image_url text, icon text, sort_order integer, product_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.id, c.parent_id, c.name_ar, c.name_en, c.slug, c.image_url, c.icon, c.sort_order,
         (SELECT count(*) FROM public.products p
          WHERE p.is_active
            AND (p.category_id = c.id
                 OR p.category_id IN (SELECT ch.id FROM public.categories ch WHERE ch.parent_id = c.id AND ch.is_active)))
  FROM public.categories c
  WHERE c.is_active
  ORDER BY c.sort_order, c.name_ar;
$$;

CREATE OR REPLACE FUNCTION public.get_public_brands()
RETURNS TABLE(id uuid, name_ar text, name_en text, slug text, logo_url text, sort_order integer, product_count bigint)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT b.id, b.name_ar, b.name_en, b.slug, b.logo_url, b.sort_order,
         (SELECT count(*) FROM public.products p WHERE p.is_active AND p.brand_id = b.id)
  FROM public.brands b
  WHERE b.is_active
  ORDER BY b.sort_order, b.name_ar;
$$;

-- Readers ------------------------------------------------------------------------------------------
-- Same bodies as 20260920001700_variants.sql; category_id and brand_id are appended.
DROP FUNCTION IF EXISTS public.get_public_products();
CREATE FUNCTION public.get_public_products() RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text, category_id uuid, brand_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at,
         public.public_variants(p.id, p.variants, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand),
         ep.effective_price, ep.rule_kind, ep.rule_label, p.category_id, p.brand_id
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.is_active
  ORDER BY p.created_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_public_products() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_products() TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_public_product(uuid);
CREATE FUNCTION public.get_public_product(p_product_id uuid) RETURNS TABLE(id uuid, name_ar text, name_en text, price numeric, discount_percentage numeric, category text, brand text, image text, images text[], description text, benefits text[], ingredients text[], usage text, origin text, expiry text, stock integer, is_imported boolean, skin_type text[], reviews_count integer, average_rating numeric, created_at timestamp with time zone, variants jsonb, effective_price numeric, pricing_rule_kind text, pricing_rule_label text, category_id uuid, brand_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.name_ar, p.name_en, p.price, p.discount_percentage,
         p.category, p.brand, p.image, p.images, p.description,
         p.benefits, p.ingredients, p.usage, p.origin, p.expiry,
         GREATEST(COALESCE(p.stock, 0), 0), p.is_imported, p.skin_type,
         p.reviews_count, p.average_rating, p.created_at,
         public.public_variants(p.id, p.variants, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand),
         ep.effective_price, ep.rule_kind, ep.rule_label, p.category_id, p.brand_id
  FROM public.products p
  CROSS JOIN LATERAL public.effective_price(p.id, p.price, COALESCE(p.discount_percentage, 0), p.category, p.brand) ep
  WHERE p.id = p_product_id AND p.is_active;
$$;

REVOKE ALL ON FUNCTION public.get_public_product(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_product(uuid) TO anon, authenticated, service_role;

-- Same body as 20260920001400_collections.sql; a 'category' rule matches rule_config.category_id
-- (its Products and the Products of its subcategories) and falls back to the text rule_config.category.
CREATE OR REPLACE FUNCTION public.get_storefront_collections()
RETURNS TABLE(id uuid, slug text, name_ar text, description_ar text, icon text, display_order integer, product_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH sellable AS (
    SELECT p.id, p.created_at, p.category, p.category_id, COALESCE(p.discount_percentage, 0) AS discount_percentage,
           p.price * (1 - COALESCE(p.discount_percentage, 0) / 100) AS final_price
    FROM public.products p
    WHERE p.is_active AND COALESCE(p.stock, 0) > 0
  ),
  newest AS (
    SELECT id, created_at FROM sellable ORDER BY created_at DESC
  ),
  sales AS (
    SELECT (item->>'id')::uuid AS product_id, count(*) AS order_count, max(o.created_at) AS latest_order
    FROM public.orders o
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) item
    WHERE o.status IN ('confirmed', 'preparing', 'shipped', 'delivered')
    GROUP BY 1
  )
  SELECT c.id, c.slug, c.name_ar, c.description_ar, c.icon, c.display_order,
    COALESCE(CASE c.rule_type
      WHEN 'manual' THEN (
        SELECT array_agg(m.product_id ORDER BY m.display_order)
        FROM public.storefront_collection_products m JOIN sellable s ON s.id = m.product_id
        WHERE m.collection_id = c.id)
      WHEN 'newest' THEN (
        SELECT array_agg(n.id ORDER BY n.created_at DESC) FROM (SELECT id, created_at FROM newest LIMIT lim.n) n)
      WHEN 'best_sellers' THEN COALESCE((
        SELECT array_agg(b.id ORDER BY b.order_count DESC, b.latest_order DESC) FROM (
          SELECT se.id, sa.order_count, sa.latest_order FROM sellable se JOIN sales sa ON sa.product_id = se.id
          ORDER BY sa.order_count DESC, sa.latest_order DESC LIMIT lim.n) b),
        -- No sales yet: fall back to the newest sellable Products.
        (SELECT array_agg(n.id ORDER BY n.created_at DESC) FROM (SELECT id, created_at FROM newest LIMIT lim.n) n))
      WHEN 'discount' THEN (
        SELECT array_agg(s.id ORDER BY s.discount_percentage DESC, s.created_at DESC) FROM (
          SELECT id, discount_percentage, created_at FROM sellable
          WHERE discount_percentage >= COALESCE((c.rule_config->>'minimum_discount')::numeric, 1)
          ORDER BY discount_percentage DESC, created_at DESC LIMIT lim.n) s)
      WHEN 'price_under' THEN (
        SELECT array_agg(s.id ORDER BY s.final_price, s.created_at DESC) FROM (
          SELECT id, final_price, created_at FROM sellable
          WHERE final_price <= (c.rule_config->>'price')::numeric
          ORDER BY final_price, created_at DESC LIMIT lim.n) s)
      WHEN 'category' THEN (
        SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM (
          SELECT id, created_at FROM sellable
          WHERE CASE
            WHEN NULLIF(c.rule_config->>'category_id', '') IS NULL THEN category = c.rule_config->>'category'
            ELSE category_id IN (
              SELECT cat.id FROM public.categories cat
              WHERE cat.id = (c.rule_config->>'category_id')::uuid OR cat.parent_id = (c.rule_config->>'category_id')::uuid)
          END
          ORDER BY created_at DESC LIMIT lim.n) s)
    END, '{}'::uuid[]) AS product_ids
  FROM public.storefront_collections c
  CROSS JOIN LATERAL (SELECT GREATEST(1, LEAST(48, COALESCE((c.rule_config->>'limit')::integer, 12))) AS n) lim
  WHERE c.is_active
  ORDER BY c.display_order, c.created_at;
$$;

-- Same body as 20260920001400_collections.sql; a 'category' rule accepts rule_config.category_id and
-- stores its name in rule_config.category so the text fallback and the rename propagation stay valid.
CREATE OR REPLACE FUNCTION public.admin_save_collection(
  p_slug text, p_name_ar text, p_rule_type text,
  p_id uuid DEFAULT NULL, p_description_ar text DEFAULT NULL, p_icon text DEFAULT 'auto-awesome',
  p_rule_config jsonb DEFAULT '{}'::jsonb, p_display_order integer DEFAULT 100, p_is_active boolean DEFAULT true,
  p_product_ids uuid[] DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_config jsonb := COALESCE(p_rule_config, '{}'::jsonb);
  v_category_name text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_name_ar IS NULL OR length(trim(p_name_ar)) = 0 THEN RAISE EXCEPTION 'Collection name is required'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Collection slug is invalid'; END IF;
  IF p_rule_type NOT IN ('manual', 'newest', 'best_sellers', 'discount', 'price_under', 'category') THEN
    RAISE EXCEPTION 'Collection rule is invalid';
  END IF;
  -- Names the Storefront can draw (src/lib/collectionIcons.tsx).
  IF COALESCE(NULLIF(trim(p_icon), ''), 'auto-awesome') NOT IN ('auto-awesome', 'star', 'tag', 'gift', 'flame', 'heart', 'leaf') THEN
    RAISE EXCEPTION 'Collection icon is invalid';
  END IF;
  IF p_rule_type = 'price_under' AND COALESCE((v_config->>'price')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'Collection rule needs a price ceiling';
  END IF;
  IF p_rule_type = 'category' THEN
    IF NULLIF(btrim(COALESCE(v_config->>'category_id', '')), '') IS NOT NULL THEN
      SELECT c.name_ar INTO v_category_name FROM public.categories c WHERE c.id = (v_config->>'category_id')::uuid;
      IF NOT FOUND THEN RAISE EXCEPTION 'Collection category not found'; END IF;
      v_config := jsonb_set(v_config, '{category}', to_jsonb(v_category_name));
    ELSIF length(trim(COALESCE(v_config->>'category', ''))) = 0 THEN
      RAISE EXCEPTION 'Collection rule needs a category';
    END IF;
  END IF;
  IF p_rule_type = 'manual' THEN v_config := '{}'::jsonb; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.storefront_collections (slug, name_ar, description_ar, icon, rule_type, rule_config, display_order, is_active)
    VALUES (p_slug, trim(p_name_ar), NULLIF(trim(COALESCE(p_description_ar, '')), ''), COALESCE(NULLIF(trim(p_icon), ''), 'auto-awesome'),
            p_rule_type, v_config, COALESCE(p_display_order, 100), COALESCE(p_is_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.storefront_collections SET
      slug = p_slug, name_ar = trim(p_name_ar), description_ar = NULLIF(trim(COALESCE(p_description_ar, '')), ''),
      icon = COALESCE(NULLIF(trim(p_icon), ''), 'auto-awesome'), rule_type = p_rule_type, rule_config = v_config,
      display_order = COALESCE(p_display_order, 100), is_active = COALESCE(p_is_active, true), updated_at = timezone('utc', now())
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Collection not found'; END IF;
  END IF;
  -- A rule-based Collection keeps no hand-picked members; a hand-picked one may set them in the
  -- same transaction so a failed save never leaves a half-created row.
  IF p_rule_type <> 'manual' THEN
    DELETE FROM public.storefront_collection_products WHERE collection_id = v_id;
  ELSIF p_product_ids IS NOT NULL THEN
    PERFORM public.admin_set_collection_products(v_id, p_product_ids);
  END IF;
  RETURN v_id;
END;
$$;

-- Grants -------------------------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.admin_get_categories() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_categories() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_category(text, uuid, uuid, text, text, text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_category(text, uuid, uuid, text, text, text, text, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reorder_categories(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_categories(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_category(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_category(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_get_brands() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_brands() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_brand(text, uuid, text, text, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_brand(text, uuid, text, text, text, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_reorder_brands(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reorder_brands(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_brand(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_brand(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_public_categories() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_categories() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_public_brands() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_brands() TO anon, authenticated, service_role;

-- DOWN (manual): recreate get_public_products() / get_public_product(uuid) from 20260920001700 (L100–137),
-- recreate get_storefront_collections() and admin_save_collection() from 20260920001400 (L11–65, L107–160),
-- then drop the new RPCs:
--   DROP FUNCTION public.get_public_brands(); DROP FUNCTION public.get_public_categories();
--   DROP FUNCTION public.admin_delete_brand(uuid); DROP FUNCTION public.admin_reorder_brands(uuid[]);
--   DROP FUNCTION public.admin_save_brand(text, uuid, text, text, text, integer, boolean); DROP FUNCTION public.admin_get_brands();
--   DROP FUNCTION public.admin_delete_category(uuid); DROP FUNCTION public.admin_reorder_categories(uuid[]);
--   DROP FUNCTION public.admin_save_category(text, uuid, uuid, text, text, text, text, integer, boolean);
--   DROP FUNCTION public.admin_get_categories();
