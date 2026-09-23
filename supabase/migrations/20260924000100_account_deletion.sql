-- 0016 In-app account deletion.
--
-- Apple App Review Guideline 5.1.1(v) requires any app that creates accounts to let customers delete
-- them *inside the app*. A request form that emails staff is rejected. This is therefore a hard store
-- blocker, not a nicety.
--
-- It is a soft, anonymising delete: personal data goes, the financial record stays. Orders are
-- accounting records — deleting the rows would leave the books unable to explain their own totals —
-- so each order keeps its number, items, amounts and dates while losing the name, phone, address and
-- notes that identify a person. Behavioural data (favourites, restock alerts, AI usage) is deleted
-- outright; it has no accounting value.
--
-- The customer cannot sign in afterwards: sessions are destroyed, social identities unlinked, the
-- login address replaced with a tombstone, and the auth user banned.

CREATE TABLE IF NOT EXISTS public.account_deletions (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    customer_id uuid NOT NULL,
    -- Kept deliberately: staff need to answer "what happened to this order's customer?" during a
    -- payment dispute, without holding the identity itself.
    orders_anonymised integer NOT NULL DEFAULT 0,
    proofs_removed integer NOT NULL DEFAULT 0,
    requested_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.account_deletions OWNER TO postgres;
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view account deletions" ON public.account_deletions
  FOR SELECT TO authenticated USING (public.is_admin());
GRANT SELECT ON TABLE public.account_deletions TO authenticated;
GRANT ALL ON TABLE public.account_deletions TO service_role;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone;

-- What the customer is told before they confirm. Read from the app so the warning cannot drift from
-- what the function actually does.
CREATE OR REPLACE FUNCTION public.account_deletion_preview() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT jsonb_build_object(
    'orders', (SELECT count(*) FROM public.orders o WHERE o.customer_id = (SELECT auth.uid())),
    'active_orders', (SELECT count(*) FROM public.orders o
                       WHERE o.customer_id = (SELECT auth.uid())
                         AND o.status NOT IN ('delivered', 'cancelled')),
    'reviews', (SELECT count(*) FROM public.reviews r WHERE r.user_id = (SELECT auth.uid())),
    'beauty_points', (SELECT COALESCE(p.beauty_points, 0) FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );
$fn$;

ALTER FUNCTION public.account_deletion_preview() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.account_deletion_preview() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.account_deletion_preview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.delete_my_account() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'auth', 'extensions'
    AS $fn$
DECLARE
  v_customer_id uuid := (SELECT auth.uid());
  v_role text;
  v_active integer;
  v_orders integer := 0;
  v_proofs integer := 0;
  v_tombstone text;
BEGIN
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_customer_id;
  -- Staff and Drivers are payroll records with deliveries attached; an admin removes those, not a
  -- self-service button.
  IF v_role IS DISTINCT FROM 'customer' THEN
    RAISE EXCEPTION 'staff_account_deletion_not_allowed'
      USING HINT = 'Staff and driver accounts are removed by an administrator.';
  END IF;

  -- An order still being prepared or delivered needs the name and phone it is being delivered to.
  SELECT count(*) INTO v_active FROM public.orders
   WHERE customer_id = v_customer_id AND status NOT IN ('delivered', 'cancelled');
  IF v_active > 0 THEN
    RAISE EXCEPTION 'active_orders_exist'
      USING HINT = 'Wait until in-flight orders are delivered or cancelled.';
  END IF;

  v_tombstone := 'deleted-' || replace(v_customer_id::text, '-', '') || '@deleted.invalid';

  -- Orders keep their money and lose their person.
  UPDATE public.orders SET
    customer_name = 'حساب محذوف',
    phone = NULL,
    shipping_address = NULL,
    notes = NULL
  WHERE customer_id = v_customer_id;
  GET DIAGNOSTICS v_orders = ROW_COUNT;

  -- Payment proofs are photographs of bank transfers: the single most sensitive thing stored. The
  -- amount and reference stay for reconciliation; the image goes.
  DELETE FROM storage.objects
   WHERE bucket_id = 'payment-proofs'
     AND name IN (SELECT proof_path FROM public.payment_proofs
                   WHERE customer_id = v_customer_id AND proof_path IS NOT NULL);
  GET DIAGNOSTICS v_proofs = ROW_COUNT;
  UPDATE public.payment_proofs SET proof_path = NULL WHERE customer_id = v_customer_id;

  -- Reviews are product content other customers rely on; the rating and text stay, the author does not.
  UPDATE public.reviews SET user_name = 'حساب محذوف' WHERE user_id = v_customer_id;

  -- Nothing further should ever be sent to this person.
  DELETE FROM public.notification_queue WHERE customer_id = v_customer_id AND status = 'pending';
  UPDATE public.notification_queue SET recipient_phone = NULL WHERE customer_id = v_customer_id;
  UPDATE public.customer_push_tokens
     SET is_active = false, invalidated_at = timezone('utc', now())
   WHERE customer_id = v_customer_id;
  DELETE FROM public.customer_notifications WHERE customer_id = v_customer_id;

  -- Behavioural data: no accounting value, so it is deleted rather than anonymised.
  DELETE FROM public.customer_favorites WHERE customer_id = v_customer_id;
  DELETE FROM public.restock_subscriptions WHERE customer_id = v_customer_id;
  DELETE FROM public.ai_request_limits WHERE customer_id = v_customer_id;
  DELETE FROM public.checkout_idempotency WHERE customer_id = v_customer_id;

  UPDATE public.profiles SET
    email = NULL,
    phone = NULL,
    phone_confirmed_at = NULL,
    full_name = NULL,
    referral_code = NULL,
    beauty_points = 0,
    deleted_at = timezone('utc', now())
  WHERE id = v_customer_id;

  INSERT INTO public.account_deletions (customer_id, orders_anonymised, proofs_removed)
  VALUES (v_customer_id, v_orders, v_proofs);

  -- Sign-in must stop immediately and permanently. Unlinking the social identities means a later
  -- "Continue with Google" creates a clean new account rather than resurrecting this one.
  DELETE FROM auth.sessions WHERE user_id = v_customer_id;
  DELETE FROM auth.refresh_tokens WHERE user_id = v_customer_id::text;
  DELETE FROM auth.identities WHERE user_id = v_customer_id;
  UPDATE auth.users SET
    email = v_tombstone,
    phone = NULL,
    raw_user_meta_data = '{}'::jsonb,
    -- A concrete far-future timestamp rather than 'infinity': GoTrue reads this column and its Go
    -- time handling has no equivalent for an infinite Postgres timestamp.
    banned_until = timezone('utc', now()) + interval '100 years'
  WHERE id = v_customer_id;

  RETURN jsonb_build_object('orders_anonymised', v_orders, 'proofs_removed', v_proofs);
END;
$fn$;

ALTER FUNCTION public.delete_my_account() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- A deleted profile must not be resurrected by the sign-up trigger's ON CONFLICT branch.
CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx ON public.profiles (deleted_at) WHERE deleted_at IS NOT NULL;
