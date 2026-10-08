import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Warehouse } from 'lucide-react';
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
    const { signOut } = useAuth();
    return (
        <SupervisorGate>
            <div className="min-h-screen bg-slate-50/60 pb-safe text-gray-900 font-sans" dir="rtl">
                <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-brand-blue-soft shadow-xs">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
                        <Link to="/supervisor" className="flex items-center gap-3 group">
                            <div className="bg-white p-1.5 rounded-card border border-brand-blue-soft shadow-card group-hover:shadow-card-glow transition-all">
                                <img src="/logo.PNG" alt="Tips Beauty" className="h-9 sm:h-10 w-auto object-contain" />
                            </div>
                            <div className="hidden sm:block border-r border-gray-200 pr-3 mr-1">
                                <div className="flex items-center gap-1.5">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-blue text-white shadow-xs">
                                        <Warehouse className="w-3.5 h-3.5" />
                                    </span>
                                    <span className="text-xs font-black text-gray-900">بوابة مشرف المستودع</span>
                                </div>
                                <p className="text-[11px] text-gray-500 font-medium">إدارة التجهيز، المناديب، ومخزون المنتجات</p>
                            </div>
                        </Link>

                        <div className="flex items-center gap-2 sm:gap-3">
                            <Link
                                to="/"
                                className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-control text-xs font-bold text-gray-600 hover:text-brand-blue hover:bg-brand-blue-soft transition-colors"
                            >
                                المتجر الرئيسي
                            </Link>

                            <button
                                type="button"
                                onClick={() => void signOut()}
                                aria-label="تسجيل الخروج"
                                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-control text-xs font-bold text-gray-600 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-all"
                            >
                                <LogOut className="w-4 h-4" />
                                <span className="hidden sm:inline">تسجيل الخروج</span>
                            </button>
                        </div>
                    </div>
                </header>

                <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                    <Outlet />
                </main>
            </div>
        </SupervisorGate>
    );
};

