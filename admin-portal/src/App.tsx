import { Routes, Route, Navigate } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProductListPage } from './pages/products/ProductListPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { OrderListPage } from './pages/orders/OrderListPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { InventoryPage } from './pages/InventoryPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { DeliveryZonesPage } from './pages/DeliveryZonesPage';
import { DriversPage } from './pages/DriversPage';
import { BannersPage } from './pages/BannersPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { CollectionFormPage } from './pages/collections/CollectionFormPage';
import { CouponsPage } from './pages/CouponsPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { SettingsPage } from './pages/SettingsPage';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="orders" element={<OrderListPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="products" element={<ProductListPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/edit/:id" element={<ProductFormPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="warehouses" element={<WarehousesPage />} />
        <Route path="delivery-zones" element={<DeliveryZonesPage />} />
        <Route path="drivers" element={<DriversPage />} />
        <Route path="banners" element={<BannersPage />} />
        <Route path="collections" element={<CollectionsPage />} />
        <Route path="collections/new" element={<CollectionFormPage />} />
        <Route path="collections/edit/:id" element={<CollectionFormPage />} />
        <Route path="coupons" element={<CouponsPage />} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

export default App;
