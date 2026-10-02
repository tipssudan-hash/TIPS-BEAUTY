import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Warehouse } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '@infrastructure/supabase';
import { Spinner, EmptyState } from '../../components/ui';

// Warehouse supervisor portal: same shell as /driver. Only accounts with
// profiles.role = 'warehouse_supervisor' get in; RLS scopes the data to their warehouse.

const SupervisorGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, loading } = useAuth();
    const location = useLocation();
    const [role, setRole] = useState<string | null | undefined>(undefined);

    useEffect(() => {
        if (!user) { setRole(null); return; }
        let cancelled = false;
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
            .then(({ data }) => { if (!cancelled) setRole(data?.role ?? null); });
        return () => { cancelled = true; };
    }, [user]);

    if (loading || (user && role === undefined)) return <Spinner />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    if (role !== 'warehouse_supervisor') {
        return (
            <div className="max-w-md mx-auto p-6">
                <EmptyState
                    icon={<Warehouse className="w-7 h-7" />}
                    title="هذه البوابة لمشرفي المستودعات"
                    body="حسابك ليس مرتبطاً بمستودع. اطلب من الإدارة تعيينك كمشرف مستودع."
                    action={<Link to="/" className="text-brand-blue font-bold text-sm hover:underline">العودة للمتجر</Link>}
                />
            </div>
        );
    }
    return <>{children}</>;
};

export const SupervisorLayout: React.FC = () => {
    const { signOut } = useAuth();
    return (
        <SupervisorGate>
            <div className="min-h-screen bg-gray-50 pb-safe text-gray-900" dir="rtl">
                <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
                    <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                        <Link to="/supervisor" className="flex items-center gap-2 font-bold text-gray-900">
                            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-600 text-white">
                                <Warehouse className="w-5 h-5" />
                            </span>
                            <span className="text-sm">بوابة مشرف المستودع</span>
                        </Link>
                        <button type="button" onClick={() => void signOut()} aria-label="تسجيل الخروج"
                            className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </header>
                <main className="max-w-3xl mx-auto px-4 py-6">
                    <Outlet />
                </main>
            </div>
        </SupervisorGate>
    );
};
