import React, { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { StoreProvider, useStore } from '../../context/StoreContext';
import { Header } from './Header';
import { Footer } from './Footer';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from './ErrorBoundary';
import { NativeBridge } from './NativeBridge';
import { OfflineBanner } from './OfflineBanner';
import { CartNotificationToast } from '../ui/CartNotificationToast';
import { Spinner } from '../ui';

// The storefront shell and its Cart/catalogue state. Only customer routes mount it, so driver and
// supervisor screens never load the catalogue.
const StoreNoticeToast: React.FC = () => {
    const { storeNotice, dismissStoreNotice } = useStore();
    if (!storeNotice) return null;
    return (
        <div role="status" className="fixed bottom-24 md:bottom-6 inset-x-4 z-50 mx-auto max-w-sm bg-gray-900 text-white text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3 shadow-lg">
            <span>{storeNotice}</span>
            <button type="button" onClick={dismissStoreNotice} aria-label="إغلاق التنبيه" className="text-gray-300 hover:text-white font-bold shrink-0">✕</button>
        </div>
    );
};

const CustomerShell: React.FC = () => {
    const { cartCount } = useStore();
    return (
        <div className="min-h-screen bg-gray-50/50 pb-20 md:pb-10 font-sans text-gray-900 flex flex-col justify-between" dir="rtl">
            <NativeBridge />
            <OfflineBanner />
            <Header cartCount={cartCount} />
            <main className="flex-1">
                <ErrorBoundary>
                    <Suspense fallback={<Spinner />}>
                        <Outlet />
                    </Suspense>
                </ErrorBoundary>
            </main>
            <Footer />
            <CartNotificationToast />
            <StoreNoticeToast />
            <BottomNav cartCount={cartCount} />
        </div>
    );
};

export const CustomerLayout: React.FC = () => (
    <StoreProvider>
        <CustomerShell />
    </StoreProvider>
);
