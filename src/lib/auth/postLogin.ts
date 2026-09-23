// Where a customer lands after signing in. Shared by the password form, the social callback and
// (from the OTP workstream) phone sign-in, so one rule serves every door instead of three copies.

import { supabase } from '../supabase';

export async function resolvePostLoginPath(userId: string, from = '/'): Promise<string> {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    // Drivers get their own shell; everyone else goes back where they came from.
    return profile?.role === 'driver' && from === '/' ? '/driver' : from;
}
