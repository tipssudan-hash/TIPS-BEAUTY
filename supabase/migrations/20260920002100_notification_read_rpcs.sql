-- 0021 Customer notification read state (launch step 4).
-- customer_notifications already fills from triggers (order created / status / payment, review
-- request, back in stock) and is readable by its owner under RLS. Marking read stays in two RPCs so
-- read_at is stamped in one place and the unread count the Storefront shows is always the table's.

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid());
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.customer_notifications
  SET is_read = true, read_at = COALESCE(read_at, timezone('utc', now()))
  WHERE id = p_id AND customer_id = v_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notification not found'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_user_id uuid := (SELECT auth.uid()); v_count integer;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  UPDATE public.customer_notifications
  SET is_read = true, read_at = COALESCE(read_at, timezone('utc', now()))
  WHERE customer_id = v_user_id AND NOT is_read;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated, service_role;

-- The Storefront reads its own rows directly (own-row policy) and never writes them: read state goes
-- through the RPCs above.
REVOKE UPDATE ON TABLE public.customer_notifications FROM authenticated;

CREATE INDEX IF NOT EXISTS customer_notifications_customer_created_idx ON public.customer_notifications (customer_id, created_at DESC);

-- DOWN:
--   DROP INDEX public.customer_notifications_customer_created_idx;
--   GRANT UPDATE ON TABLE public.customer_notifications TO authenticated;
--   DROP FUNCTION public.mark_all_notifications_read();
--   DROP FUNCTION public.mark_notification_read(uuid);
