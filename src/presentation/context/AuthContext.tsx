import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@infrastructure/supabase';
import { DEFAULT_AUTH_FLAGS, fetchAuthFlags, type AuthMethodFlags } from '@infrastructure/auth/settings';
import { unregisterPush } from '@infrastructure/native/push';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    loading: boolean;
    /** Which sign-in methods are switched on server-side (app_settings). */
    authFlags: AuthMethodFlags;
    /**
     * True when the flags above could not be read and are therefore the safe defaults, not the real
     * settings. Without this a network failure looks exactly like "the owner turned everything off",
     * and the login screen hides its buttons with nothing to explain why.
     */
    authFlagsUnavailable: boolean;
    /** Retry the flags read, for the customer to trigger after fixing their connection. */
    reloadAuthFlags: () => void;
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
    const [authFlagsUnavailable, setAuthFlagsUnavailable] = useState(false);
    // Bumping this re-runs the read below; it is how the retry button works.
    const [authFlagsAttempt, setAuthFlagsAttempt] = useState(0);

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
        // Read at startup: the login screen needs these while signed out, and a flag flipped in the
        // Admin Portal reaches customers on their next app open without a new release.
        let cancelled = false;
        void fetchAuthFlags().then(({ flags, ok }) => {
            if (cancelled) return;
            setAuthFlags(flags);
            setAuthFlagsUnavailable(!ok);
        });
        return () => { cancelled = true; };
    }, [authFlagsAttempt]);

    const reloadAuthFlags = useCallback(() => { setAuthFlagsAttempt((n) => n + 1); }, []);

    const signOut = async () => {
        // Order contents are private and phones get shared: release this device's push token first.
        await unregisterPush();
        await supabase.auth.signOut();
    };

    const hasVerifiedContact = Boolean(user && (user.email_confirmed_at || user.phone_confirmed_at));

    return (
        <AuthContext.Provider value={{ session, user, loading, authFlags, authFlagsUnavailable, reloadAuthFlags, hasVerifiedContact, signOut }}>
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
