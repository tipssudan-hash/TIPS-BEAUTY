import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './src/components/layout/Header';
import { BottomNav } from './src/components/layout/BottomNav';
import { ErrorBoundary } from './src/components/layout/ErrorBoundary';
import { VerifiedRoute } from './src/components/layout/VerifiedRoute';
import { Spinner } from './src/components/ui';
import { HomePage } from './src/pages/customer/HomePage';
import { useStore } from './src/context/StoreContext';
import { useAuth } from './src/context/AuthContext';

// Home ships in the main bundle (it is the landing page); every other route loads on demand so the
// first paint on a phone is not paying for checkout, orders and the AI chat.
const SearchPage = lazy(() => import('./src/pages/customer/SearchPage').then((m) => ({ default: m.SearchPage })));
const ProductDetailsPage = lazy(() => import('./src/pages/customer/ProductDetailsPage').then((m) => ({ default: m.ProductDetailsPage })));
const CartPage = lazy(() => import('./src/pages/customer/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('./src/pages/customer/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const MyOrdersPage = lazy(() => import('./src/pages/customer/MyOrdersPage').then((m) => ({ default: m.MyOrdersPage })));
const OrderDetailPage = lazy(() => import('./src/pages/customer/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const SettingsPage = lazy(() => import('./src/pages/customer/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const OffersPage = lazy(() => import('./src/pages/customer/OffersPage').then((m) => ({ default: m.OffersPage })));
const NotificationsPage = lazy(() => import('./src/pages/customer/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const AIChatPage = lazy(() => import('./src/pages/customer/AIChatPage').then((m) => ({ default: m.AIChatPage })));
const LoginPage = lazy(() => import('./src/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('./src/pages/auth/SignupPage').then((m) => ({ default: m.SignupPage })));
const DriverLayout = lazy(() => import('./src/pages/driver/DriverLayout').then((m) => ({ default: m.DriverLayout })));
const DriverHomePage = lazy(() => import('./src/pages/driver/DriverHomePage').then((m) => ({ default: m.DriverHomePage })));
const DriverOrderPage = lazy(() => import('./src/pages/driver/DriverOrderPage').then((m) => ({ default: m.DriverOrderPage })));
const NotFoundPage = lazy(() => import('./src/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
};

function App() {
  const { cartCount } = useStore();
  const isDriverSurface = useLocation().pathname.startsWith('/driver');

  // The driver surface is its own shell (no shop header or tab bar); see DriverLayout.
  if (isDriverSurface) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/driver" element={<DriverLayout />}>
              <Route index element={<DriverHomePage />} />
              <Route path="orders/:id" element={<DriverOrderPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/driver" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 font-sans text-gray-900" dir="rtl">
      <Header cartCount={cartCount} />
      <main>
        <ErrorBoundary>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/product/:id" element={<ProductDetailsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/offers" element={<OffersPage />} />

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />

              <Route path="/checkout" element={<ProtectedRoute><VerifiedRoute><CheckoutPage /></VerifiedRoute></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />
              <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
              <Route path="/ai-chat" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

              <Route path="/track-order" element={<Navigate to="/orders" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <BottomNav cartCount={cartCount} />
    </div>
  );
}

export default App;
