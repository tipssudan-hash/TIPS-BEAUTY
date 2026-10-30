-- Phase 4 (plan §7.2): promotion types. item_discount keeps its behaviour; buy_x_get_y, quantity_tier and
-- bundle are cart-level Promotions priced by evaluate_cart_promotions (20261021000200). Category and brand
-- targets carry both the id (hierarchical match) and the name (text match, kept in sync by 20261019000200).

ALTER TABLE public.promotions
  ADD COLUMN promotion_type text NOT NULL DEFAULT 'item_discount'
    CHECK (promotion_type IN ('item_discount', 'buy_x_get_y', 'quantity_tier', 'bundle')),
  ADD COLUMN buy_quantity integer CHECK (buy_quantity > 0),
  ADD COLUMN get_quantity integer CHECK (get_quantity > 0),
  ADD COLUMN get_discount_percent numeric(5,2) CHECK (get_discount_percent > 0 AND get_discount_percent <= 100),
  ADD COLUMN tiers jsonb,
  ADD COLUMN bundle_price numeric(12,2) CHECK (bundle_price > 0),
  ADD COLUMN max_applications_per_order integer CHECK (max_applications_per_order > 0),
  ADD COLUMN target_category_id uuid REFERENCES public.categories(id) ON DELETE RESTRICT,
  ADD COLUMN target_brand_id uuid REFERENCES public.brands(id) ON DELETE RESTRICT;

ALTER TABLE public.promotions ALTER COLUMN discount_type DROP NOT NULL, ALTER COLUMN discount_value DROP NOT NULL;

UPDATE public.promotions pr SET target_category_id = c.id
FROM public.categories c
WHERE pr.target_kind = 'category' AND lower(btrim(c.name_ar)) = lower(btrim(pr.target_value));

UPDATE public.promotions pr SET target_brand_id = b.id
FROM public.brands b
WHERE pr.target_kind = 'brand' AND lower(btrim(b.name_ar)) = lower(btrim(pr.target_value));

CREATE OR REPLACE FUNCTION public.promotion_tiers_valid(p_tiers jsonb) RETURNS boolean
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $$
DECLARE
  v_tier jsonb;
  v_min_quantity numeric;
  v_percent numeric;
  v_previous numeric := 0;
BEGIN
  IF jsonb_typeof(p_tiers) IS DISTINCT FROM 'array' OR jsonb_array_length(p_tiers) = 0 THEN RETURN false; END IF;
  FOR v_tier IN SELECT t.value FROM jsonb_array_elements(p_tiers) AS t(value) LOOP
    IF jsonb_typeof(v_tier) IS DISTINCT FROM 'object'
       OR jsonb_typeof(v_tier->'min_quantity') IS DISTINCT FROM 'number'
       OR jsonb_typeof(v_tier->'percent') IS DISTINCT FROM 'number' THEN
      RETURN false;
    END IF;
    v_min_quantity := (v_tier->>'min_quantity')::numeric;
    v_percent := (v_tier->>'percent')::numeric;
    IF v_min_quantity <> trunc(v_min_quantity) OR v_min_quantity < 2 OR v_min_quantity <= v_previous THEN RETURN false; END IF;
    IF v_percent <= 0 OR v_percent > 100 THEN RETURN false; END IF;
    v_previous := v_min_quantity;
  END LOOP;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.promotion_tiers_valid(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_tiers_valid(jsonb) TO service_role;

ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_type_shape CHECK (
    CASE promotion_type
      WHEN 'item_discount' THEN discount_type IS NOT NULL AND discount_value IS NOT NULL
        AND buy_quantity IS NULL AND get_quantity IS NULL AND get_discount_percent IS NULL AND tiers IS NULL AND bundle_price IS NULL
      WHEN 'buy_x_get_y' THEN discount_type IS NULL AND discount_value IS NULL
        AND buy_quantity IS NOT NULL AND get_quantity IS NOT NULL AND get_discount_percent IS NOT NULL AND tiers IS NULL AND bundle_price IS NULL
      WHEN 'quantity_tier' THEN discount_type IS NULL AND discount_value IS NULL
        AND public.promotion_tiers_valid(tiers) AND buy_quantity IS NULL AND get_quantity IS NULL AND get_discount_percent IS NULL AND bundle_price IS NULL
      WHEN 'bundle' THEN discount_type IS NULL AND discount_value IS NULL
        AND bundle_price IS NOT NULL AND target_kind = 'products'
        AND buy_quantity IS NULL AND get_quantity IS NULL AND get_discount_percent IS NULL AND tiers IS NULL
      ELSE false
    END),
  ADD CONSTRAINT promotions_target_ids_shape CHECK (
    (target_category_id IS NULL OR target_kind = 'category') AND (target_brand_id IS NULL OR target_kind = 'brand'));

CREATE TABLE public.promotion_bundle_items (
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (promotion_id, product_id)
);

-- Written only by admin_save_promotion (atomic with the Promotion row); staff may read it.
ALTER TABLE public.promotion_bundle_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promotion_bundle_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.promotion_bundle_items TO authenticated;
DROP POLICY IF EXISTS "Admins can read promotion bundle items" ON public.promotion_bundle_items;
CREATE POLICY "Admins can read promotion bundle items" ON public.promotion_bundle_items
  FOR SELECT TO authenticated USING (public.is_admin());

-- Target matching shared by effective_price, evaluate_cart_promotions and get_active_promotions.
-- A Category matches a Product in that Category or in the Category's parent (by id), or by name.
CREATE OR REPLACE FUNCTION public.promotion_matches_product(p_promotion_id uuid, p_product_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.promotions pr
    LEFT JOIN public.products p ON p.id = p_product_id
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE pr.id = p_promotion_id
      AND CASE pr.target_kind
            WHEN 'all' THEN true
            WHEN 'category' THEN (pr.target_category_id IS NOT NULL AND pr.target_category_id IN (p.category_id, c.parent_id))
                                  OR pr.target_value = p.category
            WHEN 'brand' THEN (pr.target_brand_id IS NOT NULL AND pr.target_brand_id = p.brand_id)
                              OR pr.target_value = p.brand
            WHEN 'products' THEN p_product_id = ANY (pr.target_product_ids)
            ELSE false
          END
  );
$$;

REVOKE ALL ON FUNCTION public.promotion_matches_product(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promotion_matches_product(uuid, uuid) TO service_role;

-- DOWN (manual):
--   DROP POLICY "Admins can read promotion bundle items" ON public.promotion_bundle_items;
--   DROP TABLE public.promotion_bundle_items;
--   DROP FUNCTION public.promotion_matches_product(uuid, uuid);
--   ALTER TABLE public.promotions DROP CONSTRAINT promotions_target_ids_shape, DROP CONSTRAINT promotions_type_shape;
--   DROP FUNCTION public.promotion_tiers_valid(jsonb);
--   ALTER TABLE public.promotions DROP COLUMN target_brand_id, DROP COLUMN target_category_id, DROP COLUMN max_applications_per_order,
--     DROP COLUMN bundle_price, DROP COLUMN tiers, DROP COLUMN get_discount_percent, DROP COLUMN get_quantity, DROP COLUMN buy_quantity,
--     DROP COLUMN promotion_type;
--   Rows with discount_type/discount_value NULL must be deleted before restoring NOT NULL on both columns.
--   ALTER TABLE public.promotions ALTER COLUMN discount_type SET NOT NULL, ALTER COLUMN discount_value SET NOT NULL;
