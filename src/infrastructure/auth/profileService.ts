import { supabase } from '../supabase/client';

export interface UserProfile {
    id: string;
    email: string | null;
    fullName: string | null;
    phone: string | null;
    avatarUrl: string | null;
    role: string;
    signupMethod: string | null;
    phoneConfirmedAt: string | null;
}

/**
 * Fetch profile from public.profiles with metadata fallback
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error && error.code !== 'PGRST116') {
        console.error('fetchUserProfile error:', error);
    }

    const { data: { user } } = await supabase.auth.getUser();

    const metadata = user?.user_metadata || {};
    const rawProfile = profile as Record<string, unknown> | null;
    const avatar = (rawProfile?.avatar_url as string | undefined) || (metadata.avatar_url as string | undefined) || (metadata.picture as string | undefined) || null;
    const name = profile?.full_name || (metadata.full_name as string | undefined) || (metadata.name as string | undefined) || null;

    return {
        id: userId,
        email: user?.email || profile?.email || null,
        fullName: name,
        phone: profile?.phone || user?.phone || metadata.phone || null,
        avatarUrl: avatar,
        role: profile?.role || 'customer',
        signupMethod: profile?.signup_method || user?.app_metadata?.provider || null,
        phoneConfirmedAt: profile?.phone_confirmed_at || user?.phone_confirmed_at || null,
    };
}

/**
 * Update user full name and phone number
 */
export async function updateUserProfile(userId: string, updates: { fullName?: string; phone?: string }): Promise<void> {
    const metadataUpdates: Record<string, string> = {};
    if (updates.fullName !== undefined) metadataUpdates.full_name = updates.fullName;
    if (updates.phone !== undefined) metadataUpdates.phone = updates.phone;

    // 1. Update auth.users metadata
    const { error: authError } = await supabase.auth.updateUser({
        data: metadataUpdates,
    });
    if (authError) throw authError;

    // 2. Update public.profiles
    const dbUpdates: Record<string, string | null> = {};
    if (updates.fullName !== undefined) dbUpdates.full_name = updates.fullName;
    if (updates.phone !== undefined) dbUpdates.phone = updates.phone;

    const { error: dbError } = await supabase
        .from('profiles')
        .update(dbUpdates)
        .eq('id', userId);

    if (dbError) {
        console.warn('public.profiles update skipped or failed:', dbError.message);
    }
}

/**
 * Upload an avatar image and set it as the user's profile picture
 */
export async function uploadUserAvatar(userId: string, file: File): Promise<string> {
    const ext = file.name.split('.').pop() || 'jpg';
    const filePath = `${userId}/avatar-${Date.now()}.${ext}`;

    // Try uploading to Supabase 'avatars' storage bucket
    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true, contentType: file.type });

    let avatarUrl = '';

    if (!uploadError) {
        const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
        avatarUrl = data.publicUrl;
    } else {
        // If avatars bucket is not created or RLS is locked, convert to base64 preview/storage
        console.warn('Storage upload error, falling back to data URL:', uploadError.message);
        avatarUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // Save avatarUrl in auth metadata
    await supabase.auth.updateUser({
        data: { avatar_url: avatarUrl, picture: avatarUrl },
    });

    // Save avatarUrl in public.profiles if column exists
    await (supabase.from('profiles') as unknown as { update: (data: unknown) => { eq: (col: string, val: string) => Promise<unknown> } })
        .update({ avatar_url: avatarUrl })
        .eq('id', userId)
        .catch(() => {});

    return avatarUrl;
}
