-- 0017 Phone OTP delivery: rate limiting, channel settings, and a delivery log.
--
-- Every OTP costs real money (SMS to Sudan is around $0.47 a message at list price), so an unmetered
-- endpoint is a way to spend someone else's budget. Limits are enforced in SQL rather than in the Edge
-- Function because only the database can count attempts atomically across concurrent requests.
--
-- No production SMS provider is committed. The channel is configuration, and the dispatcher reads these
-- settings at send time, so switching provider or channel never touches the auth architecture.

-- Attempt ledger ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.otp_request_attempts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    phone text NOT NULL,
    -- Nullable: the hook does not always see a client IP, and a missing IP must not block a real customer.
    ip_address text,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.otp_request_attempts OWNER TO postgres;
ALTER TABLE public.otp_request_attempts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS otp_request_attempts_phone_idx ON public.otp_request_attempts (phone, created_at DESC);
CREATE INDEX IF NOT EXISTS otp_request_attempts_ip_idx ON public.otp_request_attempts (ip_address, created_at DESC) WHERE ip_address IS NOT NULL;
GRANT ALL ON TABLE public.otp_request_attempts TO service_role;

-- Delivery log -----------------------------------------------------------------
-- "The code never arrived" is unanswerable without this. Admin-only: it holds phone numbers.
CREATE TABLE IF NOT EXISTS public.otp_delivery_log (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL PRIMARY KEY,
    phone text NOT NULL,
    channel text NOT NULL,
    provider text,
    status text NOT NULL,
    provider_message_id text,
    error_message text,
    -- Which attempt this was for the number, so a support conversation can be reconstructed.
    attempt integer,
    created_at timestamp with time zone NOT NULL DEFAULT timezone('utc', now()),
    CONSTRAINT otp_delivery_log_channel_check CHECK (channel IN ('whatsapp', 'sms')),
    CONSTRAINT otp_delivery_log_status_check CHECK (status IN ('sent', 'failed', 'blocked'))
);

ALTER TABLE public.otp_delivery_log OWNER TO postgres;
ALTER TABLE public.otp_delivery_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view otp delivery log" ON public.otp_delivery_log
  FOR SELECT TO authenticated USING (public.is_admin());
CREATE INDEX IF NOT EXISTS otp_delivery_log_created_idx ON public.otp_delivery_log (created_at DESC);
CREATE INDEX IF NOT EXISTS otp_delivery_log_phone_idx ON public.otp_delivery_log (phone, created_at DESC);
GRANT SELECT ON TABLE public.otp_delivery_log TO authenticated;
GRANT ALL ON TABLE public.otp_delivery_log TO service_role;

-- Channel settings -------------------------------------------------------------
-- WhatsApp first, SMS as fallback: WhatsApp costs a fraction of SMS, but Sudan has frequent nationwide
-- internet shutdowns and SMS survives a data-only outage. Both switchable without a release.
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_whatsapp_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_sms_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_primary_channel text NOT NULL DEFAULT 'whatsapp';
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_cooldown_seconds integer NOT NULL DEFAULT 60;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_max_per_phone_hour integer NOT NULL DEFAULT 5;
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS otp_max_per_ip_hour integer NOT NULL DEFAULT 20;

ALTER TABLE public.app_settings DROP CONSTRAINT IF EXISTS app_settings_otp_primary_channel_check;
ALTER TABLE public.app_settings ADD CONSTRAINT app_settings_otp_primary_channel_check
  CHECK (otp_primary_channel IN ('whatsapp', 'sms'));

-- Read by the delivery hook (service role only: these are operational, not public like the auth flags).
CREATE OR REPLACE FUNCTION public.get_otp_settings() RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
  SELECT jsonb_build_object(
    'whatsapp_enabled', s.otp_whatsapp_enabled,
    'sms_enabled', s.otp_sms_enabled,
    'primary_channel', s.otp_primary_channel,
    'cooldown_seconds', s.otp_cooldown_seconds,
    'max_per_phone_hour', s.otp_max_per_phone_hour,
    'max_per_ip_hour', s.otp_max_per_ip_hour
  )
  FROM public.app_settings s WHERE s.id;
$fn$;

ALTER FUNCTION public.get_otp_settings() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_otp_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_otp_settings() TO service_role;

-- Rate limiting ----------------------------------------------------------------
-- Records the attempt and decides in the same statement, so two concurrent requests cannot both pass a
-- limit that only allows one. Returns the reason so the app can say something true in Arabic rather
-- than a generic failure.
CREATE OR REPLACE FUNCTION public.record_otp_attempt(p_phone text, p_ip text DEFAULT NULL)
RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_phone text := public.normalize_sd_phone(p_phone);
  v_settings jsonb;
  v_cooldown integer;
  v_max_phone integer;
  v_max_ip integer;
  v_last timestamp with time zone;
  v_phone_count integer;
  v_ip_count integer;
  v_wait integer;
BEGIN
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'invalid_phone', 'retry_after', 0, 'attempt', 0);
  END IF;

  SELECT public.get_otp_settings() INTO v_settings;
  v_cooldown := COALESCE((v_settings->>'cooldown_seconds')::integer, 60);
  v_max_phone := COALESCE((v_settings->>'max_per_phone_hour')::integer, 5);
  v_max_ip := COALESCE((v_settings->>'max_per_ip_hour')::integer, 20);

  -- Serialise per number: two taps on "resend" must not both get through the cooldown.
  PERFORM pg_advisory_xact_lock(hashtext('otp:' || v_phone));

  SELECT max(created_at) INTO v_last FROM public.otp_request_attempts WHERE phone = v_phone;
  IF v_last IS NOT NULL THEN
    v_wait := v_cooldown - floor(extract(epoch FROM (timezone('utc', now()) - v_last)))::integer;
    IF v_wait > 0 THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'cooldown', 'retry_after', v_wait, 'attempt', 0);
    END IF;
  END IF;

  SELECT count(*) INTO v_phone_count FROM public.otp_request_attempts
   WHERE phone = v_phone AND created_at > timezone('utc', now()) - interval '1 hour';
  IF v_phone_count >= v_max_phone THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'phone_quota', 'retry_after', 3600, 'attempt', v_phone_count);
  END IF;

  IF p_ip IS NOT NULL THEN
    SELECT count(*) INTO v_ip_count FROM public.otp_request_attempts
     WHERE ip_address = p_ip AND created_at > timezone('utc', now()) - interval '1 hour';
    IF v_ip_count >= v_max_ip THEN
      RETURN jsonb_build_object('allowed', false, 'reason', 'ip_quota', 'retry_after', 3600, 'attempt', v_phone_count);
    END IF;
  END IF;

  INSERT INTO public.otp_request_attempts (phone, ip_address) VALUES (v_phone, p_ip);

  RETURN jsonb_build_object('allowed', true, 'reason', 'ok', 'retry_after', 0, 'attempt', v_phone_count + 1);
END;
$fn$;

ALTER FUNCTION public.record_otp_attempt(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.record_otp_attempt(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_otp_attempt(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.log_otp_delivery(
  p_phone text,
  p_channel text,
  p_provider text,
  p_status text,
  p_provider_message_id text DEFAULT NULL,
  p_error text DEFAULT NULL,
  p_attempt integer DEFAULT NULL
) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.otp_delivery_log (phone, channel, provider, status, provider_message_id, error_message, attempt)
  VALUES (COALESCE(public.normalize_sd_phone(p_phone), p_phone), p_channel, p_provider, p_status, p_provider_message_id, p_error, p_attempt)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$fn$;

ALTER FUNCTION public.log_otp_delivery(text, text, text, text, text, text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.log_otp_delivery(text, text, text, text, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_otp_delivery(text, text, text, text, text, text, integer) TO service_role;

-- Attempt rows are rate-limiting state, not history: anything older than a day is dead weight, and it
-- is phone numbers we have no reason to keep.
CREATE OR REPLACE FUNCTION public.prune_otp_attempts() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $fn$
DECLARE
  v_removed integer;
BEGIN
  DELETE FROM public.otp_request_attempts WHERE created_at < timezone('utc', now()) - interval '1 day';
  GET DIAGNOSTICS v_removed = ROW_COUNT;
  RETURN v_removed;
END;
$fn$;

ALTER FUNCTION public.prune_otp_attempts() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.prune_otp_attempts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_otp_attempts() TO service_role;

-- cron.schedule replaces a job of the same name, so re-running this migration is safe.
-- To undo: SELECT cron.unschedule('prune-otp-attempts');
SELECT cron.schedule('prune-otp-attempts', '17 3 * * *', $$SELECT public.prune_otp_attempts();$$);
