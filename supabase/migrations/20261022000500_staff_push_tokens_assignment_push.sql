-- Phase 5 (§7b.5): push tokens get an app audience so the driver app's device never receives customer
-- notifications, and an order's new driver is pushed when a manager or administrator assigns it.

ALTER TABLE public.customer_push_tokens
  ADD COLUMN IF NOT EXISTS app_audience text NOT NULL DEFAULT 'customer';

ALTER TABLE public.customer_push_tokens DROP CONSTRAINT IF EXISTS customer_push_tokens_app_audience_check;
ALTER TABLE public.customer_push_tokens ADD CONSTRAINT customer_push_tokens_app_audience_check
  CHECK (app_audience IN ('customer', 'driver'));

DROP FUNCTION IF EXISTS public.register_push_token(text, text, text, text);

CREATE FUNCTION public.register_push_token(
  p_token text,
  p_provider text,
  p_platform text,
  p_device_name text DEFAULT NULL,
  p_app_audience text DEFAULT 'customer'
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
  IF p_app_audience NOT IN ('customer', 'driver') THEN RAISE EXCEPTION 'Unsupported app audience'; END IF;
  IF p_app_audience = 'driver' AND NOT public.is_driver() THEN RAISE EXCEPTION 'Driver access required'; END IF;
  IF p_token IS NULL OR length(trim(p_token)) = 0 THEN RAISE EXCEPTION 'Invalid push token'; END IF;

  IF p_provider = 'expo' THEN
    IF p_token !~ '^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$' THEN
      RAISE EXCEPTION 'Invalid Expo push token';
    END IF;
    v_expo := p_token;
  END IF;

  INSERT INTO public.customer_push_tokens AS t
    (customer_id, provider, push_token, expo_push_token, platform, device_name, is_active, invalidated_at, last_registered_at, app_audience)
  VALUES
    (v_customer_id, p_provider, trim(p_token), v_expo, p_platform, NULLIF(trim(p_device_name), ''), true, NULL, timezone('utc', now()), p_app_audience)
  ON CONFLICT (push_token) DO UPDATE SET
    -- A shared or resold handset can present the same token under a new account.
    customer_id = EXCLUDED.customer_id,
    provider = EXCLUDED.provider,
    expo_push_token = EXCLUDED.expo_push_token,
    platform = EXCLUDED.platform,
    device_name = EXCLUDED.device_name,
    is_active = true,
    invalidated_at = NULL,
    last_registered_at = timezone('utc', now()),
    app_audience = EXCLUDED.app_audience
  RETURNING t.id INTO v_token_id;

  RETURN v_token_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.register_push_token(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_push_token(text, text, text, text, text) TO authenticated, service_role;

ALTER TABLE public.push_notification_deliveries DROP CONSTRAINT IF EXISTS push_notification_deliveries_event_type_check;
ALTER TABLE public.push_notification_deliveries ADD CONSTRAINT push_notification_deliveries_event_type_check
  CHECK (event_type IN ('shipped', 'delivered', 'review_request', 'driver_assigned'));

CREATE OR REPLACE FUNCTION public.trigger_driver_assignment_push() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_headers jsonb;
  v_authorization text;
BEGIN
  IF NEW.driver_id IS NULL OR NEW.driver_id IS NOT DISTINCT FROM OLD.driver_id THEN RETURN NEW; END IF;

  v_headers := COALESCE(NULLIF(current_setting('request.headers', true), ''), '{}')::jsonb;
  v_authorization := v_headers ->> 'authorization';
  IF v_authorization IS NULL OR v_authorization = '' THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://eaomyiihsuikinkdhwzy.supabase.co/functions/v1/driver-assignment-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', v_authorization),
    body := jsonb_build_object('order_id', NEW.id, 'driver_id', NEW.driver_id),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trigger_driver_assignment_push() FROM PUBLIC;
GRANT ALL ON FUNCTION public.trigger_driver_assignment_push() TO service_role;

DROP TRIGGER IF EXISTS on_order_driver_assigned ON public.orders;
CREATE TRIGGER on_order_driver_assigned
  AFTER UPDATE OF driver_id ON public.orders
  FOR EACH ROW
  WHEN (NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id)
  EXECUTE FUNCTION public.trigger_driver_assignment_push();

-- DOWN (manual):
--   DROP TRIGGER on_order_driver_assigned ON public.orders; DROP FUNCTION public.trigger_driver_assignment_push();
--   Restore push_notification_deliveries_event_type_check to ('shipped','delivered','review_request') after deleting 'driver_assigned' rows.
--   Restore register_push_token(text, text, text, text) from 20260924000000_push_fcm.sql, then DROP FUNCTION register_push_token(text, text, text, text, text).
--   ALTER TABLE public.customer_push_tokens DROP COLUMN app_audience;
