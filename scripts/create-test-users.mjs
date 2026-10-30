import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const accounts = [
  { email: 'johood2311@gmail.com', password: '1234abcd', role: 'driver', name: 'Johood Driver' },
  { email: 'youssifshmo2311@gmail.com', password: '1234abcd', role: 'warehouse_supervisor', name: 'Youssif Supervisor' }
];

const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function syncWarehouseManagerAccess(email, userId, warehouseId) {
  if (!serviceRoleKey) {
    console.log(`- Skipped warehouse_manager_access for ${email}: set SUPABASE_SERVICE_ROLE_KEY or run scripts/assign-test-roles.sql`);
    return;
  }
  const service = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: deleteError } = await service.from('warehouse_manager_access').delete().eq('user_id', userId);
  const { error: insertError } = deleteError
    ? { error: deleteError }
    : await service.from('warehouse_manager_access').insert({ user_id: userId, warehouse_id: warehouseId, is_primary: true });
  if (insertError) {
    console.error(`❌ warehouse_manager_access for ${email}:`, insertError.message);
  } else {
    console.log(`✅ warehouse_manager_access set for ${email}`);
  }
}

async function main() {
  console.log('=== TIPS BEAUTY TEST ACCOUNT CREATOR ===\n');

  for (const acc of accounts) {
    console.log(`Processing ${acc.email} (Target Role: ${acc.role})...`);
    
    // 1. Try sign-in
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.password
    });

    let userId = signInData?.user?.id;

    // 2. If sign-in fails, try sign-up
    if (signInError || !userId) {
      console.log(`- Sign-in attempt: ${signInError?.message || 'No session'}. Attempting sign-up...`);
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: acc.email,
        password: acc.password,
        options: {
          data: {
            full_name: acc.name
          }
        }
      });

      if (signUpError) {
        console.error(`❌ Sign-up error for ${acc.email}:`, signUpError.message);
        continue;
      }

      userId = signUpData?.user?.id;
      console.log(`✅ Signed up user ${acc.email} with ID: ${userId}`);

      // Try signing in now if session was not returned (e.g. if email confirmation is enabled)
      if (!signUpData?.session) {
        console.log(`- Note: Sign-up created user. Checking profile...`);
      }
    } else {
      console.log(`✅ Signed in successfully as ${acc.email} (ID: ${userId})`);
    }

    if (!userId) {
      console.error(`Could not retrieve user ID for ${acc.email}`);
      continue;
    }

    // 3. Query existing profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.error(`❌ Error fetching profile for ${acc.email}:`, profileError.message);
    } else {
      console.log(`- Current Profile:`, JSON.stringify(profile, null, 2));
      if (profile?.role === 'warehouse_supervisor' && profile.assigned_warehouse_id) {
        await syncWarehouseManagerAccess(acc.email, userId, profile.assigned_warehouse_id);
      }
    }
  }

  // Fetch available warehouses for reference
  const { data: warehouses, error: whError } = await supabase
    .from('warehouses')
    .select('id, name, city, is_active');

  if (whError) {
    console.log('\nWarehouses query info/error:', whError.message);
  } else {
    console.log('\nAvailable Warehouses in System:');
    console.log(JSON.stringify(warehouses, null, 2));
  }
}

main().catch(console.error);
