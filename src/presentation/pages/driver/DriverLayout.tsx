import React, { useEffect, useState } from 'react';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Truck, MapPin, MapPinOff, Loader2 } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '@infrastructure/supabase';
import { DriverProvider, useDriver } from './DriverContext';
import { Spinner, EmptyState } from '../../components/ui';
import { cn } from '@presentation/utils/cn';

// "Field Console": the Storefront family (Cairo, sky blue) in Operate mode — high contrast, one job
// per screen, big targets, no decorative glow. Only accounts with profiles.role = 'driver' get in;
// the Storefront's own header and bottom bar are not rendered under /driver.

const DriverGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    if (role !== 'driver') {
        return (
            <div className="max-w-md mx-auto p-6">
                <EmptyState icon={<Truck className="w-7 h-7" />} title="هذه البوابة للمندوبين" body="حسابك ليس مرتبطاً بمندوب. إن كنت مندوباً، اطلبي من الإدارة ربط حسابك." action={<Link to="/" className="text-brand-blue font-bold text-sm hover:underline">العودة للمتجر</Link>} />
            </div>
        );
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
    const { profile, setOnline, error } = useDriver();
    const { signOut } = useAuth();
    const [toggling, setToggling] = useState(false);
    const online = profile ? profile.status !== 'offline' : false;

    const toggle = async () => {
        setToggling(true);
        try { await setOnline(!online); } catch (err) { console.error('set_driver_availability', err); } finally { setToggling(false); }
    };

    return (
        <div className="min-h-screen bg-gray-50 pb-safe text-gray-900" dir="rtl">
            <header className="sticky top-0 z-40 bg-white border-b border-gray-200">
                <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
                    <Link to="/driver" className="flex items-center gap-2 font-bold text-gray-900">
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-blue text-white"><Truck className="w-5 h-5" /></span>
                        <span className="leading-tight"><span className="block text-sm">بوابة المندوب</span><span className="block text-xs text-gray-500 font-medium">{profile?.name ?? ''}</span></span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => void toggle()}
                            disabled={toggling || !profile}
                            aria-pressed={online}
                            className={cn('min-h-11 rounded-xl px-4 text-sm font-bold transition-colors disabled:opacity-50', online ? 'bg-status-success-ground text-status-success-ink' : 'bg-gray-200 text-gray-700')}
                        >
                            {toggling ? <Loader2 className="w-4 h-4 animate-spin" /> : online ? 'متاح' : 'غير متاح'}
                        </button>
                        <button type="button" onClick={() => void signOut()} aria-label="تسجيل الخروج" className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100"><LogOut className="w-5 h-5" /></button>
                    </div>
                </div>
                <div className="max-w-2xl mx-auto px-4 pb-2"><SharingBadge /></div>
            </header>
            <main className="max-w-2xl mx-auto px-4 py-4">
                {error && <p role="alert" className="mb-4 rounded-xl border border-status-danger-ground bg-status-danger-ground p-3 text-sm font-bold text-status-danger-ink">{error}</p>}
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
