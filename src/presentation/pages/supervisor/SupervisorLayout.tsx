import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { Spinner } from '../../components/ui';

const SupervisorGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    if (role !== 'warehouse_supervisor' && role !== 'admin') {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

export const SupervisorLayout: React.FC = () => {
    const { signOut, user } = useAuth();
    const displayName = (user?.user_metadata?.full_name || user?.user_metadata?.name || 'مشرف المستودع') as string;

    return (
        <SupervisorGate>
            <div className="min-h-screen bg-slate-50/60 pb-safe text-gray-900 font-sans" dir="rtl">
                <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-gray-200 shadow-xs">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <img src="/logo.PNG" alt="Tips Beauty" className="h-9 sm:h-10 w-auto object-contain select-none" />
                            <div className="border-r border-gray-200 pr-3 mr-1 select-none">
                                <span className="text-sm font-black text-gray-900 block">بوابة المشرف</span>
                                <p className="text-xs text-gray-500 font-medium mt-0.5">{displayName}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void signOut()}
                                aria-label="تسجيل الخروج"
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-gray-700 hover:text-rose-600 hover:bg-rose-50 border border-gray-200 hover:border-rose-200 transition-all shadow-xs"
                            >
                                <LogOut className="w-4 h-4 text-gray-600 group-hover:text-rose-600" />
                                <span>تسجيل الخروج</span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
                    <Outlet />
                </main>
            </div>
        </SupervisorGate>
    );
};
