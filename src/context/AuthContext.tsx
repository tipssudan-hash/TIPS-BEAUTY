import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { DEFAULT_AUTH_FLAGS, fetchAuthFlags, type AuthMethodFlags } from '../lib/auth/settings';
import { unregisterPush } from '../lib/native/push';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    /** Which sign-in methods are switched on server-side (app_settings). */
    authFlags: AuthMethodFlags;
    /** A customer may order once either contact channel is verified — email or phone. */
    hasVerifiedContact: boolean;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [authFlags, setAuthFlags] = useState<AuthMethodFlags>(DEFAULT_AUTH_FLAGS);

    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    useEffect(() => {
        // Read once at startup: the login screen needs these while signed out, and a flag flipped in
        // the Admin Portal reaches customers on their next app open without a new release.
        let cancelled = false;
        void fetchAuthFlags().then((flags) => { if (!cancelled) setAuthFlags(flags); });
        return () => { cancelled = true; };
    }, []);

    const signOut = async () => {
        // Order contents are private and phones get shared: release this device's push token first.
        await unregisterPush();
        await supabase.auth.signOut();
    };

    const hasVerifiedContact = Boolean(user && (user.email_confirmed_at || user.phone_confirmed_at));

    return (
        <AuthContext.Provider value={{ session, user, loading, authFlags, hasVerifiedContact, signOut }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
