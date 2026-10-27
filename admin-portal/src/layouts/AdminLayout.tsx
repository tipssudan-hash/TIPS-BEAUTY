import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
    LayoutDashboard, Package, LogOut, Menu, X, Loader2,
    ShoppingBag, Settings, Truck, Boxes, Warehouse, MapPin, Image, MessageSquare, Radio, Layers, Ticket, Percent, Users, Megaphone, Gauge, Undo2,
    BookOpen, HandCoins, TrendingUp, Calculator,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUnseenOrders } from '../hooks/useUnseenOrders';
import { useFocusTrap } from '../hooks/useFocusTrap';

function useIsBelowLg() {
    const [isBelowLg, setIsBelowLg] = useState(() => window.matchMedia('(max-width: 1023px)').matches);
    useEffect(() => {
        const mq = window.matchMedia('(max-width: 1023px)');
        const handler = () => setIsBelowLg(mq.matches);
        mq.addEventListener('change', handler);
        return () => mq.removeEventListener('change', handler);
    }, []);
    return isBelowLg;
}

const ROLE_LABELS: Record<string, string> = {
    admin: 'مدير النظام',
    accountant: 'محاسب',
    warehouse_supervisor: 'أمين مستودع',
};

export const AdminLayout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const isBelowLg = useIsBelowLg();
    const closeSidebar = React.useCallback(() => setSidebarOpen(false), []);
    const sidebarRef = useFocusTrap<HTMLElement>(sidebarOpen && isBelowLg, closeSidebar);
    const location = useLocation();
    const { user, role, isAccountant, hasPortalAccess, loading, signOut } = useAuth();
    const { count: unseenOrders } = useUnseenOrders();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-red-500" />
            </div>
        );
    }

    if (!user || !hasPortalAccess) {
        return <Navigate to="/login" replace />;
    }

    const adminMenuItems: { path: string; icon: typeof LayoutDashboard; label: string; badge: string | null }[] = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم', badge: null },
        { path: '/orders', icon: ShoppingBag, label: 'الطلبات', badge: unseenOrders > 0 ? String(unseenOrders) : null },
        { path: '/returns', icon: Undo2, label: 'المرتجعات', badge: null },
        { path: '/customers', icon: Users, label: 'العملاء', badge: null },
        { path: '/products', icon: Package, label: 'المنتجات', badge: null },
        { path: '/inventory', icon: Boxes, label: 'المخزون', badge: null },
        { path: '/warehouses', icon: Warehouse, label: 'المخازن', badge: null },
        { path: '/delivery-zones', icon: MapPin, label: 'محليات التوصيل', badge: null },
        { path: '/delivery-pricing', icon: Gauge, label: 'تسعير التوصيل الديناميكي', badge: null },
        { path: '/drivers', icon: Truck, label: 'المندوبون', badge: null },
        { path: '/banners', icon: Image, label: 'البانرات', badge: null },
        { path: '/collections', icon: Layers, label: 'التشكيلات', badge: null },
        { path: '/coupons', icon: Ticket, label: 'أكواد الخصم', badge: null },
        { path: '/affiliates', icon: Megaphone, label: 'المسوقون والعمولات', badge: null },
        { path: '/promotions', icon: Percent, label: 'العروض', badge: null },
        { path: '/reviews', icon: MessageSquare, label: 'التقييمات', badge: null },
        { path: '/delivery-health', icon: Radio, label: 'حالة الإشعارات', badge: null },
        { path: '/settings', icon: Settings, label: 'الإعدادات', badge: null },
    ];

    const accountantMenuItems: { path: string; icon: typeof LayoutDashboard; label: string; badge: string | null }[] = [
        { path: '/orders', icon: ShoppingBag, label: 'الطلبات', badge: unseenOrders > 0 ? String(unseenOrders) : null },
        { path: '/returns', icon: Undo2, label: 'المرتجعات', badge: null },
        { path: '/customers', icon: Users, label: 'العملاء', badge: null },
        { path: '/accounting/warehouse-performance', icon: TrendingUp, label: 'أداء المخازن', badge: null },
        { path: '/accounting/custody', icon: HandCoins, label: 'العهد الغير مسلمة', badge: null },
        { path: '/accounting/driver-accounts', icon: Truck, label: 'حسابات المندوبين', badge: null },
        { path: '/accounting/marketer-accounts', icon: BookOpen, label: 'حسابات المسوقين', badge: null },
    ];

    const menuItems = isAccountant ? accountantMenuItems : adminMenuItems;
    const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

    const sidebarAccentColor = isAccountant ? 'bg-emerald-600' : 'bg-brand-blue';
    const roleLabel = ROLE_LABELS[role ?? ''] ?? 'مستخدم';

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900" dir="rtl">
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            <aside
                ref={sidebarRef}
                role="dialog"
                aria-modal={sidebarOpen && isBelowLg ? true : undefined}
                aria-label="القائمة الرئيسية"
                className={`fixed inset-y-0 right-0 z-50 w-72 bg-slate-900 text-white shadow-2xl transform transition-transform duration-300 ease-in-out ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'
                    } lg:relative lg:translate-x-0 lg:flex-shrink-0 border-l border-slate-800`}
            >
                <div className="h-full flex flex-col">
                    <div className="h-20 flex items-center justify-between px-6 border-b border-slate-800">
                        <div className="flex items-center gap-3">
                            <div className="bg-white p-1.5 rounded-lg shadow-sm">
                                <img src="/logo.png" alt="تيبس بيوتي" className="h-12 w-auto object-contain" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold tracking-tight text-white">إدارة تيبس</h2>
                                <p className="text-[10px] tracking-widest text-slate-400 font-bold">
                                    {isAccountant ? 'بوابة المحاسبة' : 'لوحة الإدارة'}
                                </p>
                            </div>
                        </div>
                        <button onClick={closeSidebar} aria-label="إغلاق القائمة" className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {isAccountant && (
                        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-emerald-900/40 border border-emerald-800/50 flex items-center gap-2">
                            <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                            <span className="text-xs font-bold text-emerald-300">وضع المحاسبة</span>
                        </div>
                    )}

                    <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto custom-scrollbar">
                        {menuItems.map((item) => {
                            const Icon = item.icon;
                            const active = isActive(item.path);
                            return (
                                <Link
                                    key={item.path}
                                    to={item.path}
                                    className={`group flex items-center justify-between px-4 py-3.5 rounded-xl transition-all duration-200 ${active
                                        ? `${sidebarAccentColor} text-white shadow-lg`
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                                        }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <Icon className={`w-5 h-5 transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'}`} />
                                        <span className="font-semibold text-sm tracking-wide">{item.label}</span>
                                    </div>
                                    {item.badge && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-brand-blue' : 'bg-amber-500 text-white'
                                            }`}>
                                            {item.badge}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-slate-800">
                        <div className="mb-4 px-4 py-3 bg-slate-800/50 rounded-2xl flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold border ${isAccountant ? 'bg-emerald-700 border-emerald-600' : 'bg-slate-700 border-slate-600 text-slate-300'}`}>
                                {user?.email?.charAt(0).toUpperCase()}
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-bold text-slate-200 truncate">{user?.email}</p>
                                <p className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{roleLabel}</p>
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

            <div className="flex-1 flex flex-col min-w-0 max-h-screen">
                <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between lg:hidden flex-shrink-0">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg">
                        <Menu className="w-6 h-6" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-900">نظام إدارة تيبس</h2>
                    <div className="w-10" />
                </header>

                <main className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};
