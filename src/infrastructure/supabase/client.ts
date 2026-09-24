import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { isNative } from '../auth/platform';
import { authStorage } from '../storage/sessionStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    auth: {
        // Inside the app the session lives in Preferences, not WebView localStorage, which iOS evicts.
        storage: authStorage(),
        // Native sign-in returns an id_token directly, so there is never a code in a URL to detect —
        // and leaving this on would have the app try to parse deep links as auth callbacks.
        detectSessionInUrl: !isNative(),
    },
});
