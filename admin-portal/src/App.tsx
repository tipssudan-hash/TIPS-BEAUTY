import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AdminLayout } from './layouts/AdminLayout';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { ProductListPage } from './pages/products/ProductListPage';
import { ProductFormPage } from './pages/products/ProductFormPage';
import { OrderListPage } from './pages/orders/OrderListPage';
import { OrderDetailPage } from './pages/orders/OrderDetailPage';
import { InventoryPage } from './pages/InventoryPage';
import { WarehouseCashPage } from './pages/WarehouseCashPage';
import { WarehousesPage } from './pages/WarehousesPage';
import { DeliveryZonesPage } from './pages/DeliveryZonesPage';
import { DriversPage } from './pages/DriversPage';
import { BannersPage } from './pages/BannersPage';
import { CollectionsPage } from './pages/collections/CollectionsPage';
import { CollectionFormPage } from './pages/collections/CollectionFormPage';
import { CouponsPage } from './pages/CouponsPage';
import { AuditLogPage } from './pages/AuditLogPage';
import { AffiliatesPage } from './pages/AffiliatesPage';
import { PromotionsPage } from './pages/PromotionsPage';
import { PromotionFormPage } from './pages/PromotionFormPage';
import { ReviewsPage } from './pages/ReviewsPage';
import { CustomersPage } from './pages/CustomersPage';
import { SettingsPage } from './pages/SettingsPage';
import { DeliveryHealthPage } from './pages/DeliveryHealthPage';
import { DeliveryPricingPage } from './pages/DeliveryPricingPage';
import { ReturnsPage } from './pages/ReturnsPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { BrandsPage } from './pages/BrandsPage';
import { SuppliersPage } from './pages/purchases/SuppliersPage';
import { PurchaseInvoiceListPage } from './pages/purchases/PurchaseInvoiceListPage';
import { PurchaseInvoiceFormPage } from './pages/purchases/PurchaseInvoiceFormPage';
import { SupplierReturnListPage } from './pages/purchases/SupplierReturnListPage';
import { SupplierReturnFormPage } from './pages/purchases/SupplierReturnFormPage';
import { ProfitReportPage } from './pages/ProfitReportPage';
import { DriversMapPage } from './pages/DriversMapPage';
import { NotificationsPage } from './pages/NotificationsPage';
import { useAuth } from './context/AuthContext';

function StaffHome() {
  const { isAdmin } = useAuth();
  return <Navigate to={isAdmin ? '/dashboard' : '/orders'} replace />;
}

function RequireAdmin() {
  const { isAdmin } = useAuth();
  return isAdmin ? <Outlet /> : <Navigate to="/inventory" replace />;
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<AdminLoginPage />} />
      <Route path="/" element={<AdminLayout />}>
        <Route index element={<StaffHome />} />
        <Route path="orders" element={<OrderListPage />} />
        <Route path="orders/:id" element={<OrderDetailPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="warehouse-cash" element={<WarehouseCashPage />} />
        <Route path="suppliers" element={<SuppliersPage />} />
        <Route path="purchases" element={<PurchaseInvoiceListPage />} />
        <Route path="purchases/new" element={<PurchaseInvoiceFormPage />} />
        <Route path="purchases/:id" element={<PurchaseInvoiceFormPage />} />
        <Route path="supplier-returns" element={<SupplierReturnListPage />} />
        <Route path="supplier-returns/new" element={<SupplierReturnFormPage />} />
        <Route path="supplier-returns/:id" element={<SupplierReturnFormPage />} />
        <Route path="drivers/map" element={<DriversMapPage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route element={<RequireAdmin />}>
          <Route path="reports/profit" element={<ProfitReportPage />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="returns" element={<ReturnsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="products" element={<ProductListPage />} />
          <Route path="products/new" element={<ProductFormPage />} />
          <Route path="products/edit/:id" element={<ProductFormPage />} />
          <Route path="categories" element={<CategoriesPage />} />
          <Route path="brands" element={<BrandsPage />} />
          <Route path="warehouses" element={<WarehousesPage />} />
          <Route path="delivery-zones" element={<DeliveryZonesPage />} />
          <Route path="delivery-pricing" element={<DeliveryPricingPage />} />
          <Route path="drivers" element={<DriversPage />} />
          <Route path="banners" element={<BannersPage />} />
          <Route path="collections" element={<CollectionsPage />} />
          <Route path="collections/new" element={<CollectionFormPage />} />
          <Route path="collections/edit/:id" element={<CollectionFormPage />} />
          <Route path="coupons" element={<CouponsPage />} />
          <Route path="audit" element={<AuditLogPage />} />
          <Route path="affiliates" element={<AffiliatesPage />} />
          <Route path="promotions" element={<PromotionsPage />} />
          <Route path="promotions/new" element={<PromotionFormPage />} />
          <Route path="promotions/edit/:id" element={<PromotionFormPage />} />
          <Route path="reviews" element={<ReviewsPage />} />
          <Route path="delivery-health" element={<DeliveryHealthPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
