-- 0005 Shared "seen" state for the admin unseen-orders badge, plus missing indexes.

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS viewed_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON public.orders (status, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_unseen_idx ON public.orders (created_at DESC) WHERE status = 'new' AND viewed_at IS NULL;
CREATE INDEX IF NOT EXISTS payment_proofs_status_idx ON public.payment_proofs (status);

CREATE OR REPLACE FUNCTION public.mark_order_viewed(p_order_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  UPDATE public.orders SET viewed_at = timezone('utc', now())
  WHERE id = p_order_id AND viewed_at IS NULL AND public.is_admin();
$$;

REVOKE ALL ON FUNCTION public.mark_order_viewed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_order_viewed(uuid) TO authenticated, service_role;

-- DOWN: DROP FUNCTION public.mark_order_viewed(uuid); DROP INDEX ...; ALTER TABLE public.orders DROP COLUMN viewed_at;
