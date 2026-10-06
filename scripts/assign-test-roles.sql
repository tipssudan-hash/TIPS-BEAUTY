-- TIPS BEAUTY - Test Account Role Assignment
-- Run in: Supabase Dashboard > SQL Editor (runs as postgres, bypasses RLS)

-- 1. Confirm emails
UPDATE auth.users 
SET email_confirmed_at = NOW()
WHERE email IN ('johood2311@gmail.com', 'youssifshmo2311@gmail.com')
  AND email_confirmed_at IS NULL;

-- 2. johood2311@gmail.com → driver
UPDATE public.profiles 
SET role = 'driver' 
WHERE id = (SELECT id FROM auth.users WHERE email = 'johood2311@gmail.com');

-- 3. youssifshmo2311@gmail.com → warehouse_supervisor + assign first active warehouse
UPDATE public.profiles 
SET role = 'warehouse_supervisor',
    assigned_warehouse_id = (SELECT id FROM public.warehouses WHERE is_active = true LIMIT 1)
WHERE id = (SELECT id FROM auth.users WHERE email = 'youssifshmo2311@gmail.com');

-- 4. Verify
SELECT u.email, p.role, p.assigned_warehouse_id, w.name AS warehouse_name
FROM public.profiles p
JOIN auth.users u ON p.id = u.id
LEFT JOIN public.warehouses w ON w.id = p.assigned_warehouse_id
WHERE u.email IN ('johood2311@gmail.com', 'youssifshmo2311@gmail.com');
