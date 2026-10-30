-- Phase 2 (plan §5.1): categories and brands as catalogue entities. products.category / products.brand
-- stay as text for old clients; 20261019000200 keeps them in sync with the new id columns.

CREATE TABLE public.categories (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id  uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en    text,
  slug       text UNIQUE,
  image_url  text,
  icon       text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT categories_not_self_parent CHECK (parent_id IS DISTINCT FROM id)
);
CREATE UNIQUE INDEX categories_name_ar_unique ON public.categories (lower(btrim(name_ar)));
CREATE INDEX categories_parent_sort_idx ON public.categories (parent_id, sort_order);

CREATE TABLE public.brands (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar    text NOT NULL CHECK (btrim(name_ar) <> ''),
  name_en    text,
  slug       text UNIQUE,
  logo_url   text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now())
);
CREATE UNIQUE INDEX brands_name_ar_unique ON public.brands (lower(btrim(name_ar)));

ALTER TABLE public.products
  ADD COLUMN category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD COLUMN brand_id    uuid REFERENCES public.brands(id) ON DELETE RESTRICT;
CREATE INDEX products_category_id_idx ON public.products (category_id);
CREATE INDEX products_brand_id_idx ON public.products (brand_id);

-- Two levels only: a parent must be a root, and a category with children cannot become a child.
-- SECURITY DEFINER so the lookups see inactive rows regardless of the caller.
CREATE OR REPLACE FUNCTION public.categories_enforce_two_levels() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.parent_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.categories p WHERE p.id = NEW.parent_id AND p.parent_id IS NOT NULL) THEN
      RAISE EXCEPTION 'Categories support two levels only';
    END IF;
    IF TG_OP = 'UPDATE' AND EXISTS (SELECT 1 FROM public.categories c WHERE c.parent_id = NEW.id) THEN
      RAISE EXCEPTION 'Categories support two levels only';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER categories_enforce_two_levels
  BEFORE INSERT OR UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.categories_enforce_two_levels();

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  NEW.updated_at := timezone('utc', now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.brands
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL ON FUNCTION public.categories_enforce_two_levels() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.categories_enforce_two_levels() TO service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- Writes go through the admin RPCs (20261019000300); the tables take no direct writes.
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active categories" ON public.categories;
CREATE POLICY "Anyone can view active categories" ON public.categories
  FOR SELECT TO authenticated, anon
  USING (is_active OR public.is_admin());

DROP POLICY IF EXISTS "Anyone can view active brands" ON public.brands;
CREATE POLICY "Anyone can view active brands" ON public.brands
  FOR SELECT TO authenticated, anon
  USING (is_active OR public.is_admin());

REVOKE ALL ON TABLE public.categories, public.brands FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.categories, public.brands TO anon, authenticated;

-- The products lockdown (20260920000100 L52–57) grants authenticated explicit columns only.
-- anon has no products grant at all: catalogue reads go through SECURITY DEFINER RPCs.
GRANT SELECT (category_id, brand_id) ON TABLE public.products TO authenticated;

-- DOWN (manual): run after the DOWN sections of 20261019000300 and 20261019000200.
--   REVOKE SELECT (category_id, brand_id) ON TABLE public.products FROM authenticated;
--   ALTER TABLE public.products DROP COLUMN brand_id, DROP COLUMN category_id;
--   DROP TABLE public.brands; DROP TABLE public.categories;
--   DROP FUNCTION public.categories_enforce_two_levels(); DROP FUNCTION public.set_updated_at();
