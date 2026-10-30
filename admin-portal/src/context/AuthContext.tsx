import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fetchStaffContext, type ManagedWarehouse } from '../lib/adminApi';
import type { Session, User } from '@supabase/supabase-js';

interface StaffState {
    role: string | null;
    isAdmin: boolean;
    isWarehouseManager: boolean;
    managedWarehouses: ManagedWarehouse[];
}

interface AuthContextType extends StaffState {
    session: Session | null;
    user: User | null;
    loading: boolean;
    signOut: () => Promise<void>;
    checkStaffAccess: () => Promise<boolean>;
}

const NO_STAFF_ACCESS: StaffState = { role: null, isAdmin: false, isWarehouseManager: false, managedWarehouses: [] };

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<Session | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [staff, setStaff] = useState<StaffState>(NO_STAFF_ACCESS);
    const [loading, setLoading] = useState(true);

    const checkStaffAccess = useCallback(async (): Promise<boolean> => {
        try {
            const context = await fetchStaffContext();
            const next: StaffState = {
                role: context.role,
                isAdmin: context.is_admin,
                isWarehouseManager: context.is_warehouse_manager,
                managedWarehouses: context.warehouses,
            };
            setStaff(next);
            return next.isAdmin || next.isWarehouseManager;
        } catch (error) {
            console.error('Error checking staff access:', error);
            setStaff(NO_STAFF_ACCESS);
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
                void checkStaffAccess();
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
                void checkStaffAccess();
            } else {
                setStaff(NO_STAFF_ACCESS);
                setLoading(false);
            }
        });

        return () => subscription.unsubscribe();
    }, [checkStaffAccess]);

    const signOut = async () => {
        await supabase.auth.signOut();
        setStaff(NO_STAFF_ACCESS);
    };

    return (
        <AuthContext.Provider value={{ session, user, ...staff, loading, signOut, checkStaffAccess }}>
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
