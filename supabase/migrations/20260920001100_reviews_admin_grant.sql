-- 0011 The "Admins manage reviews" RLS policy had no matching table privilege, so the admin
-- reviews page could not read anything. RLS still blocks non-admins (they have no policy).
GRANT SELECT, UPDATE, DELETE ON TABLE public.reviews TO authenticated;

-- DOWN: REVOKE SELECT, UPDATE, DELETE ON TABLE public.reviews FROM authenticated;
