import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from '@presentation/components/layout/Header';
import { Footer } from '@presentation/components/layout/Footer';
import { BottomNav } from '@presentation/components/layout/BottomNav';
import { ErrorBoundary } from '@presentation/components/layout/ErrorBoundary';
import { VerifiedRoute } from '@presentation/components/layout/VerifiedRoute';
import { NativeBridge } from '@presentation/components/layout/NativeBridge';
import { OfflineBanner } from '@presentation/components/layout/OfflineBanner';
import { Spinner } from '@presentation/components/ui';
import { HomePage } from '@presentation/pages/customer/HomePage';
import { useStore } from '@presentation/context/StoreContext';
import { useAuth } from '@presentation/context/AuthContext';

// Home ships in the main bundle (it is the landing page); every other route loads on demand so the
// first paint on a phone is not paying for checkout, orders and the AI chat.
const SearchPage = lazy(() => import('@presentation/pages/customer/SearchPage').then((m) => ({ default: m.SearchPage })));
const ProductDetailsPage = lazy(() => import('@presentation/pages/customer/ProductDetailsPage').then((m) => ({ default: m.ProductDetailsPage })));
const CartPage = lazy(() => import('@presentation/pages/customer/CartPage').then((m) => ({ default: m.CartPage })));
const CheckoutPage = lazy(() => import('@presentation/pages/customer/CheckoutPage').then((m) => ({ default: m.CheckoutPage })));
const MyOrdersPage = lazy(() => import('@presentation/pages/customer/MyOrdersPage').then((m) => ({ default: m.MyOrdersPage })));
const OrderDetailPage = lazy(() => import('@presentation/pages/customer/OrderDetailPage').then((m) => ({ default: m.OrderDetailPage })));
const SettingsPage = lazy(() => import('@presentation/pages/customer/SettingsPage').then((m) => ({ default: m.SettingsPage })));
const ProfilePage = lazy(() => import('@presentation/pages/customer/ProfilePage').then((m) => ({ default: m.ProfilePage })));
const DeleteProfilePage = lazy(() => import('@presentation/pages/customer/DeleteProfilePage').then((m) => ({ default: m.DeleteProfilePage })));
const OffersPage = lazy(() => import('@presentation/pages/customer/OffersPage').then((m) => ({ default: m.OffersPage })));
const NotificationsPage = lazy(() => import('@presentation/pages/customer/NotificationsPage').then((m) => ({ default: m.NotificationsPage })));
const AIChatPage = lazy(() => import('@presentation/pages/customer/AIChatPage').then((m) => ({ default: m.AIChatPage })));
const LoginPage = lazy(() => import('@presentation/pages/auth/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() => import('@presentation/pages/auth/SignupPage').then((m) => ({ default: m.SignupPage })));
const ForgotPasswordPage = lazy(() => import('@presentation/pages/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@presentation/pages/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })));
const AuthCallbackPage = lazy(() => import('@presentation/pages/auth/AuthCallbackPage').then((m) => ({ default: m.AuthCallbackPage })));
const PrivacyPolicyPage = lazy(() => import('@presentation/pages/PrivacyPolicyPage').then((m) => ({ default: m.PrivacyPolicyPage })));
const DriverLayout = lazy(() => import('@presentation/pages/driver/DriverLayout').then((m) => ({ default: m.DriverLayout })));
const DriverHomePage = lazy(() => import('@presentation/pages/driver/DriverHomePage').then((m) => ({ default: m.DriverHomePage })));
const DriverOrderPage = lazy(() => import('@presentation/pages/driver/DriverOrderPage').then((m) => ({ default: m.DriverOrderPage })));
const SupervisorLayout = lazy(() => import('@presentation/pages/supervisor/SupervisorLayout').then((m) => ({ default: m.SupervisorLayout })));
const SupervisorHomePage = lazy(() => import('@presentation/pages/supervisor/SupervisorHomePage').then((m) => ({ default: m.SupervisorHomePage })));
const NotFoundPage = lazy(() => import('@presentation/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })));

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
};

function App() {
  const { cartCount } = useStore();
  const { user, role } = useAuth();
  const location = useLocation();
  const isDriverSurface = location.pathname.startsWith('/driver');
  const isSupervisorSurface = location.pathname.startsWith('/supervisor');

  // Strict role isolation: Drivers and Supervisors cannot access customer storefront pages
  if (user && role === 'driver' && !isDriverSurface) {
    return <Navigate to="/driver" replace />;
  }

  if (user && role === 'warehouse_supervisor' && !isSupervisorSurface) {
    return <Navigate to="/supervisor" replace />;
  }

  // The driver surface is its own shell (no shop header or tab bar); see DriverLayout.
  if (isDriverSurface) {
    return (
      <ErrorBoundary>
        <NativeBridge />
        <OfflineBanner />
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

  if (isSupervisorSurface) {
    return (
      <ErrorBoundary>
        <NativeBridge />
        <OfflineBanner />
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/supervisor" element={<SupervisorLayout />}>
              <Route index element={<SupervisorHomePage />} />
            </Route>
            <Route path="*" element={<Navigate to="/supervisor" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 md:pb-10 font-sans text-gray-900 flex flex-col justify-between" dir="rtl">
      <NativeBridge />
      <OfflineBanner />
      <Header cartCount={cartCount} />
      <main className="flex-1">
        <ErrorBoundary>
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/product/:id" element={<ProductDetailsPage />} />
              <Route path="/cart" element={<CartPage />} />
              <Route path="/offers" element={<OffersPage />} />
              {/* Public: both app stores require a reachable privacy policy URL. */}
              <Route path="/privacy" element={<PrivacyPolicyPage />} />

              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              {/* Google and Apple return web customers here; native builds never use it. */}
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              <Route path="/checkout" element={<ProtectedRoute><VerifiedRoute><CheckoutPage /></VerifiedRoute></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="/orders" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />
              <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
              <Route path="/ai-chat" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
              <Route path="/delete-profile" element={<ProtectedRoute><DeleteProfilePage /></ProtectedRoute>} />

              <Route path="/track-order" element={<Navigate to="/orders" replace />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </main>
      <Footer />
      <BottomNav cartCount={cartCount} />
    </div>
  );
}

export default App;
