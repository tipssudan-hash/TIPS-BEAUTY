-- 0020 Stop trigger functions being reachable as RPCs.
--
-- Supabase's security advisor flags SECURITY DEFINER functions that `anon` or `authenticated` may call
-- through /rest/v1/rpc/<name>. Trigger functions are never meant to be called that way: they run as the
-- table owner when the trigger fires, and their EXECUTE grant is irrelevant to that. Leaving the grant
-- in place just publishes an endpoint nobody should be able to reach.
--
-- Three are from this session (enforce_customer_only_social_identity, sync_profile_contact,
-- queue_order_whatsapp_notification). The rest predate it and are the same class of hole; they are
-- included because "someone else wrote it" is not a reason to leave a known one open, and revoking
-- EXECUTE on a trigger function cannot change any behaviour.

DO $$
DECLARE
  v_fn text;
  v_trigger_functions text[] := ARRAY[
    -- this session
    'public.enforce_customer_only_social_identity()',
    'public.sync_profile_contact()',
    'public.queue_order_whatsapp_notification()',
    'public.handle_new_user()',
    -- pre-existing
    'public.queue_order_email_notification()',
    'public.update_product_review_summary()',
    'public.prevent_ordered_product_delete()',
    'public.ensure_warehouse_inventory_rows()',
    'public.inventory_restock_notification()',
    'public.prevent_profile_role_change()',
    'public.create_profile_referral_code()'
  ];
BEGIN
  FOREACH v_fn IN ARRAY v_trigger_functions LOOP
    -- Skip anything not present rather than failing the migration: this list spans several authors and
    -- a function may legitimately have been renamed or dropped.
    IF EXISTS (
      SELECT 1 FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname || '.' || p.proname || '()' = v_fn
    ) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
    END IF;
  END LOOP;
END;
$$;

-- otp_request_attempts has RLS enabled and deliberately no policies: it is rate-limiting state for the
-- send-otp hook, read and written only by the service role. The advisor flags "RLS enabled, no policy"
-- as INFO; deny-all is the intent, recorded here so nobody adds a policy to silence the linter.
COMMENT ON TABLE public.otp_request_attempts IS
  'Rate-limiting state for phone OTP requests. RLS on with no policies on purpose: service role only, never client-readable. Pruned daily by prune_otp_attempts().';
