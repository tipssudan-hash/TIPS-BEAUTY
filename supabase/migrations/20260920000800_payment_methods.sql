-- 0008 Payment methods: Cash on Delivery and Mycashi only (Fawry is not available in Sudan).

DELETE FROM public.payment_methods pm
WHERE pm.code IN ('Fawry', 'BANK_TRANSFER')
  AND NOT EXISTS (SELECT 1 FROM public.payment_proofs pp WHERE pp.payment_method = pm.code)
  AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.payment_method = pm.code);

INSERT INTO public.payment_methods (code, name_ar, description_ar, requires_proof, is_active, display_order)
VALUES
  ('COD', 'الدفع عند الاستلام', 'ادفعي نقداً للمندوب عند استلام طلبك.', false, true, 10),
  ('Mychashi', 'تحويل عبر ماي كاشي', 'حوّلي المبلغ عبر تطبيق ماي كاشي ثم أدخلي رقم العملية وصورة الإيصال.', true, true, 20)
ON CONFLICT (code) DO UPDATE SET
  name_ar = EXCLUDED.name_ar,
  description_ar = EXCLUDED.description_ar,
  requires_proof = EXCLUDED.requires_proof,
  is_active = true,
  display_order = EXCLUDED.display_order;

-- Tighten the CHECK only if no legacy rows remain.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.payment_methods WHERE code NOT IN ('COD', 'Mychashi')) THEN
    ALTER TABLE public.payment_methods DROP CONSTRAINT IF EXISTS payment_methods_code_check;
    ALTER TABLE public.payment_methods ADD CONSTRAINT payment_methods_code_check CHECK (code IN ('COD', 'Mychashi'));
  END IF;
END $$;

-- DOWN: restore the baseline CHECK (COD, BANK_TRANSFER, Fawry, Mychashi); re-insert rows if needed.
