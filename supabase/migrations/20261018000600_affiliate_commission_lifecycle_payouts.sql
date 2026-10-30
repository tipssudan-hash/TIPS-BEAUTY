-- Affiliate commissions go through a hold period (pending -> approved), payouts are allocated FIFO across
-- commissions, and a commission cannot be reversed or marked paid outside the allowed transitions.
-- Commissions with no eligible_at (created before this migration) are treated as already eligible.

ALTER TABLE public.affiliate_commissions
  ADD COLUMN eligible_at timestamptz,
  ADD COLUMN paid_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  ADD COLUMN review_note text;

ALTER TABLE public.affiliate_commissions
  ADD CONSTRAINT affiliate_commissions_paid_le_amount CHECK (paid_amount <= commission_amount);

UPDATE public.affiliate_commissions SET paid_amount = commission_amount WHERE status = 'paid';

ALTER TABLE public.app_settings
  ADD COLUMN affiliate_hold_days integer NOT NULL DEFAULT 14 CHECK (affiliate_hold_days BETWEEN 0 AND 90);

CREATE TABLE public.affiliate_payout_allocations (
  payout_id     uuid NOT NULL REFERENCES public.affiliate_payouts(id) ON DELETE RESTRICT,
  commission_id uuid NOT NULL REFERENCES public.affiliate_commissions(id) ON DELETE RESTRICT,
  amount        numeric(14,2) NOT NULL CHECK (amount > 0),
  PRIMARY KEY (payout_id, commission_id)
);

CREATE INDEX affiliate_payout_allocations_commission_idx ON public.affiliate_payout_allocations (commission_id);

ALTER TABLE public.affiliate_payout_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.affiliate_payout_allocations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.affiliate_payout_allocations TO authenticated;
GRANT ALL ON public.affiliate_payout_allocations TO service_role;

CREATE POLICY "Admins view affiliate payout allocations"
  ON public.affiliate_payout_allocations FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.award_growth_rewards() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'extensions'
    AS $$
DECLARE
  v_reward_id uuid;
  v_affiliate public.affiliate_profiles%ROWTYPE;
  v_commission numeric;
  v_hold_days integer;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status IS DISTINCT FROM 'delivered') THEN
    -- Referral Bonus
    IF NEW.referral_referrer_id IS NOT NULL THEN
      INSERT INTO public.referral_rewards(referrer_id, referred_customer_id, order_id, points_awarded, status)
      VALUES(NEW.referral_referrer_id, NEW.customer_id, NEW.id, 100, 'available')
      ON CONFLICT(referred_customer_id) DO NOTHING RETURNING id INTO v_reward_id;
      IF v_reward_id IS NOT NULL THEN
        UPDATE public.profiles SET beauty_points = COALESCE(beauty_points, 0) + 100 WHERE id = NEW.referral_referrer_id;
        INSERT INTO public.loyalty_ledger(customer_id, order_id, points_delta, event_type, note)
        VALUES(NEW.referral_referrer_id, NEW.id, 100, 'referral_bonus', 'مكافأة إحالة عميلة جديدة');
        PERFORM public.create_customer_notification(NEW.referral_referrer_id, 'referral_reward', 'مكافأة إحالة جديدة', 'حصلتِ على 100 نقطة جمال بعد اكتمال أول طلب من عميلتك المُحالة.', NEW.id, NULL, jsonb_build_object('url', '/referrals'));
      END IF;
    END IF;

    -- Affiliate / Marketer Commission
    IF NEW.affiliate_id IS NOT NULL THEN
      SELECT * INTO v_affiliate FROM public.affiliate_profiles WHERE id = NEW.affiliate_id AND status = 'active';
      IF FOUND THEN
        v_commission := round(GREATEST(NEW.total - COALESCE(NEW.shipping_fee, 0), 0) * v_affiliate.commission_rate / 100, 2);
        IF v_commission > 0 THEN
          SELECT s.affiliate_hold_days INTO v_hold_days FROM public.app_settings s WHERE s.id = true;
          INSERT INTO public.affiliate_commissions(affiliate_id, customer_id, order_id, commission_rate, commission_amount, status, eligible_at)
          VALUES(v_affiliate.id, NEW.customer_id, NEW.id, v_affiliate.commission_rate, v_commission, 'pending',
                 now() + make_interval(days => COALESCE(v_hold_days, 14)))
          ON CONFLICT(order_id) DO UPDATE SET
            commission_amount = EXCLUDED.commission_amount,
            commission_rate = EXCLUDED.commission_rate
          WHERE affiliate_commissions.status = 'pending';
          IF v_affiliate.customer_id IS NOT NULL THEN
            PERFORM public.create_customer_notification(v_affiliate.customer_id, 'affiliate_commission', 'عمولة مسوق جديدة', 'تم تسجيل عمولة بقيمة ' || to_char(v_commission, 'FM999G999G990D00') || ' ج.س بعد اكتمال تسليم الطلب.', NEW.id, NULL, jsonb_build_object('url', '/affiliate'));
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_release_eligible_commissions(p_affiliate_id uuid DEFAULT NULL) RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  UPDATE public.affiliate_commissions c
  SET status = 'approved',
      approved_by = auth.uid(),
      approved_at = now()
  WHERE c.status = 'pending'
    AND (c.eligible_at IS NULL OR c.eligible_at <= now())
    AND (p_affiliate_id IS NULL OR c.affiliate_id = p_affiliate_id)
    AND EXISTS (SELECT 1 FROM public.orders o WHERE o.id = c.order_id AND o.status = 'delivered')
    AND NOT EXISTS (
      SELECT 1 FROM public.order_returns r
      WHERE r.order_id = c.order_id AND r.status IN ('requested', 'approved', 'received')
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_release_eligible_commissions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_release_eligible_commissions(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.review_affiliate_commission(uuid, text);

CREATE FUNCTION public.review_affiliate_commission(
  p_commission_id uuid,
  p_status text,
  p_note text DEFAULT NULL
) RETURNS text
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_commission public.affiliate_commissions%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF p_status NOT IN ('approved', 'reversed') THEN RAISE EXCEPTION 'Unsupported commission status'; END IF;

  SELECT c.* INTO v_commission FROM public.affiliate_commissions c WHERE c.id = p_commission_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Commission not found'; END IF;

  IF NOT ((v_commission.status = 'pending' AND p_status IN ('approved', 'reversed'))
          OR (v_commission.status = 'approved' AND p_status = 'reversed')) THEN
    RAISE EXCEPTION 'This commission status transition is not allowed';
  END IF;
  IF p_status = 'reversed' AND v_commission.paid_amount > 0 THEN
    RAISE EXCEPTION 'A commission with payouts cannot be reversed';
  END IF;

  UPDATE public.affiliate_commissions c
  SET status = p_status,
      approved_by = auth.uid(),
      approved_at = CASE WHEN p_status = 'approved' THEN timezone('utc', now()) ELSE c.approved_at END,
      review_note = COALESCE(NULLIF(trim(COALESCE(p_note, '')), ''), c.review_note)
  WHERE c.id = p_commission_id;

  RETURN p_status;
END;
$$;

REVOKE ALL ON FUNCTION public.review_affiliate_commission(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_affiliate_commission(uuid, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.admin_record_affiliate_payout(
  p_affiliate_id uuid,
  p_amount numeric,
  p_payout_method text,
  p_reference_number text DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payout_id uuid;
  v_admin_id uuid := auth.uid();
  v_minimum numeric;
  v_available numeric;
  v_amount numeric := round(p_amount, 2);
  v_remaining numeric;
  v_take numeric;
  v_comm record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'Payout amount must be greater than zero'; END IF;
  IF COALESCE(trim(p_payout_method), '') = '' THEN RAISE EXCEPTION 'Payout method is required'; END IF;

  SELECT COALESCE(a.minimum_payout, 0) INTO v_minimum FROM public.affiliate_profiles a WHERE a.id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer not found'; END IF;

  PERFORM public.admin_release_eligible_commissions(p_affiliate_id);

  PERFORM 1 FROM public.affiliate_commissions c
  WHERE c.affiliate_id = p_affiliate_id AND c.status = 'approved'
  FOR UPDATE;

  SELECT COALESCE(SUM(c.commission_amount - c.paid_amount), 0) INTO v_available
  FROM public.affiliate_commissions c
  WHERE c.affiliate_id = p_affiliate_id AND c.status = 'approved';

  IF v_amount > v_available THEN
    RAISE EXCEPTION 'Payout amount exceeds the available commission balance';
  END IF;
  IF v_amount < v_minimum AND v_amount <> v_available THEN
    RAISE EXCEPTION 'Payout amount is below the minimum payout';
  END IF;

  INSERT INTO public.affiliate_payouts (
    affiliate_id, amount, payout_method, reference_number, notes, created_by
  ) VALUES (
    p_affiliate_id, v_amount, trim(p_payout_method),
    NULLIF(trim(COALESCE(p_reference_number, '')), ''),
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_admin_id
  ) RETURNING id INTO v_payout_id;

  v_remaining := v_amount;
  FOR v_comm IN
    SELECT c.id, c.commission_amount, c.paid_amount
    FROM public.affiliate_commissions c
    WHERE c.affiliate_id = p_affiliate_id AND c.status = 'approved' AND c.commission_amount > c.paid_amount
    ORDER BY c.eligible_at NULLS FIRST, c.created_at, c.id
  LOOP
    EXIT WHEN v_remaining <= 0;
    v_take := LEAST(v_remaining, v_comm.commission_amount - v_comm.paid_amount);

    UPDATE public.affiliate_commissions c
    SET paid_amount = c.paid_amount + v_take,
        status = CASE WHEN c.paid_amount + v_take >= c.commission_amount THEN 'paid' ELSE c.status END,
        paid_at = CASE WHEN c.paid_amount + v_take >= c.commission_amount THEN timezone('utc', now()) ELSE c.paid_at END
    WHERE c.id = v_comm.id;

    INSERT INTO public.affiliate_payout_allocations (payout_id, commission_id, amount)
    VALUES (v_payout_id, v_comm.id, v_take);

    v_remaining := v_remaining - v_take;
  END LOOP;

  IF v_remaining <> 0 THEN RAISE EXCEPTION 'Payout allocation mismatch'; END IF;

  RETURN v_payout_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_affiliate_payout(uuid, numeric, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_affiliate_payout(uuid, numeric, text, text, text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.admin_get_affiliate_details(uuid);

CREATE FUNCTION public.admin_get_affiliate_details(p_affiliate_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_profile record;
  v_coupons jsonb;
  v_orders jsonb;
  v_commissions jsonb;
  v_payouts jsonb;
  v_stats record;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Administrator access required'; END IF;

  SELECT * INTO v_profile FROM public.affiliate_profiles WHERE id = p_affiliate_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Marketer profile not found'; END IF;

  -- Coupons assigned to this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'name', c.name,
    'discount_type', c.discount_type,
    'discount_value', c.discount_value,
    'max_discount_amount', c.max_discount_amount,
    'usage_count', c.usage_count,
    'is_active', c.is_active,
    'starts_at', c.starts_at,
    'ends_at', c.ends_at
  ) ORDER BY c.created_at DESC), '[]'::jsonb)
  INTO v_coupons
  FROM public.coupons c
  WHERE c.affiliate_id = p_affiliate_id;

  -- Orders brought by this affiliate
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', o.id,
    'order_number', o.order_number,
    'customer_name', o.customer_name,
    'phone', o.phone,
    'total', o.total,
    'discount_amount', o.discount_amount,
    'coupon_code', o.coupon_code,
    'status', o.status,
    'payment_status', o.payment_status,
    'created_at', o.created_at
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_orders
  FROM public.orders o
  WHERE o.affiliate_id = p_affiliate_id;

  -- Commissions history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ac.id,
    'order_id', ac.order_id,
    'order_number', o.order_number,
    'commission_amount', ac.commission_amount,
    'commission_rate', ac.commission_rate,
    'paid_amount', ac.paid_amount,
    'status', ac.status,
    'eligible_at', ac.eligible_at,
    'review_note', ac.review_note,
    'created_at', ac.created_at,
    'paid_at', ac.paid_at
  ) ORDER BY ac.created_at DESC), '[]'::jsonb)
  INTO v_commissions
  FROM public.affiliate_commissions ac
  LEFT JOIN public.orders o ON o.id = ac.order_id
  WHERE ac.affiliate_id = p_affiliate_id;

  -- Payouts history
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', ap.id,
    'amount', ap.amount,
    'payout_method', ap.payout_method,
    'reference_number', ap.reference_number,
    'notes', ap.notes,
    'created_at', ap.created_at
  ) ORDER BY ap.created_at DESC), '[]'::jsonb)
  INTO v_payouts
  FROM public.affiliate_payouts ap
  WHERE ap.affiliate_id = p_affiliate_id;

  SELECT
    (SELECT count(DISTINCT o.id) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_orders,
    (SELECT COALESCE(sum(GREATEST(o.total - COALESCE(o.shipping_fee, 0), 0)), 0) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_sales,
    (SELECT COALESCE(sum(COALESCE(o.discount_amount, 0)), 0) FROM public.orders o WHERE o.affiliate_id = p_affiliate_id AND o.status = 'delivered') AS total_delivered_discounts,
    (SELECT COALESCE(sum(ac.commission_amount), 0) FROM public.affiliate_commissions ac WHERE ac.affiliate_id = p_affiliate_id AND ac.status IN ('approved', 'paid')) AS total_commission_earned,
    (SELECT COALESCE(sum(ap.amount), 0) FROM public.affiliate_payouts ap WHERE ap.affiliate_id = p_affiliate_id) AS total_paid,
    (SELECT COALESCE(sum(ac.commission_amount - ac.paid_amount), 0) FROM public.affiliate_commissions ac WHERE ac.affiliate_id = p_affiliate_id AND ac.status = 'approved') AS pending_balance,
    (SELECT COALESCE(sum(ac.commission_amount - ac.paid_amount), 0) FROM public.affiliate_commissions ac WHERE ac.affiliate_id = p_affiliate_id AND ac.status = 'pending') AS on_hold_balance
  INTO v_stats;

  RETURN jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'display_name', v_profile.display_name,
      'code', v_profile.code,
      'phone', v_profile.phone,
      'email', v_profile.email,
      'status', v_profile.status,
      'commission_rate', v_profile.commission_rate,
      'minimum_payout', v_profile.minimum_payout,
      'payout_method', v_profile.payout_method,
      'payout_details', v_profile.payout_details,
      'admin_note', v_profile.admin_note,
      'created_at', v_profile.created_at
    ),
    'stats', jsonb_build_object(
      'total_orders', COALESCE(v_stats.total_delivered_orders, 0),
      'total_sales', COALESCE(v_stats.total_delivered_sales, 0),
      'total_discount_given', COALESCE(v_stats.total_delivered_discounts, 0),
      'total_commission_earned', COALESCE(v_stats.total_commission_earned, 0),
      'total_payouts_paid', COALESCE(v_stats.total_paid, 0),
      'pending_balance', COALESCE(v_stats.pending_balance, 0),
      'on_hold_balance', COALESCE(v_stats.on_hold_balance, 0)
    ),
    'coupons', v_coupons,
    'orders', v_orders,
    'commissions', v_commissions,
    'payouts', v_payouts
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_affiliate_details(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_affiliate_details(uuid) TO authenticated, service_role;

-- DOWN (manual):
--   Restore award_growth_rewards() from 20260930000100_coupons_affiliate_hub.sql (section 6), and
--   review_affiliate_commission(uuid, text), admin_record_affiliate_payout() and admin_get_affiliate_details()
--   from 20260930000100 / 20261017000100 (drop the 3-argument review function first).
--   DROP TABLE public.affiliate_payout_allocations;
--   DROP FUNCTION public.admin_release_eligible_commissions(uuid);
--   ALTER TABLE public.app_settings DROP COLUMN affiliate_hold_days;
--   ALTER TABLE public.affiliate_commissions DROP CONSTRAINT affiliate_commissions_paid_le_amount,
--     DROP COLUMN eligible_at, DROP COLUMN paid_amount, DROP COLUMN review_note;
--   Commissions that were pending or reversed by this migration keep those statuses; review them manually.
