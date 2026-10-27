import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type UserRole = 'admin' | 'accountant' | 'warehouse_supervisor' | 'driver' | 'customer' | null;

interface AuthContextType {
    session: Session | null;
    user: User | null;
    role: UserRole;
    isAdmin: boolean;
    isAccountant: boolean;
    hasPortalAccess: boolean;
    loading: boolean;
    signOut: () => Promise<void>;
    checkAdminRole: (userId: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [role, setRole] = useState<UserRole>(null);
    const [loading, setLoading] = useState(true);

    const isAdmin = role === 'admin';
    const isAccountant = role === 'accountant';
    const hasPortalAccess = isAdmin || isAccountant;

    const checkAdminRole = useCallback(async (userId: string): Promise<boolean> => {
        try {
            const { data, error } = await supabase.from('profiles').select('role').eq('id', userId).single();
            if (error) {
                console.error('Error checking role:', error);
                setRole(null);
                return false;
            }
            const fetchedRole = (data?.role ?? null) as UserRole;
            setRole(fetchedRole);
            return fetchedRole === 'admin';
        } catch (error) {
            console.error('Error checking admin role:', error);
            setRole(null);
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

        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            setSession(session);
            setUser(session?.user ?? null);
            if (event === 'TOKEN_REFRESHED') return;
            if (session?.user) {
                void checkAdminRole(session.user.id);
            } else {
                setRole(null);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [checkAdminRole]);

    const signOut = async () => {
        await supabase.auth.signOut();
        setRole(null);
    };

    return (
        <AuthContext.Provider value={{ session, user, role, isAdmin, isAccountant, hasPortalAccess, loading, signOut, checkAdminRole }}>
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
