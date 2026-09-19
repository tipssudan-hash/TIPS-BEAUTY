import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header } from './src/components/layout/Header';
import { HomePage } from './src/pages/customer/HomePage';
import { ProductDetailsPage } from './src/pages/customer/ProductDetailsPage';
import { CartPage } from './src/pages/customer/CartPage';
import { CheckoutPage } from './src/pages/customer/CheckoutPage';
import { MyOrdersPage } from './src/pages/customer/MyOrdersPage';
import { OrderDetailPage } from './src/pages/customer/OrderDetailPage';
import { SettingsPage } from './src/pages/customer/SettingsPage';
import { AIChatPage } from './src/pages/customer/AIChatPage';
import { useStore } from './src/context/StoreContext';
import { LoginPage } from './src/pages/auth/LoginPage';
import { SignupPage } from './src/pages/auth/SignupPage';
import { useAuth } from './src/context/AuthContext';
import { Loader2 } from 'lucide-react';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <>{children}</>;
};

function App() {
  const { cartCount } = useStore();

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20 font-sans text-gray-900" dir="rtl">
      <Header cartCount={cartCount} />
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/product/:id" element={<ProductDetailsPage />} />
          <Route path="/cart" element={<CartPage />} />

          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          <Route path="/checkout" element={<ProtectedRoute><CheckoutPage /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><MyOrdersPage /></ProtectedRoute>} />
          <Route path="/orders/:id" element={<ProtectedRoute><OrderDetailPage /></ProtectedRoute>} />
          <Route path="/ai-chat" element={<ProtectedRoute><AIChatPage /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

          <Route path="/track-order" element={<Navigate to="/orders" replace />} />
          <Route path="*" element={<div className="p-10 text-center">الصفحة غير موجودة</div>} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
