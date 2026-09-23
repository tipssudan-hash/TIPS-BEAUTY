-- 0014 Multi-provider authentication (Google, Apple, phone OTP) alongside email+password.
-- Decisions (grilled 2026-09-23):
-- - Social/phone sign-in is for Customers only; Drivers and Admins stay on email+password.
-- - Ordering requires a *verified contact* (email OR phone), not specifically a verified email.
-- - Phone is mirrored onto profiles in E.164 so staff and the Admin Portal can read it without
--   reaching into the auth schema.
-- - Which methods are live is a server-side setting, never a build-time flag: a shipped mobile build
--   cannot be re-flagged without another store review cycle.

-- Phone normalisation ----------------------------------------------------------
-- Sudanese numbers arrive as 09xxxxxxxx locally, 249xxxxxxxxx from some keyboards, +249xxxxxxxxx from
-- others. Without one canonical form the unique index below is meaningless.
CREATE OR REPLACE FUNCTION public.normalize_sd_phone(p_phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_digits text;
BEGIN
  IF p_phone IS NULL THEN RETURN NULL; END IF;
  v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
  v_digits := regexp_replace(v_digits, '^00249', '');
  v_digits := regexp_replace(v_digits, '^249', '');
  v_digits := regexp_replace(v_digits, '^0', '');
  -- Sudanese mobile national numbers are 9 digits starting 1 or 9.
  IF v_digits ~ '^[19][0-9]{8}$' THEN RETURN '+249' || v_digits; END IF;
  RETURN NULL;
END;
$fn$;

ALTER FUNCTION public.normalize_sd_phone(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.normalize_sd_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_sd_phone(text) TO anon, authenticated, service_role;

-- profiles ---------------------------------------------------------------------
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone_confirmed_at timestamp with time zone;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS signup_method text;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_signup_method_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_signup_method_check
  CHECK (signup_method IS NULL OR signup_method IN ('password', 'google', 'apple', 'phone'));

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_phone_e164_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_phone_e164_check
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');

-- A verified phone is an identity, so it belongs to exactly one account. Unverified copies
-- (backfilled from checkout history) are deliberately not unique: family members really did share a
-- number at checkout before this existed.
CREATE UNIQUE INDEX IF NOT EXISTS profiles_phone_confirmed_unique_idx
  ON public.profiles (phone) WHERE phone IS NOT NULL AND phone_confirmed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS profiles_phone_idx ON public.profiles (phone) WHERE phone IS NOT NULL;

-- New users --------------------------------------------------------------------
-- Was: inserted id/email/role only, discarding the full name and phone the signup form collects.
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $fn$
DECLARE
  v_provider text := COALESCE(new.raw_app_meta_data->>'provider', 'email');
  v_method text;
  v_phone text;
  v_name text;
BEGIN
  v_method := CASE v_provider
    WHEN 'google' THEN 'google'
    WHEN 'apple' THEN 'apple'
    WHEN 'phone' THEN 'phone'
    ELSE 'password'
  END;

  -- auth.users.phone is set by phone OTP sign-up; the signup form passes phone in user metadata.
  v_phone := public.normalize_sd_phone(COALESCE(new.phone, new.raw_user_meta_data->>'phone'));

  -- Apple returns the name on the FIRST authorisation only; Google sends it every time.
  v_name := NULLIF(trim(COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    CONCAT_WS(' ', new.raw_user_meta_data->>'given_name', new.raw_user_meta_data->>'family_name')
  )), '');

  INSERT INTO public.profiles (id, email, role, phone, phone_confirmed_at, full_name, signup_method)
  VALUES (
    new.id,
    new.email,
    'customer',
    v_phone,
    CASE WHEN new.phone_confirmed_at IS NOT NULL AND v_phone IS NOT NULL THEN new.phone_confirmed_at END,
    v_name,
    v_method
  )
  ON CONFLICT (id) DO UPDATE SET
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    phone = COALESCE(public.profiles.phone, EXCLUDED.phone),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
  RETURN new;
END;
$fn$;

ALTER FUNCTION public.handle_new_user() OWNER TO postgres;

-- Keep profiles in step when auth.users gains a verified contact later: a phone added to an existing
-- password account, or an Apple relay address confirmed.
CREATE OR REPLACE FUNCTION public.sync_profile_contact() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $fn$
DECLARE
  v_phone text := public.normalize_sd_phone(new.phone);
BEGIN
  UPDATE public.profiles p SET
    email = COALESCE(new.email, p.email),
    phone = COALESCE(v_phone, p.phone),
    phone_confirmed_at = CASE
      WHEN new.phone_confirmed_at IS NOT NULL AND v_phone IS NOT NULL THEN new.phone_confirmed_at
      ELSE p.phone_confirmed_at
    END,
    full_name = COALESCE(p.full_name, NULLIF(trim(COALESCE(
      new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')), ''))
  WHERE p.id = new.id;
  RETURN new;
END;
$fn$;

ALTER FUNCTION public.sync_profile_contact() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_user_contact_updated ON auth.users;
CREATE TRIGGER on_auth_user_contact_updated
  AFTER UPDATE OF email, phone, email_confirmed_at, phone_confirmed_at, raw_user_meta_data ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_contact();

-- Customers only ---------------------------------------------------------------
-- A Driver who taps "Continue with Google" would otherwise land a second, customer-role account with
-- their work email, none of their deliveries in it, and a support call for you.
CREATE OR REPLACE FUNCTION public.enforce_customer_only_social_identity() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $fn$
DECLARE
  v_role text;
BEGIN
  IF new.provider IN ('email', 'phone') THEN RETURN new; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = new.user_id;
  IF v_role IS NOT NULL AND v_role <> 'customer' THEN
    RAISE EXCEPTION 'staff_social_login_not_allowed'
      USING HINT = 'Staff and driver accounts sign in with email and password.';
  END IF;
  RETURN new;
END;
$fn$;

ALTER FUNCTION public.enforce_customer_only_social_identity() OWNER TO postgres;

DROP TRIGGER IF EXISTS on_auth_identity_created ON auth.identities;
CREATE TRIGGER on_auth_identity_created
  BEFORE INSERT ON auth.identities
  FOR EACH ROW EXECUTE FUNCTION public.enforce_customer_only_social_identity();

-- Verified contact -------------------------------------------------------------
-- Replaces "verified email" as the gate on ordering: a phone-only customer has no email to confirm.
CREATE OR REPLACE FUNCTION public.has_verified_contact(p_user_id uuid DEFAULT NULL) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.id = COALESCE(p_user_id, (SELECT auth.uid()))
      AND (u.email_confirmed_at IS NOT NULL OR u.phone_confirmed_at IS NOT NULL)
  );
$fn$;

ALTER FUNCTION public.has_verified_contact(uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.has_verified_contact(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_verified_contact(uuid) TO authenticated, service_role;

-- Server-side method flags -----------------------------------------------------
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS auth_password_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS auth_google_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS auth_apple_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS auth_phone_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS auth_captcha_enabled boolean NOT NULL DEFAULT false;

-- app_settings is admin-only under RLS, but the login screen has to read these while signed out.
CREATE OR REPLACE FUNCTION public.get_auth_settings() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT jsonb_build_object(
    'password', s.auth_password_enabled,
    'google', s.auth_google_enabled,
    'apple', s.auth_apple_enabled,
    'phone', s.auth_phone_enabled,
    'captcha', s.auth_captcha_enabled
  )
  FROM public.app_settings s WHERE s.id;
$fn$;

ALTER FUNCTION public.get_auth_settings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_auth_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_settings() TO anon, authenticated, service_role;

-- Backfill ---------------------------------------------------------------------
-- Existing accounts kept name and phone in auth user metadata only; checkout addresses are the second
-- source. Neither is verified, so neither sets phone_confirmed_at.
UPDATE public.profiles p SET
  full_name = COALESCE(p.full_name, NULLIF(trim(COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name')), '')),
  phone = COALESCE(p.phone, public.normalize_sd_phone(COALESCE(u.phone, u.raw_user_meta_data->>'phone'))),
  phone_confirmed_at = COALESCE(
    p.phone_confirmed_at,
    CASE WHEN public.normalize_sd_phone(u.phone) IS NOT NULL THEN u.phone_confirmed_at END),
  signup_method = COALESCE(p.signup_method, CASE COALESCE(u.raw_app_meta_data->>'provider', 'email')
    WHEN 'google' THEN 'google' WHEN 'apple' THEN 'apple' WHEN 'phone' THEN 'phone' ELSE 'password' END)
FROM auth.users u
WHERE u.id = p.id;

-- Second source: the phone the customer typed at their most recent checkout. Unverified, so it fills
-- profiles.phone for staff to call, but never phone_confirmed_at and never the unique index.
UPDATE public.profiles p SET phone = src.phone
FROM (
  SELECT DISTINCT ON (o.customer_id)
    o.customer_id,
    public.normalize_sd_phone(o.phone) AS phone
  FROM public.orders o
  WHERE o.customer_id IS NOT NULL AND public.normalize_sd_phone(o.phone) IS NOT NULL
  ORDER BY o.customer_id, o.created_at DESC
) src
WHERE src.customer_id = p.id AND p.phone IS NULL;
