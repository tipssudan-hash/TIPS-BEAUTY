-- 0014 Collections (T2-06): hand-picked and rule-based rows on the Storefront home page.
-- storefront_collections / storefront_collection_products / get_storefront_collections() already
-- exist (baseline). This migration:
--   - rewrites get_storefront_collections() so every rule honours rule_config.limit and only
--     sellable Products (is_active, stock > 0) are returned;
--   - adds the admin RPCs the Admin Portal writes through (the tables carry no INSERT/UPDATE/
--     DELETE grant for authenticated, by design): save, delete, atomic set-members, and a read
--     that includes hidden Collections and their hand-picked members.

-- Public read ------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_storefront_collections()
RETURNS TABLE(id uuid, slug text, name_ar text, description_ar text, icon text, display_order integer, product_ids uuid[])
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH sellable AS (
    SELECT p.id, p.created_at, p.category, COALESCE(p.discount_percentage, 0) AS discount_percentage,
           p.price * (1 - COALESCE(p.discount_percentage, 0) / 100) AS final_price
    FROM public.products p
    WHERE p.is_active AND COALESCE(p.stock, 0) > 0
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
        SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM (
          SELECT id, created_at FROM sellable ORDER BY created_at DESC LIMIT lim.n) s)
      WHEN 'best_sellers' THEN COALESCE((
        SELECT array_agg(s.id ORDER BY s.order_count DESC, s.latest_order DESC) FROM (
          SELECT s.id, sa.order_count, sa.latest_order FROM sellable s JOIN sales sa ON sa.product_id = s.id
          ORDER BY sa.order_count DESC, sa.latest_order DESC LIMIT lim.n) s),
        (SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM (
          SELECT id, created_at FROM sellable ORDER BY created_at DESC LIMIT lim.n) s))
      WHEN 'discount' THEN (
        SELECT array_agg(s.id ORDER BY s.discount_percentage DESC, s.created_at DESC) FROM (
          SELECT id, discount_percentage, created_at FROM sellable
          WHERE discount_percentage >= COALESCE((c.rule_config->>'minimum_discount')::numeric, 1)
          ORDER BY discount_percentage DESC, created_at DESC LIMIT lim.n) s)
      WHEN 'price_under' THEN (
        SELECT array_agg(s.id ORDER BY s.final_price, s.created_at DESC) FROM (
          SELECT id, final_price, created_at FROM sellable
          WHERE final_price <= COALESCE((c.rule_config->>'price')::numeric, 10000)
          ORDER BY final_price, created_at DESC LIMIT lim.n) s)
      WHEN 'category' THEN (
        SELECT array_agg(s.id ORDER BY s.created_at DESC) FROM (
          SELECT id, created_at FROM sellable WHERE category = c.rule_config->>'category'
          ORDER BY created_at DESC LIMIT lim.n) s)
    END, '{}'::uuid[]) AS product_ids
  FROM public.storefront_collections c
  CROSS JOIN LATERAL (SELECT GREATEST(1, LEAST(48, COALESCE((c.rule_config->>'limit')::integer, 12))) AS n) lim
  WHERE c.is_active
  ORDER BY c.display_order, c.created_at;
$$;

-- Admin read ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_collections()
RETURNS TABLE(id uuid, slug text, name_ar text, description_ar text, icon text, rule_type text, rule_config jsonb,
              display_order integer, is_active boolean, product_ids uuid[], updated_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT c.id, c.slug, c.name_ar, c.description_ar, c.icon, c.rule_type, c.rule_config, c.display_order, c.is_active,
    COALESCE((SELECT array_agg(m.product_id ORDER BY m.display_order) FROM public.storefront_collection_products m WHERE m.collection_id = c.id), '{}'::uuid[]),
    c.updated_at
  FROM public.storefront_collections c
  WHERE public.is_admin()
  ORDER BY c.display_order, c.created_at;
$$;

-- Admin writes -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_collection_products(p_collection_id uuid, p_product_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_missing integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.storefront_collections WHERE id = p_collection_id) THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;
  SELECT count(*) INTO v_missing FROM unnest(p_product_ids) AS t(product_id)
  WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = t.product_id);
  IF v_missing > 0 THEN RAISE EXCEPTION 'Product not found'; END IF;

  DELETE FROM public.storefront_collection_products WHERE collection_id = p_collection_id;
  INSERT INTO public.storefront_collection_products (collection_id, product_id, display_order)
  SELECT DISTINCT ON (t.product_id) p_collection_id, t.product_id, (t.ordinality - 1) * 10
  FROM unnest(p_product_ids) WITH ORDINALITY AS t(product_id, ordinality)
  ORDER BY t.product_id, t.ordinality;
  UPDATE public.storefront_collections SET updated_at = timezone('utc', now()) WHERE id = p_collection_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_save_collection(
  p_slug text, p_name_ar text, p_rule_type text,
  p_id uuid DEFAULT NULL, p_description_ar text DEFAULT NULL, p_icon text DEFAULT 'auto-awesome',
  p_rule_config jsonb DEFAULT '{}'::jsonb, p_display_order integer DEFAULT 100, p_is_active boolean DEFAULT true
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_config jsonb := COALESCE(p_rule_config, '{}'::jsonb);
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_name_ar IS NULL OR length(trim(p_name_ar)) = 0 THEN RAISE EXCEPTION 'Collection name is required'; END IF;
  IF p_slug IS NULL OR p_slug !~ '^[a-z0-9-]+$' THEN RAISE EXCEPTION 'Collection slug is invalid'; END IF;
  IF p_rule_type NOT IN ('manual', 'newest', 'best_sellers', 'discount', 'price_under', 'category') THEN
    RAISE EXCEPTION 'Collection rule is invalid';
  END IF;
  IF p_rule_type = 'price_under' AND COALESCE((v_config->>'price')::numeric, 0) <= 0 THEN
    RAISE EXCEPTION 'Collection rule needs a price ceiling';
  END IF;
  IF p_rule_type = 'category' AND length(trim(COALESCE(v_config->>'category', ''))) = 0 THEN
    RAISE EXCEPTION 'Collection rule needs a category';
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
    -- A rule-based Collection keeps no hand-picked members.
    IF p_rule_type <> 'manual' THEN DELETE FROM public.storefront_collection_products WHERE collection_id = v_id; END IF;
  END IF;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_collection(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  DELETE FROM public.storefront_collection_products WHERE collection_id = p_id;
  DELETE FROM public.storefront_collections WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Collection not found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_collections() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_collections() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_set_collection_products(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_collection_products(uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_save_collection(text, text, text, uuid, text, text, jsonb, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_collection(text, text, text, uuid, text, text, jsonb, integer, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.admin_delete_collection(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_collection(uuid) TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_delete_collection(uuid);
--   DROP FUNCTION public.admin_save_collection(text, text, text, uuid, text, text, jsonb, integer, boolean);
--   DROP FUNCTION public.admin_set_collection_products(uuid, uuid[]);
--   DROP FUNCTION public.admin_get_collections();
--   recreate get_storefront_collections() from the baseline migration.
