-- 0015 Push notifications: add FCM/APNs alongside Expo.
--
-- The backend was built for an Expo wrapper that no longer exists: customer_push_tokens.expo_push_token
-- is NOT NULL, unique, and constrained to `ExponentPushToken[...]`, so a Capacitor token could not
-- even be stored. The Capacitor apps produce FCM registration tokens (Firebase delivers to APNs for
-- iOS), so the table has to hold both shapes.
--
-- Nothing Expo is removed here. Old rows keep working, register_customer_push_token() keeps its exact
-- signature and behaviour, and the dispatcher routes per row. Expo comes out only once FCM is verified
-- on real handsets.

-- Tokens -----------------------------------------------------------------------
ALTER TABLE public.customer_push_tokens ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'expo';
ALTER TABLE public.customer_push_tokens ADD COLUMN IF NOT EXISTS push_token text;

ALTER TABLE public.customer_push_tokens DROP CONSTRAINT IF EXISTS customer_push_tokens_provider_check;
ALTER TABLE public.customer_push_tokens ADD CONSTRAINT customer_push_tokens_provider_check
  CHECK (provider IN ('expo', 'fcm'));

-- Existing rows are all Expo; copy them into the generic column so the dispatcher has one place to
-- read from regardless of provider.
UPDATE public.customer_push_tokens SET push_token = expo_push_token WHERE push_token IS NULL;

-- expo_push_token has to become nullable for FCM rows to exist at all. The regex that used to live on
-- the column moves into the row-level check below, where it only applies to Expo rows.
ALTER TABLE public.customer_push_tokens ALTER COLUMN expo_push_token DROP NOT NULL;

ALTER TABLE public.customer_push_tokens DROP CONSTRAINT IF EXISTS customer_push_tokens_token_shape_check;
ALTER TABLE public.customer_push_tokens ADD CONSTRAINT customer_push_tokens_token_shape_check
  CHECK (
    push_token IS NOT NULL AND length(push_token) > 0
    AND (
      (provider = 'expo' AND expo_push_token IS NOT NULL
        AND expo_push_token ~ '^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$'
        AND push_token = expo_push_token)
      OR (provider = 'fcm' AND expo_push_token IS NULL)
    )
  );

-- One device, one row, whichever provider it speaks. The old unique index on expo_push_token stays
-- for Expo rows; this covers FCM too.
CREATE UNIQUE INDEX IF NOT EXISTS customer_push_tokens_push_token_key
  ON public.customer_push_tokens (push_token);

-- Registration -----------------------------------------------------------------
-- New name, provider-aware. register_customer_push_token() is untouched and still serves any client
-- that has not been updated.
CREATE OR REPLACE FUNCTION public.register_push_token(
  p_token text,
  p_provider text,
  p_platform text,
  p_device_name text DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_customer_id uuid := (SELECT auth.uid());
  v_token_id uuid;
  v_expo text;
BEGIN
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_platform NOT IN ('ios', 'android') THEN RAISE EXCEPTION 'Unsupported device platform'; END IF;
  IF p_provider NOT IN ('expo', 'fcm') THEN RAISE EXCEPTION 'Unsupported push provider'; END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN RAISE EXCEPTION 'Invalid push token'; END IF;

  IF p_provider = 'expo' THEN
    IF p_token !~ '^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$' THEN
      RAISE EXCEPTION 'Invalid Expo push token';
    END IF;
    v_expo := p_token;
  END IF;

  INSERT INTO public.customer_push_tokens AS t
    (customer_id, provider, push_token, expo_push_token, platform, device_name, is_active, invalidated_at, last_registered_at)
  VALUES
    (v_customer_id, p_provider, trim(p_token), v_expo, p_platform, NULLIF(trim(p_device_name), ''), true, NULL, timezone('utc', now()))
  ON CONFLICT (push_token) DO UPDATE SET
    -- A shared or resold handset can present the same token under a new account.
    customer_id = EXCLUDED.customer_id,
    provider = EXCLUDED.provider,
    expo_push_token = EXCLUDED.expo_push_token,
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    is_active = true,
    invalidated_at = NULL,
    last_registered_at = timezone('utc', now())
  RETURNING t.id INTO v_token_id;

  RETURN v_token_id;
END;
$fn$;

ALTER FUNCTION public.register_push_token(text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_push_token(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, text) TO authenticated, service_role;

-- Signing out on a shared device must stop that device receiving another customer's order updates.
CREATE OR REPLACE FUNCTION public.deactivate_push_token(p_token text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_customer_id uuid := (SELECT auth.uid());
  v_count integer;
BEGIN
  IF v_customer_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.customer_push_tokens
     SET is_active = false, invalidated_at = timezone('utc', now())
   WHERE push_token = trim(p_token) AND customer_id = v_customer_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count > 0;
END;
$fn$;

ALTER FUNCTION public.deactivate_push_token(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.deactivate_push_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_push_token(text) TO authenticated, service_role;

-- Delivery log -----------------------------------------------------------------
-- expo_ticket_id stays for the Expo rows already logged; new rows record which transport ran and the
-- id that transport returned, so a failure can be traced to the right dashboard.
ALTER TABLE public.push_notification_deliveries ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE public.push_notification_deliveries ADD COLUMN IF NOT EXISTS provider_message_id text;

ALTER TABLE public.push_notification_deliveries DROP CONSTRAINT IF EXISTS push_notification_deliveries_provider_check;
ALTER TABLE public.push_notification_deliveries ADD CONSTRAINT push_notification_deliveries_provider_check
  CHECK (provider IS NULL OR provider IN ('expo', 'fcm'));

UPDATE public.push_notification_deliveries SET provider = 'expo' WHERE provider IS NULL;

-- Customers may read their own device list (Settings shows registered devices); the delivery log stays
-- admin-only, as it was.
DROP POLICY IF EXISTS "Customers view own push tokens" ON public.customer_push_tokens;
CREATE POLICY "Customers view own push tokens" ON public.customer_push_tokens
  FOR SELECT TO authenticated USING (customer_id = (SELECT auth.uid()) OR public.is_admin());

GRANT SELECT ON TABLE public.customer_push_tokens TO authenticated;
