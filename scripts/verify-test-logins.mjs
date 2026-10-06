import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

const accounts = [
  { email: 'johood2311@gmail.com', password: '1234abcd', expectedRole: 'driver' },
  { email: 'youssifshmo2311@gmail.com', password: '1234abcd', expectedRole: 'warehouse_supervisor' }
];

async function main() {
  for (const acc of accounts) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: acc.email,
      password: acc.password
    });

    if (error) {
      console.error(`❌ ${acc.email}: login failed — ${error.message}`);
      continue;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, assigned_warehouse_id')
      .eq('id', data.user.id)
      .maybeSingle();

    const actual = profile?.role ?? '(no profile)';
    const ok = actual === acc.expectedRole;
    console.log(`${ok ? '✅' : '⚠️'}  ${acc.email}  role=${actual}  expected=${acc.expectedRole}  warehouse=${profile?.assigned_warehouse_id ?? 'none'}`);
  }
}

main().catch(console.error);
