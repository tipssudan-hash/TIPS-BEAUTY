-- 0019 Promotions engine (T2-10).
-- A Promotion is a scheduled percentage or fixed reduction that applies automatically to all
-- Products, a Category, a Brand or chosen Products. Its state (scheduled / active / expired) is
-- derived from the schedule, never stored: the hand-set status column goes, "end now" sets the end
-- date. effective_price (T2-07) matches Promotions per target kind; the largest single reduction
-- still wins and nothing stacks. Staff write Promotions only through the admin RPCs below; the
-- table takes no direct writes and no anonymous reads (the Storefront only sees the effective
-- price the catalogue RPCs return).

-- Shape ----------------------------------------------------------------------------------------

DROP POLICY IF EXISTS "Anyone can view active promotions" ON public.promotions;
ALTER TABLE public.promotions DROP COLUMN IF EXISTS status;
ALTER TABLE public.promotions DROP COLUMN IF EXISTS target_group;
ALTER TABLE public.promotions DROP COLUMN IF EXISTS usage_count;
ALTER TABLE public.promotions
  ADD COLUMN target_kind text NOT NULL DEFAULT 'all',
  ADD COLUMN target_value text,
  ADD COLUMN target_product_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE public.promotions ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.promotions ALTER COLUMN discount_type SET NOT NULL;
ALTER TABLE public.promotions ALTER COLUMN start_date SET NOT NULL;
ALTER TABLE public.promotions ALTER COLUMN start_date SET DEFAULT timezone('utc', now());
ALTER TABLE public.promotions
  ADD CONSTRAINT promotions_target_kind_check CHECK (target_kind IN ('all', 'category', 'brand', 'products')),
  ADD CONSTRAINT promotions_target_shape CHECK (
    CASE target_kind
      WHEN 'all' THEN target_value IS NULL AND cardinality(target_product_ids) = 0
      WHEN 'products' THEN target_value IS NULL AND cardinality(target_product_ids) > 0
      ELSE length(trim(coalesce(target_value, ''))) > 0 AND cardinality(target_product_ids) = 0
    END),
  ADD CONSTRAINT promotions_value_check CHECK (discount_value > 0 AND (discount_type <> 'percentage' OR discount_value <= 100)),
  ADD CONSTRAINT promotions_window_check CHECK (end_date IS NULL OR end_date > start_date);

CREATE INDEX IF NOT EXISTS promotions_window_idx ON public.promotions (start_date, end_date);

-- Writes go through the RPCs; reads stay under the admin policy ("Admins can manage promotions").
REVOKE ALL ON TABLE public.promotions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.promotions FROM authenticated;

-- The one definition of a Promotion's state.
CREATE OR REPLACE FUNCTION public.promotion_status(p_start_date timestamp with time zone, p_end_date timestamp with time zone) RETURNS text
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    WHEN p_start_date > now() THEN 'scheduled'
    WHEN p_end_date IS NOT NULL AND p_end_date <= now() THEN 'expired'
    ELSE 'active'
  END;
$$;
REVOKE ALL ON FUNCTION public.promotion_status(timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promotion_status(timestamp with time zone, timestamp with time zone) TO authenticated, service_role;

-- Pricing Rule ---------------------------------------------------------------------------------

-- effective_price: identical to 0015 except a Promotion matches by its target (all / category /
-- brand / chosen Products) and is active by its schedule alone.
CREATE OR REPLACE FUNCTION public.effective_price(
  p_product_id uuid, p_base_price numeric, p_discount_percentage numeric, p_category text, p_brand text
) RETURNS TABLE(effective_price numeric, reduction numeric, rule_kind text, rule_label text, promotion_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH base AS (SELECT GREATEST(COALESCE(p_base_price, 0), 0) AS price),
  discount AS (
    SELECT round(b.price * COALESCE(p_discount_percentage, 0) / 100, 2) AS reduction,
           'discount'::text AS kind, 'خصم ' || rtrim(rtrim(to_char(COALESCE(p_discount_percentage, 0), 'FM999990.99'), '0'), '.') || '%' AS label,
           NULL::uuid AS promotion_id
    FROM base b WHERE COALESCE(p_discount_percentage, 0) > 0
  ),
  promotion AS (
    SELECT LEAST(b.price, round(CASE WHEN pr.discount_type = 'fixed' THEN pr.discount_value ELSE b.price * pr.discount_value / 100 END, 2)) AS reduction,
           'promotion'::text AS kind, pr.title AS label, pr.id AS promotion_id
    FROM base b, public.promotions pr
    WHERE pr.start_date <= now()
      AND (pr.end_date IS NULL OR pr.end_date > now())
      AND pr.discount_value > 0
      AND CASE pr.target_kind
            WHEN 'all' THEN true
            WHEN 'category' THEN pr.target_value = p_category
            WHEN 'brand' THEN pr.target_value = p_brand
            WHEN 'products' THEN p_product_id = ANY (pr.target_product_ids)
            ELSE false
          END
    ORDER BY 1 DESC, pr.created_at
    LIMIT 1
  ),
  winner AS (
    -- Discount first so it wins a tie.
    SELECT * FROM (SELECT reduction, kind, label, promotion_id, 0 AS prio FROM discount
                   UNION ALL SELECT reduction, kind, label, promotion_id, 1 FROM promotion) w
    WHERE reduction > 0 ORDER BY reduction DESC, prio LIMIT 1
  )
  SELECT round(GREATEST(b.price - COALESCE(w.reduction, 0), 0), 2), COALESCE(w.reduction, 0), w.kind, w.label, w.promotion_id
  FROM base b LEFT JOIN winner w ON true;
$$;

REVOKE ALL ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.effective_price(uuid, numeric, numeric, text, text) TO service_role;

-- Admin ----------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_promotions()
RETURNS TABLE(id uuid, title text, description text, discount_type text, discount_value numeric, target_kind text, target_value text, target_product_ids uuid[], start_date timestamp with time zone, end_date timestamp with time zone, created_at timestamp with time zone, status text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT pr.id, pr.title, pr.description, pr.discount_type, pr.discount_value, pr.target_kind, pr.target_value, pr.target_product_ids,
         pr.start_date, pr.end_date, pr.created_at, public.promotion_status(pr.start_date, pr.end_date)
  FROM public.promotions pr
  WHERE public.is_admin()
  ORDER BY CASE public.promotion_status(pr.start_date, pr.end_date) WHEN 'active' THEN 0 WHEN 'scheduled' THEN 1 ELSE 2 END, pr.start_date DESC;
$$;
REVOKE ALL ON FUNCTION public.admin_get_promotions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_promotions() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_save_promotion(
  p_title text, p_discount_type text, p_discount_value numeric, p_target_kind text,
  p_id uuid DEFAULT NULL, p_description text DEFAULT NULL, p_target_value text DEFAULT NULL, p_target_product_ids uuid[] DEFAULT '{}',
  p_start_date timestamp with time zone DEFAULT NULL, p_end_date timestamp with time zone DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
  v_target_value text := NULLIF(trim(COALESCE(p_target_value, '')), '');
  v_products uuid[] := COALESCE(p_target_product_ids, '{}');
  v_start timestamp with time zone := COALESCE(p_start_date, timezone('utc', now()));
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN RAISE EXCEPTION 'Promotion title is required'; END IF;
  IF p_discount_type NOT IN ('percentage', 'fixed') THEN RAISE EXCEPTION 'Promotion type is invalid'; END IF;
  IF COALESCE(p_discount_value, 0) <= 0 OR (p_discount_type = 'percentage' AND p_discount_value > 100) THEN RAISE EXCEPTION 'Promotion value is invalid'; END IF;
  IF p_target_kind NOT IN ('all', 'category', 'brand', 'products') THEN RAISE EXCEPTION 'Promotion target is invalid'; END IF;
  IF p_target_kind IN ('category', 'brand') AND v_target_value IS NULL THEN RAISE EXCEPTION 'Promotion target value is required'; END IF;
  IF p_target_kind = 'products' AND cardinality(v_products) = 0 THEN RAISE EXCEPTION 'Promotion needs at least one product'; END IF;
  IF p_target_kind = 'products' AND EXISTS (SELECT 1 FROM unnest(v_products) pid WHERE NOT EXISTS (SELECT 1 FROM public.products p WHERE p.id = pid)) THEN RAISE EXCEPTION 'Promotion product not found'; END IF;
  IF p_target_kind NOT IN ('category', 'brand') THEN v_target_value := NULL; END IF;
  IF p_target_kind <> 'products' THEN v_products := '{}'; END IF;
  IF p_end_date IS NOT NULL AND p_end_date <= v_start THEN RAISE EXCEPTION 'Promotion window is invalid'; END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.promotions (title, description, discount_type, discount_value, target_kind, target_value, target_product_ids, start_date, end_date)
    VALUES (trim(p_title), NULLIF(trim(COALESCE(p_description, '')), ''), p_discount_type, p_discount_value, p_target_kind, v_target_value, v_products, v_start, p_end_date)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.promotions SET
      title = trim(p_title), description = NULLIF(trim(COALESCE(p_description, '')), ''), discount_type = p_discount_type, discount_value = p_discount_value,
      target_kind = p_target_kind, target_value = v_target_value, target_product_ids = v_products, start_date = v_start, end_date = p_end_date
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Promotion not found'; END IF;
  END IF;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone) TO authenticated, service_role;

-- "End now": the schedule closes at this moment. A scheduled Promotion that never ran is closed
-- at its start so it reads as expired rather than active for an instant.
CREATE OR REPLACE FUNCTION public.admin_end_promotion(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_now timestamp with time zone := now();
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  UPDATE public.promotions
  SET start_date = LEAST(start_date, v_now - interval '1 second'), end_date = v_now
  WHERE id = p_id AND (end_date IS NULL OR end_date > v_now);
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotion not found or already ended'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_end_promotion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_end_promotion(uuid) TO authenticated, service_role;

-- A Promotion that priced an Order line stays on record; end it instead.
CREATE OR REPLACE FUNCTION public.admin_delete_promotion(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF EXISTS (SELECT 1 FROM public.orders o, jsonb_array_elements(COALESCE(o.items, '[]'::jsonb)) i WHERE i->>'promotion_id' = p_id::text) THEN
    RAISE EXCEPTION 'Promotion priced orders and cannot be deleted; end it instead';
  END IF;
  DELETE FROM public.promotions WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Promotion not found'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_delete_promotion(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_delete_promotion(uuid) TO authenticated, service_role;

-- DOWN:
--   DROP FUNCTION public.admin_delete_promotion(uuid);
--   DROP FUNCTION public.admin_end_promotion(uuid);
--   DROP FUNCTION public.admin_save_promotion(text, text, numeric, text, uuid, text, text, uuid[], timestamp with time zone, timestamp with time zone);
--   DROP FUNCTION public.admin_get_promotions();
--   recreate effective_price from 20260920001500;
--   DROP FUNCTION public.promotion_status(timestamp with time zone, timestamp with time zone);
--   GRANT INSERT, UPDATE, DELETE ON TABLE public.promotions TO authenticated; GRANT SELECT ON TABLE public.promotions TO anon;
--   DROP INDEX public.promotions_window_idx;
--   ALTER TABLE public.promotions DROP CONSTRAINT promotions_window_check, DROP CONSTRAINT promotions_value_check,
--     DROP CONSTRAINT promotions_target_shape, DROP CONSTRAINT promotions_target_kind_check,
--     DROP COLUMN target_product_ids, DROP COLUMN target_value, DROP COLUMN target_kind,
--     ADD COLUMN usage_count integer DEFAULT 0, ADD COLUMN target_group text DEFAULT 'all',
--     ADD COLUMN status text DEFAULT 'active' CHECK (status IN ('active', 'scheduled', 'expired'));
--   CREATE POLICY "Anyone can view active promotions" ON public.promotions FOR SELECT TO authenticated, anon USING (status = 'active' OR public.is_admin());
