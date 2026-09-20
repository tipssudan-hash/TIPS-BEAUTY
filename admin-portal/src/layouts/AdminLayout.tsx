import React, { useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
    LayoutDashboard, Package, LogOut, Menu, X, Loader2,
    ShoppingBag, Settings, Truck, Boxes, Warehouse, MapPin, Image, MessageSquare, Layers
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUnseenOrders } from '../hooks/useUnseenOrders';

export const AdminLayout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const location = useLocation();
    const { user, isAdmin, loading, signOut } = useAuth();
    const { count: unseenOrders } = useUnseenOrders();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
            </div>
        );
    }

    if (!user || !isAdmin) {
        return <Navigate to="/login" replace />;
    }

    const menuItems: { path: string; icon: typeof LayoutDashboard; label: string; badge: string | null }[] = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم', badge: null },
        { path: '/orders', icon: ShoppingBag, label: 'الطلبات', badge: unseenOrders > 0 ? String(unseenOrders) : null },
        { path: '/products', icon: Package, label: 'المنتجات', badge: null },
        { path: '/inventory', icon: Boxes, label: 'المخزون', badge: null },
        { path: '/warehouses', icon: Warehouse, label: 'المخازن', badge: null },
        { path: '/delivery-zones', icon: MapPin, label: 'محليات التوصيل', badge: null },
        { path: '/drivers', icon: Truck, label: 'المندوبون', badge: null },
        { path: '/banners', icon: Image, label: 'البانرات', badge: null },
        { path: '/collections', icon: Layers, label: 'المجموعات', badge: null },
        { path: '/reviews', icon: MessageSquare, label: 'التقييمات', badge: null },
        { path: '/settings', icon: Settings, label: 'الإعدادات', badge: null },
    ];

    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900" dir="rtl">
            {/* Sidebar Overlay */}
            {!sidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={() => setSidebarOpen(true)}
                />
            )}

            {/* Sidebar */}
            <aside
                className={`fixed inset-y-0 right-0 z-50 w-72 bg-slate-900 text-white shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                    } lg:relative lg:translate-x-0 lg:flex-shrink-0 border-l border-slate-800`}
            >
                <div className="h-full flex flex-col">
                    {/* Header */}
                    <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm">
                                <img src="/logo.png" alt="تيبس بيوتي" className="h-12 w-auto object-contain" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-white">إدارة تيبس</h2>
                                <p className="text-[10px] tracking-widest text-slate-400 font-bold">لوحة الإدارة</p>
                            </div>
                        </div>
                        <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto custom-scrollbar">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`group flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 ${active
                                        ? 'bg-brand-blue text-white shadow-lg shadow-brand-blue/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                                        <span className="font-semibold text-sm tracking-wide">{item.label}</span>
                                    </div>
                                    {item.badge && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-brand-blue' : 'bg-rose-500 text-white'
                                            }`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-800">
                        <div className="mb-4 px-4 py-3 bg-slate-800/50 rounded-2xl flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-700 flex items-center justify-center text-slate-300 font-bold border border-slate-600">
                                {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-bold text-slate-200 truncate">{user?.email}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">مدير النظام</p>
                            </div>
                        </div>
                        <button
                            onClick={signOut}
                            className="flex items-center gap-3 px-4 py-3 w-full text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all font-bold text-sm"
                        >
                            <LogOut className="w-5 h-5" />
                            <span>تسجيل الخروج</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 max-h-screen">
                {/* Header (Mobile) */}
                <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between lg:hidden flex-shrink-0">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg">
                        <Menu className="w-6 h-6" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-900">نظام إدارة تيبس</h2>
                    <div className="w-10" /> {/* Spacer */}
                </header>

                {/* Dashboard Viewport */}
                <main className="flex-1 overflow-y-auto bg-[#F8FAFC] custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

