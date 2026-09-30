-- Auto-generate affiliate code from ID (no manual code entry)
-- The code column remains for backward compatibility with existing checkout flows
-- but is now auto-generated and never manually entered by admin.

-- Replace admin_save_affiliate to auto-generate the code from the new row's UUID
DROP FUNCTION IF EXISTS public.admin_save_affiliate(uuid, text, text, text, text, numeric, numeric, text, text, text, text);

CREATE OR REPLACE FUNCTION public.admin_save_affiliate(
  p_id uuid DEFAULT NULL,
  p_display_name text DEFAULT '',
  p_phone text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_commission_rate numeric DEFAULT 5,
  p_minimum_payout numeric DEFAULT 0,
  p_payout_method text DEFAULT NULL,
  p_payout_details text DEFAULT NULL,
  p_admin_note text DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF trim(p_display_name) = '' THEN RAISE EXCEPTION 'Marketer display name is required'; END IF;
  IF COALESCE(p_commission_rate, 0) < 0 OR p_commission_rate > 100 THEN RAISE EXCEPTION 'Commission rate must be between 0 and 100 percent'; END IF;
  IF p_status NOT IN ('pending', 'active', 'suspended', 'rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;

  IF p_id IS NULL THEN
    v_id := extensions.uuid_generate_v4();
    v_code := 'AFF-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));

    -- Ensure code uniqueness (extremely unlikely collision)
    WHILE EXISTS (SELECT 1 FROM public.affiliate_profiles WHERE code = v_code) LOOP
      v_id := extensions.uuid_generate_v4();
      v_code := 'AFF-' || upper(substr(replace(v_id::text, '-', ''), 1, 8));
    END LOOP;

    INSERT INTO public.affiliate_profiles (
      id, display_name, code, phone, email, commission_rate, minimum_payout,
      payout_method, payout_details, admin_note, status, approved_by, approved_at
    ) VALUES (
      v_id, trim(p_display_name), v_code,
      NULLIF(trim(COALESCE(p_phone, '')), ''), NULLIF(trim(COALESCE(p_email, '')), ''),
      COALESCE(p_commission_rate, 5), COALESCE(p_minimum_payout, 0),
      NULLIF(trim(COALESCE(p_payout_method, '')), ''),
      NULLIF(trim(COALESCE(p_payout_details, '')), ''),
      NULLIF(trim(COALESCE(p_admin_note, '')), ''),
      p_status,
      CASE WHEN p_status = 'active' THEN auth.uid() ELSE NULL END,
      CASE WHEN p_status = 'active' THEN timezone('utc', now()) ELSE NULL END
    );
  ELSE
    UPDATE public.affiliate_profiles SET
      display_name = trim(p_display_name),
      phone = NULLIF(trim(COALESCE(p_phone, '')), ''),
      email = NULLIF(trim(COALESCE(p_email, '')), ''),
      commission_rate = COALESCE(p_commission_rate, commission_rate),
      minimum_payout = COALESCE(p_minimum_payout, 0),
      payout_method = NULLIF(trim(COALESCE(p_payout_method, '')), ''),
      payout_details = NULLIF(trim(COALESCE(p_payout_details, '')), ''),
      admin_note = NULLIF(trim(COALESCE(p_admin_note, '')), ''),
      status = p_status,
      approved_by = CASE WHEN p_status = 'active' AND approved_by IS NULL THEN auth.uid() ELSE approved_by END,
      approved_at = CASE WHEN p_status = 'active' AND approved_at IS NULL THEN timezone('utc', now()) ELSE approved_at END,
      updated_at = timezone('utc', now())
    WHERE id = p_id RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Marketer profile not found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_save_affiliate(uuid, text, text, text, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_save_affiliate(uuid, text, text, text, numeric, numeric, text, text, text, text) TO authenticated, service_role;
