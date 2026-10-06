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
