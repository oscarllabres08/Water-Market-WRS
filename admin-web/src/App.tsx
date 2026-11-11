import { useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { useBusinessAccess } from './auth/useBusinessAccess';
import { AdminLayout } from './layout/AdminLayout';
import { AuthPage } from './pages/AuthPage';
import { CustomersPage } from './pages/CustomersPage';
import { ContainersPage } from './pages/ContainersPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { OrderBoardPage } from './pages/OrderBoardPage';
import { PosPage } from './pages/PosPage';
import { SalesAnalyticsPage as SalesPage } from './pages/SalesAnalyticsPage';
import { StaffPage } from './pages/StaffPage';
import { SettingsPage } from './pages/SettingsPage';
import { EwalletPage } from './pages/EwalletPage';
import {
  LaundryBookingsPage,
  LaundryCustomersPage,
  LaundryDashboardPage,
  LaundryLayout,
  LaundryPosPage,
  LaundryReportsPage,
  LaundryServicesPage,
  LaundrySettingsPage,
  LaundryTransactionsPage,
} from './pages/laundry/LaundryPages';
import {
  OwnerAnalyticsPage,
  OwnerBusinessesPage,
  OwnerDashboardPage,
  OwnerExpensesPage,
  OwnerLayout,
  OwnerReportsPage,
  OwnerSettingsPage,
  OwnerStaffPage,
} from './pages/owner/OwnerPages';
import {
  AboutPage,
  ContactPage,
  HomePage,
  IceCubesPage,
  LaundryPublicPage,
  PublicLayout,
  WaterRefillingPage,
} from './pages/public/PublicPages';

function Gate({
  ready,
  allowed,
  login,
  children,
}: {
  ready: boolean;
  allowed: boolean;
  login: string;
  children: ReactNode;
}) {
  const shown = useRef(false);
  if (ready && allowed) shown.current = true;
  if (!shown.current && !ready) {
    return (
      <div className="auth-loading">
        <p style={{ fontWeight: 700 }}>Loading session…</p>
      </div>
    );
  }
  if (!allowed) return <Navigate to={login} replace />;
  return children;
}

function ProtectedWrs() {
  const { user, loading, profileLoading } = useAuth();
  const access = useBusinessAccess();
  return (
    <Gate ready={!loading && !profileLoading && !access.loading} allowed={Boolean(user && access.wrs)} login="/wrs-management/login">
      <AdminLayout />
    </Gate>
  );
}

function ProtectedLaundry() {
  const { user, loading, profileLoading } = useAuth();
  const access = useBusinessAccess();
  return (
    <Gate ready={!loading && !profileLoading && !access.loading} allowed={Boolean(user && access.laundry)} login="/laundry-management/login">
      <LaundryLayout />
    </Gate>
  );
}

function ProtectedOwner() {
  const { user, loading, profileLoading } = useAuth();
  const access = useBusinessAccess();
  return (
    <Gate ready={!loading && !profileLoading && !access.loading} allowed={Boolean(user && access.owner)} login="/overall-sales/login">
      <OwnerLayout />
    </Gate>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<HomePage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="water-refilling" element={<WaterRefillingPage />} />
        <Route path="ice-cubes" element={<IceCubesPage />} />
        <Route path="laundry" element={<LaundryPublicPage />} />
      </Route>

      <Route path="wrs-management/login" element={<AuthPage portal="wrs" />} />
      <Route path="laundry-management/login" element={<AuthPage portal="laundry" />} />
      <Route path="overall-sales/login" element={<AuthPage portal="owner" />} />
      <Route path="auth" element={<Navigate to="/wrs-management/login" replace />} />

      <Route path="wrs-management" element={<ProtectedWrs />}>
        <Route index element={<DashboardPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="orders" element={<OrderBoardPage mode="water" />} />
        <Route path="ice-orders" element={<OrderBoardPage mode="ice" />} />
        <Route path="delivery" element={<OrderBoardPage mode="delivery" />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="containers" element={<ContainersPage />} />
        <Route path="loyalty" element={<LoyaltyPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="analytics" element={<Navigate to="/wrs-management/sales" replace />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="expenses" element={<ExpensesPage businessUnit="wrs" />} />
        <Route path="ewallet" element={<EwalletPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route path="laundry-management" element={<ProtectedLaundry />}>
        <Route index element={<LaundryDashboardPage />} />
        <Route path="pos" element={<LaundryPosPage />} />
        <Route path="bookings" element={<LaundryBookingsPage />} />
        <Route path="transactions" element={<LaundryTransactionsPage />} />
        <Route path="services" element={<LaundryServicesPage />} />
        <Route path="customers" element={<LaundryCustomersPage />} />
        <Route path="expenses" element={<ExpensesPage businessUnit="laundry" />} />
        <Route path="reports" element={<LaundryReportsPage />} />
        <Route path="settings" element={<LaundrySettingsPage />} />
      </Route>

      <Route path="overall-sales" element={<ProtectedOwner />}>
        <Route index element={<OwnerDashboardPage />} />
        <Route path="businesses" element={<OwnerBusinessesPage />} />
        <Route path="expenses" element={<OwnerExpensesPage />} />
        <Route path="analytics" element={<OwnerAnalyticsPage />} />
        <Route path="reports" element={<OwnerReportsPage />} />
        <Route path="staff" element={<OwnerStaffPage />} />
        <Route path="settings" element={<OwnerSettingsPage />} />
      </Route>

      <Route path="pos" element={<Navigate to="/wrs-management/pos" replace />} />
      <Route path="inventory" element={<Navigate to="/wrs-management/inventory" replace />} />
      <Route path="containers" element={<Navigate to="/wrs-management/containers" replace />} />
      <Route path="loyalty" element={<Navigate to="/wrs-management/loyalty" replace />} />
      <Route path="sales" element={<Navigate to="/wrs-management/sales" replace />} />
      <Route path="analytics" element={<Navigate to="/wrs-management/sales" replace />} />
      <Route path="customers" element={<Navigate to="/wrs-management/customers" replace />} />
      <Route path="expenses" element={<Navigate to="/wrs-management/expenses" replace />} />
      <Route path="staff" element={<Navigate to="/wrs-management/staff" replace />} />
      <Route path="ewallet" element={<Navigate to="/wrs-management/ewallet" replace />} />
      <Route path="settings" element={<Navigate to="/wrs-management/settings" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
