import { useEffect, useRef, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { useAuth } from './auth/AuthProvider';
import { IDLE_LIMIT_MS, isPortalPath, isStaffArea } from './auth/portalGuard';
import { useBusinessAccess } from './auth/useBusinessAccess';
import { AdminLayout } from './layout/AdminLayout';
import { AuthPage } from './pages/AuthPage';
import { CustomersPage } from './pages/CustomersPage';
import { ContainersPage } from './pages/ContainersPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { DashboardPage } from './pages/DashboardPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoyaltyPage } from './pages/LoyaltyPage';
import { DeliveryManagementPage } from './pages/DeliveryManagementPage';
import { OrderBoardPage } from './pages/OrderBoardPage';
import { PosPage } from './pages/PosPage';
import { SalesAnalyticsPage as SalesPage } from './pages/SalesAnalyticsPage';
import { StaffPage } from './pages/StaffPage';
import { StaffAccountPage } from './pages/StaffAccountPage';
import { SettingsPage } from './pages/SettingsPage';
import { EwalletPage } from './pages/EwalletPage';
import {
  LaundryBookingsPage,
  LaundryCustomersPage,
  LaundryDashboardPage,
  LaundryLayout,
  LaundryPosPage,
  LaundrySalesPage,
  LaundryServicesPage,
  LaundrySettingsPage,
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
  const location = useLocation();
  const shown = useRef(false);
  if (ready && allowed) shown.current = true;
  if (!shown.current && !ready) {
    return (
      <div className="auth-loading">
        <p style={{ fontWeight: 700 }}>Loading session…</p>
      </div>
    );
  }
  if (!allowed) {
    const from = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={login} replace state={{ from }} />;
  }
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

function StaffShortcut({ to }: { to: string }) {
  const { user, loading, profileLoading } = useAuth();
  const access = useBusinessAccess();
  const ready = !loading && !profileLoading && (!user || !access.loading);
  if (!ready) {
    return (
      <div className="auth-loading">
        <p style={{ fontWeight: 700 }}>Loading session…</p>
      </div>
    );
  }
  if (user && access.wrs) return <Navigate to={to} replace />;
  return <Navigate to="/" replace />;
}

function PortalHead() {
  const { pathname } = useLocation();
  useEffect(() => {
    let meta = document.querySelector('meta[name="robots"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'robots');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', isPortalPath(pathname) ? 'noindex, nofollow' : 'index, follow');
  }, [pathname]);
  return null;
}

function AdminSessionGuard() {
  const { user, signOutWithNotice } = useAuth();
  const { pathname } = useLocation();
  const signOutRef = useRef(signOutWithNotice);
  signOutRef.current = signOutWithNotice;
  const onDuty = Boolean(user) && isStaffArea(pathname);

  useEffect(() => {
    if (!onDuty) return;
    let timer = 0;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void signOutRef.current('You were signed out after a period of inactivity. Sign in again to continue.');
      }, IDLE_LIMIT_MS);
    };
    arm();
    const events = ['pointerdown', 'keydown', 'scroll'] as const;
    for (const event of events) window.addEventListener(event, arm, { passive: true });
    return () => {
      window.clearTimeout(timer);
      for (const event of events) window.removeEventListener(event, arm);
    };
  }, [onDuty]);

  return null;
}

export default function App() {
  return (
    <>
    <PortalHead />
    <AdminSessionGuard />
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
      <Route path="auth" element={<Navigate to="/" replace />} />

      <Route path="wrs-management" element={<ProtectedWrs />}>
        <Route index element={<DashboardPage />} />
        <Route path="staff" element={<StaffPage />} />
        <Route path="staff-accounts" element={<StaffAccountPage />} />
        <Route path="pos" element={<PosPage />} />
        <Route path="orders" element={<Navigate to="/wrs-management/delivery" replace />} />
        <Route path="ice-orders" element={<OrderBoardPage mode="ice" />} />
        <Route path="delivery" element={<DeliveryManagementPage />} />
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
        <Route path="transactions" element={<Navigate to="/laundry-management/sales" replace />} />
        <Route path="services" element={<LaundryServicesPage />} />
        <Route path="sales" element={<LaundrySalesPage />} />
        <Route path="customers" element={<LaundryCustomersPage />} />
        <Route path="expenses" element={<ExpensesPage businessUnit="laundry" />} />
        <Route path="reports" element={<Navigate to="/laundry-management/sales" replace />} />
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

      <Route path="pos" element={<StaffShortcut to="/wrs-management/pos" />} />
      <Route path="inventory" element={<StaffShortcut to="/wrs-management/inventory" />} />
      <Route path="containers" element={<StaffShortcut to="/wrs-management/containers" />} />
      <Route path="loyalty" element={<StaffShortcut to="/wrs-management/loyalty" />} />
      <Route path="sales" element={<StaffShortcut to="/wrs-management/sales" />} />
      <Route path="analytics" element={<StaffShortcut to="/wrs-management/sales" />} />
      <Route path="customers" element={<StaffShortcut to="/wrs-management/customers" />} />
      <Route path="expenses" element={<StaffShortcut to="/wrs-management/expenses" />} />
      <Route path="staff" element={<StaffShortcut to="/wrs-management/staff" />} />
      <Route path="ewallet" element={<StaffShortcut to="/wrs-management/ewallet" />} />
      <Route path="settings" element={<StaffShortcut to="/wrs-management/settings" />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
