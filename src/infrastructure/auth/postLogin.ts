// Where a customer lands after signing in. Shared by the password form, the social callback and
// (from the OTP workstream) phone sign-in, so one rule serves every door instead of three copies.

import { supabase } from '../supabase/client';

export async function resolvePostLoginPath(userId: string, from = '/'): Promise<string> {
    const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
    if (profile?.role === 'driver') {
        if (!from || from === '/' || !from.startsWith('/driver')) return '/driver';
    }
    if (profile?.role === 'warehouse_supervisor') {
        if (!from || from === '/' || !from.startsWith('/supervisor')) return '/supervisor';
    }
    return from || '/';
}
