import React, { useEffect, useState } from 'react';
import { Outlet, Link, useLocation, Navigate } from 'react-router-dom';
import {
    LayoutDashboard, Package, LogOut, Menu, X, Loader2,
    ShoppingBag, Settings, Truck, Boxes, Warehouse, MapPin, Image, MessageSquare, Radio, Layers, Ticket, Percent, Users, Megaphone, Gauge, Undo2, Banknote, FolderTree, Tag,
    FileText, Building2, PackageX, TrendingUp, Bell, ClipboardList, MapPinned, ScrollText
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useUnseenOrders } from '../hooks/useUnseenOrders';
import { useOrdersNeedingActionCount } from '../hooks/useOrdersNeedingActionCount';
import { useUnreadStaffNotifications } from '../hooks/useUnreadStaffNotifications';
import { useFocusTrap } from '../hooks/useFocusTrap';

// Below `lg:` (1024px) the sidebar renders as a modal drawer over the page and should trap
// focus; at `lg:` and above it's permanently docked in normal flow, and trapping focus there
// would break keyboard navigation into the rest of the app.
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

export const AdminLayout: React.FC = () => {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const isBelowLg = useIsBelowLg();
    const closeSidebar = React.useCallback(() => setSidebarOpen(false), []);
    const sidebarRef = useFocusTrap<HTMLElement>(sidebarOpen && isBelowLg, closeSidebar);
    const location = useLocation();
    const { user, isAdmin, isWarehouseManager, managedWarehouses, loading, signOut } = useAuth();
    const { count: unseenOrders } = useUnseenOrders();
    const actionCount = useOrdersNeedingActionCount();
    const unreadNotifications = useUnreadStaffNotifications();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <Loader2 className="w-10 h-10 animate-spin text-red-500" />
            </div>
        );
    }

    if (!user || !(isAdmin || isWarehouseManager)) {
        return <Navigate to="/login" replace />;
    }

    const menuItems: { path: string; icon: typeof LayoutDashboard; label: string; badge: string | null; access: 'admin' | 'staff' }[] = [
        { path: '/dashboard', icon: LayoutDashboard, label: 'لوحة التحكم', badge: null, access: 'admin' },
        { path: '/reports/profit', icon: TrendingUp, label: 'تقرير الأرباح', badge: null, access: 'admin' },
        { path: '/orders', icon: ShoppingBag, label: 'الطلبات', badge: unseenOrders > 0 ? String(unseenOrders) : null, access: 'staff' },
        { path: '/orders?view=action', icon: ClipboardList, label: 'يحتاج إجراء', badge: actionCount > 0 ? String(actionCount) : null, access: 'staff' },
        { path: '/drivers/map', icon: MapPinned, label: 'خريطة المناديب', badge: null, access: 'staff' },
        { path: '/notifications', icon: Bell, label: 'التنبيهات', badge: unreadNotifications > 0 ? String(unreadNotifications) : null, access: 'staff' },
        { path: '/returns', icon: Undo2, label: 'المرتجعات', badge: null, access: 'admin' },
        { path: '/customers', icon: Users, label: 'العملاء', badge: null, access: 'admin' },
        { path: '/products', icon: Package, label: 'المنتجات', badge: null, access: 'admin' },
        { path: '/categories', icon: FolderTree, label: 'التصنيفات', badge: null, access: 'admin' },
        { path: '/brands', icon: Tag, label: 'العلامات التجارية', badge: null, access: 'admin' },
        { path: '/inventory', icon: Boxes, label: 'المخزون', badge: null, access: 'staff' },
        { path: '/warehouse-cash', icon: Banknote, label: 'تسويات النقد', badge: null, access: 'staff' },
        { path: '/purchases', icon: FileText, label: 'فواتير الشراء', badge: null, access: 'staff' },
        { path: '/suppliers', icon: Building2, label: 'الموردون', badge: null, access: 'staff' },
        { path: '/supplier-returns', icon: PackageX, label: 'مرتجعات الموردين', badge: null, access: 'staff' },
        { path: '/warehouses', icon: Warehouse, label: 'المخازن', badge: null, access: 'admin' },
        { path: '/delivery-zones', icon: MapPin, label: 'محليات التوصيل', badge: null, access: 'admin' },
        { path: '/delivery-pricing', icon: Gauge, label: 'تسعير التوصيل الديناميكي', badge: null, access: 'admin' },
        { path: '/drivers', icon: Truck, label: 'المندوبون', badge: null, access: 'admin' },
        { path: '/banners', icon: Image, label: 'البانرات', badge: null, access: 'admin' },
        { path: '/collections', icon: Layers, label: 'التشكيلات', badge: null, access: 'admin' },
        { path: '/coupons', icon: Ticket, label: 'أكواد الخصم', badge: null, access: 'admin' },
        { path: '/affiliates', icon: Megaphone, label: 'المسوقون والعمولات', badge: null, access: 'admin' },
        { path: '/promotions', icon: Percent, label: 'العروض', badge: null, access: 'admin' },
        { path: '/reviews', icon: MessageSquare, label: 'التقييمات', badge: null, access: 'admin' },
        { path: '/delivery-health', icon: Radio, label: 'حالة الإشعارات', badge: null, access: 'admin' },
        { path: '/audit', icon: ScrollText, label: 'سجل التدقيق', badge: null, access: 'admin' },
{ path: '/settings', icon: Settings, label: 'الإعدادات', badge: null, access: 'admin' },
    ];

    const visibleMenuItems = menuItems.filter((item) => item.access === 'staff' || isAdmin);
    const warehouseNames = managedWarehouses.map((w) => w.name).join('، ');
    const roleLabel = isAdmin ? 'مدير النظام' : 'مدير المستودع';

    const isActive = (path: string) => {
        const [pathname, query] = path.split('?');
        if (query) return location.pathname === pathname && location.search.includes(query);
        if (pathname === '/orders' && location.search.includes('view=action')) return false;
        if (pathname === '/drivers' && location.pathname === '/drivers/map') return false;
        return location.pathname === pathname || location.pathname.startsWith(pathname + '/');
    };

    return (
        <div className="min-h-screen bg-slate-50 flex font-sans text-slate-900" dir="rtl">
            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40 lg:hidden"
                    onClick={closeSidebar}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar */}
            <aside
                ref={sidebarRef}
                role="dialog"
                aria-modal={sidebarOpen && isBelowLg ? true : undefined}
                aria-label="القائمة الرئيسية"
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
                                <p className="text-[10px] tracking-widest text-slate-400 font-bold truncate">
                                    {isAdmin ? 'لوحة الإدارة' : `${roleLabel}: ${warehouseNames || '—'}`}
                                </p>
                            </div>
                        </div>
                        <button onClick={closeSidebar} aria-label="إغلاق القائمة" className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 px-4 py-8 space-y-1 overflow-y-auto custom-scrollbar">
                        {visibleMenuItems.map((item) => {
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
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${active ? 'bg-white text-brand-blue' : 'bg-amber-500 text-white'
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

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col min-w-0 max-h-screen">
                {/* Header (Mobile) */}
                <header className="h-20 bg-white border-b border-slate-200 px-6 flex items-center justify-between lg:hidden flex-shrink-0">
                    <button onClick={() => setSidebarOpen(true)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-lg">
                        <Menu className="w-6 h-6" />
                    </button>
                    <h2 className="text-lg font-bold text-slate-900">نظام إدارة تيبس</h2>
                    <Link
                        to="/notifications"
                        aria-label={unreadNotifications > 0 ? `التنبيهات، ${unreadNotifications} جديد` : 'التنبيهات'}
                        className="relative p-2 text-slate-600 hover:bg-slate-50 rounded-lg"
                    >
                        <Bell className="w-6 h-6" />
                        {unreadNotifications > 0 && (
                            <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-black flex items-center justify-center">
                                {unreadNotifications}
                            </span>
                        )}
                    </Link>
                </header>

                {/* Dashboard Viewport */}
                <main className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
                    <div className="max-w-[1600px] mx-auto p-4 md:p-8 lg:p-10">
                        <Outlet />
                    </div>
                </main>
            </div>
        </div>
    );
};

