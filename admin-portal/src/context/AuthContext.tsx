import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

interface AuthContextType {
    session: Session | null;
    user: User | null;
    isAdmin: boolean;
    loading: boolean;
    signOut: () => Promise<void>;
    checkAdminRole: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);

    const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
        try {
            const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
            if (error) {
                console.error('Error checking role:', error);
                setIsAdmin(false);
                return false;
            }
            const admin = data?.role === 'admin';
            setIsAdmin(admin);
            return admin;
        } catch (error) {
            console.error('Error checking admin role:', error);
            setIsAdmin(false);
            return false;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (session?.user) {
                void checkAdminRole(session.user.id);
            } else {
                setLoading(false);
            }
        });

        // The role only changes with the signed-in user, so a token refresh must not re-query it.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (event === 'TOKEN_REFRESHED') return;
            if (session?.user) {
                void checkAdminRole(session.user.id);
            } else {
                setIsAdmin(false);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [checkAdminRole]);

    const signOut = async () => {
        await supabase.auth.signOut();
        setIsAdmin(false);
    };

    return (
        <AuthContext.Provider value={{ session, user, isAdmin, loading, signOut, checkAdminRole }}>
            {children}
        </AuthContext.Provider>
    );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
