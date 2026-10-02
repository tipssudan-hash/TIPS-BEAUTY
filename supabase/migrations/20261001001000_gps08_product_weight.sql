-- GPS-08: add weight and dimensions to products for volumetric delivery pricing.
-- Phase 1 of GPS-02 omits the weight multiplier (treats all products as 0 weight);
-- this migration adds the fields so staff can populate them, and the weight multiplier
-- in calculate_delivery_quote will automatically start using them once populated.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS length_cm numeric(6,1),
  ADD COLUMN IF NOT EXISTS width_cm numeric(6,1),
  ADD COLUMN IF NOT EXISTS height_cm numeric(6,1);

ALTER TABLE public.products
  ADD CONSTRAINT products_weight_grams_check CHECK (weight_grams IS NULL OR weight_grams > 0),
  ADD CONSTRAINT products_dimensions_check CHECK (
    (length_cm IS NULL OR length_cm > 0) AND
    (width_cm IS NULL OR width_cm > 0) AND
    (height_cm IS NULL OR height_cm > 0)
  );

COMMENT ON COLUMN public.products.weight_grams IS 'Product weight in grams. NULL = unknown/not entered yet. Used by GPS-02 weight multiplier in calculate_delivery_quote once populated.';
COMMENT ON COLUMN public.products.length_cm IS 'Package length in cm (for volumetric weight).';
COMMENT ON COLUMN public.products.width_cm IS 'Package width in cm.';
COMMENT ON COLUMN public.products.height_cm IS 'Package height in cm.';
