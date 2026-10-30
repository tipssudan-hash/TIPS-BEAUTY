-- Phase 2 (plan §5.2): backfill categories and brands from the products text, keep the text and the
-- id columns in sync, and propagate renames to every text reference (banners, collections, promotions).

-- Backfill: one root row per distinct trimmed, case-insensitive value, most-used first.
WITH spelled AS (
  SELECT lower(btrim(category)) AS k, btrim(category) AS name, count(*) AS n
  FROM public.products
  WHERE category IS NOT NULL AND btrim(category) <> ''
  GROUP BY 1, 2
), ranked AS (
  SELECT DISTINCT ON (k) k, name, sum(n) OVER (PARTITION BY k) AS total
  FROM spelled
  ORDER BY k, n DESC, name
)
INSERT INTO public.categories (name_ar, sort_order, is_active)
SELECT name, ((row_number() OVER (ORDER BY total DESC, name)) - 1)::integer * 10, true
FROM ranked
ON CONFLICT DO NOTHING;

WITH spelled AS (
  SELECT lower(btrim(brand)) AS k, btrim(brand) AS name, count(*) AS n
  FROM public.products
  WHERE brand IS NOT NULL AND btrim(brand) <> ''
  GROUP BY 1, 2
), ranked AS (
  SELECT DISTINCT ON (k) k, name, sum(n) OVER (PARTITION BY k) AS total
  FROM spelled
  ORDER BY k, n DESC, name
)
INSERT INTO public.brands (name_ar, sort_order, is_active)
SELECT name, ((row_number() OVER (ORDER BY total DESC, name)) - 1)::integer * 10, true
FROM ranked
ON CONFLICT DO NOTHING;

UPDATE public.products p
SET category_id = c.id
FROM public.categories c
WHERE p.category_id IS NULL
  AND p.category IS NOT NULL AND btrim(p.category) <> ''
  AND lower(btrim(c.name_ar)) = lower(btrim(p.category));

UPDATE public.products p
SET brand_id = b.id
FROM public.brands b
WHERE p.brand_id IS NULL
  AND p.brand IS NOT NULL AND btrim(p.brand) <> ''
  AND lower(btrim(b.name_ar)) = lower(btrim(p.brand));

-- Sync: an id change sets the text from the row; otherwise a text change (old clients) resolves the
-- id by name, creating an active root row when the name is new. An empty text clears the id.
CREATE OR REPLACE FUNCTION public.products_sync_taxonomy_text() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_name text;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.category_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.category_id IS DISTINCT FROM OLD.category_id) THEN
    SELECT c.name_ar INTO v_name FROM public.categories c WHERE c.id = NEW.category_id;
    NEW.category := v_name;
  ELSIF (TG_OP = 'INSERT' AND NULLIF(btrim(NEW.category), '') IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.category IS DISTINCT FROM OLD.category) THEN
    v_name := NULLIF(btrim(NEW.category), '');
    IF v_name IS NULL THEN
      NEW.category_id := NULL;
    ELSE
      SELECT c.id INTO NEW.category_id FROM public.categories c WHERE lower(btrim(c.name_ar)) = lower(v_name);
      IF NOT FOUND THEN
        INSERT INTO public.categories (name_ar) VALUES (v_name) RETURNING id INTO NEW.category_id;
      END IF;
      SELECT c.name_ar INTO v_name FROM public.categories c WHERE c.id = NEW.category_id;
      NEW.category := v_name;
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' AND NEW.brand_id IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.brand_id IS DISTINCT FROM OLD.brand_id) THEN
    SELECT b.name_ar INTO v_name FROM public.brands b WHERE b.id = NEW.brand_id;
    NEW.brand := v_name;
  ELSIF (TG_OP = 'INSERT' AND NULLIF(btrim(NEW.brand), '') IS NOT NULL) OR (TG_OP = 'UPDATE' AND NEW.brand IS DISTINCT FROM OLD.brand) THEN
    v_name := NULLIF(btrim(NEW.brand), '');
    IF v_name IS NULL THEN
      NEW.brand_id := NULL;
    ELSE
      SELECT b.id INTO NEW.brand_id FROM public.brands b WHERE lower(btrim(b.name_ar)) = lower(v_name);
      IF NOT FOUND THEN
        INSERT INTO public.brands (name_ar) VALUES (v_name) RETURNING id INTO NEW.brand_id;
      END IF;
      SELECT b.name_ar INTO v_name FROM public.brands b WHERE b.id = NEW.brand_id;
      NEW.brand := v_name;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER products_sync_taxonomy_text
  BEFORE INSERT OR UPDATE OF category, brand, category_id, brand_id ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.products_sync_taxonomy_text();

-- Rename propagation: the text references that the storefront and the pricing engine match on by name.
CREATE OR REPLACE FUNCTION public.categories_propagate_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.products SET category = NEW.name_ar
  WHERE category_id = NEW.id AND category IS DISTINCT FROM NEW.name_ar;

  UPDATE public.storefront_banners SET action_value = NEW.name_ar
  WHERE action_type = 'category' AND action_value = OLD.name_ar;

  UPDATE public.storefront_collections SET rule_config = jsonb_set(rule_config, '{category}', to_jsonb(NEW.name_ar))
  WHERE rule_type = 'category'
    AND ((NULLIF(rule_config->>'category_id', '') IS NULL AND rule_config->>'category' = OLD.name_ar)
      OR rule_config->>'category_id' = NEW.id::text);

  UPDATE public.promotions SET target_value = NEW.name_ar
  WHERE target_kind = 'category' AND target_value = OLD.name_ar;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.brands_propagate_rename() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE public.products SET brand = NEW.name_ar
  WHERE brand_id = NEW.id AND brand IS DISTINCT FROM NEW.name_ar;

  UPDATE public.promotions SET target_value = NEW.name_ar
  WHERE target_kind = 'brand' AND target_value = OLD.name_ar;

  RETURN NULL;
END;
$$;

CREATE TRIGGER categories_propagate_rename
  AFTER UPDATE OF name_ar ON public.categories
  FOR EACH ROW WHEN (OLD.name_ar IS DISTINCT FROM NEW.name_ar)
  EXECUTE FUNCTION public.categories_propagate_rename();

CREATE TRIGGER brands_propagate_rename
  AFTER UPDATE OF name_ar ON public.brands
  FOR EACH ROW WHEN (OLD.name_ar IS DISTINCT FROM NEW.name_ar)
  EXECUTE FUNCTION public.brands_propagate_rename();

-- Trigger functions: EXECUTE is irrelevant when they fire (20260924000500), so nothing else needs it.
REVOKE ALL ON FUNCTION public.products_sync_taxonomy_text() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.products_sync_taxonomy_text() TO service_role;
REVOKE ALL ON FUNCTION public.categories_propagate_rename() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.categories_propagate_rename() TO service_role;
REVOKE ALL ON FUNCTION public.brands_propagate_rename() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.brands_propagate_rename() TO service_role;

-- DOWN (manual): drop the triggers first, then the functions; clearing the ids before deleting
-- the rows keeps products valid (products.category_id / brand_id are ON DELETE RESTRICT).
--   DROP TRIGGER brands_propagate_rename ON public.brands; DROP TRIGGER categories_propagate_rename ON public.categories;
--   DROP TRIGGER products_sync_taxonomy_text ON public.products;
--   DROP FUNCTION public.brands_propagate_rename(); DROP FUNCTION public.categories_propagate_rename();
--   DROP FUNCTION public.products_sync_taxonomy_text();
--   UPDATE public.products SET category_id = NULL, brand_id = NULL;
--   DELETE FROM public.categories WHERE parent_id IS NOT NULL; DELETE FROM public.categories;
--   DELETE FROM public.brands;
