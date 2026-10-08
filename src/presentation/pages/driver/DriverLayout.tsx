import React from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Truck, MapPin, MapPinOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { DriverProvider, useDriver } from './DriverContext';
import { Spinner } from '../../components/ui';
import { cn } from '@presentation/utils/cn';

// "Field Console": the Storefront family (Cairo, sky blue) in Operate mode — high contrast, one job
// per screen, big targets, no decorative glow. Only accounts with profiles.role = 'driver' get in;
// the Storefront's own header and bottom bar are not rendered under /driver.

const DriverGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { user, role, loading } = useAuth();
    const location = useLocation();

    if (loading) return <Spinner />;
    if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
    if (role !== 'driver') {
        return <Navigate to="/" replace />;
    }
    return <>{children}</>;
};

const SharingBadge: React.FC = () => {
    const { sharing, lastSentAt, deliveries } = useDriver();
    const onTheRoad = deliveries.some((d) => d.status === 'shipped');
    if (!onTheRoad) return null;
    const label = sharing === 'sharing' ? `يُشارك موقعك${lastSentAt ? ` · ${lastSentAt.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}` : ''}`
        : sharing === 'denied' ? 'اسمحي للمتصفح بالوصول إلى الموقع'
        : sharing === 'unsupported' ? 'الجهاز لا يدعم تحديد الموقع'
        : sharing === 'error' ? 'تعذر إرسال الموقع' : 'جارٍ تحديد الموقع…';
    const ok = sharing === 'sharing';
    return (
        <p role="status" className={cn('flex items-center gap-1.5 text-xs font-bold', ok ? 'text-status-success-ink' : 'text-status-attention-ink')}>
            {ok ? <MapPin className="w-3.5 h-3.5" /> : <MapPinOff className="w-3.5 h-3.5" />} {label}
        </p>
    );
};

const Shell: React.FC = () => {
    const { profile, error } = useDriver();
    const { signOut } = useAuth();

    return (
        <div className="min-h-screen bg-slate-50/60 pb-safe text-gray-900 font-sans" dir="rtl">
            <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-brand-blue-soft shadow-xs">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
                    <Link to="/driver" className="flex items-center gap-3 group">
                        <div className="bg-white p-1.5 rounded-card border border-brand-blue-soft shadow-card group-hover:shadow-card-glow transition-all">
                            <img src="/logo.PNG" alt="Tips Beauty" className="h-9 sm:h-10 w-auto object-contain" />
                        </div>
                        <div className="border-r border-gray-200 pr-3 mr-1">
                            <div className="flex items-center gap-1.5">
                                <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-brand-blue text-white shadow-xs">
                                    <Truck className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-xs font-black text-gray-900">بوابة المندوب</span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-medium mt-0.5">{profile?.name ?? ''}</p>
                        </div>
                    </Link>

                    <div className="flex items-center gap-2">
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
                <div className="max-w-4xl mx-auto px-4 sm:px-6 pb-2"><SharingBadge /></div>
            </header>
            <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
                {error && <p role="alert" className="mb-4 rounded-control border border-status-danger-ground bg-status-danger-ground p-3.5 text-sm font-bold text-status-danger-ink">{error}</p>}
                <Outlet />
            </main>
        </div>
    );
};

export const DriverLayout: React.FC = () => (
    <DriverGate>
        <DriverProvider>
            <Shell />
        </DriverProvider>
    </DriverGate>
);
