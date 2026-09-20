-- 0012 Atomic membership writes for storefront collections (product picker save path).
-- storefront_collections / storefront_collection_products / get_storefront_collections()
-- already exist (baseline). This is the only new backend object the Collections feature needs:
-- everything else is a direct table write under the existing is_admin() RLS, matching saveBanner.

CREATE OR REPLACE FUNCTION public.admin_set_collection_products(p_collection_id uuid, p_product_ids uuid[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.storefront_collections WHERE id = p_collection_id) THEN
    RAISE EXCEPTION 'Collection not found';
  END IF;

  DELETE FROM public.storefront_collection_products WHERE collection_id = p_collection_id;

  INSERT INTO public.storefront_collection_products (collection_id, product_id, display_order)
  SELECT p_collection_id, product_id, (ordinality - 1) * 10
  FROM unnest(p_product_ids) WITH ORDINALITY AS t(product_id, ordinality);

  UPDATE public.storefront_collections SET updated_at = timezone('utc', now()) WHERE id = p_collection_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_set_collection_products(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_collection_products(uuid, uuid[]) TO authenticated, service_role;

-- DOWN: DROP FUNCTION public.admin_set_collection_products(uuid, uuid[]);
