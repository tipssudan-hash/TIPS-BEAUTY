import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Warehouse } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';

// Warehouse supervisor portal: same shell as /driver. Only accounts with
// profiles.role = 'warehouse_supervisor' get in; RLS scopes the data to their warehouse.

const SupervisorGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    if (role !== 'warehouse_supervisor') {
        return <Navigate to="/" replace />;
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
