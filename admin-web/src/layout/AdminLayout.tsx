import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { AdminNotificationsButton } from '../components/AdminNotificationsButton';
import { PendingOrderReminderBanner } from '../components/PendingOrderReminderBanner';
import { usePendingOrderReminder } from '../hooks/usePendingOrderReminder';
import { supabase } from '../lib/supabase';
import { useTheme } from '../theme/ThemeProvider';

type NavIconId =
  | 'dashboard'
  | 'pos'
  | 'orders'
  | 'ice'
  | 'delivery'
  | 'inventory'
  | 'containers'
  | 'sales'
  | 'loyalty'
  | 'customers'
  | 'riders'
  | 'expenses'
  | 'staff'
  | 'settings'
  | 'signout';

const STORE_OPEN_KEY = 'watermarket-store-open';

function NavIcon({ id }: { id: NavIconId }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  switch (id) {
    case 'dashboard':
      return (
        <svg {...common}>
          <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'pos':
      return (
        <svg {...common}>
          <circle cx="9" cy="20" r="1.2" fill="currentColor" />
          <circle cx="18" cy="20" r="1.2" fill="currentColor" />
          <path d="M3 4h2l2.2 11h11.3l2-7H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'orders':
      return (
        <svg {...common}>
          <path d="M7 3.5h7l4 4V20a1.5 1.5 0 01-1.5 1.5h-9.5A1.5 1.5 0 015.5 20V5A1.5 1.5 0 017 3.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M14 3.8V8h4.2M8.5 12h7M8.5 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'ice':
      return (
        <svg {...common}>
          <path d="M12 3.2 17 6v5.2L12 14.2 7 11.2V6L12 3.2z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 14.2V21M7 11.2 3.8 17M17 11.2 20.2 17M12 7.4v4.6M9.4 9.2h5.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'delivery':
      return (
        <svg {...common}>
          <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <circle cx="7" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17" cy="17.5" r="1.6" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'riders':
      return (
        <svg {...common}>
          <circle cx="6.5" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="17.5" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M6.5 17h4l2.2-5H16l2 3.2M8.5 8.5h3.2L14 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15.2" cy="6.2" r="1.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
    case 'inventory':
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      );
    case 'containers':
      return (
        <svg {...common}>
          <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="12" cy="15" r="3" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
    case 'sales':
      return (
        <svg {...common}>
          <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M7 15l3.2-4 3 2.2L18 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'loyalty':
      return (
        <svg {...common}>
          <path d="M12 3l1.6 4.6H18l-3.6 2.8 1.4 4.6L12 12.8 8.2 15l1.4-4.6L6 7.6h4.4L12 3z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      );
    case 'customers':
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'expenses':
      return (
        <svg {...common}>
          <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'staff':
      return (
        <svg {...common}>
          <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3.8 18.5c.4-2.8 2.4-4.3 5.2-4.3s4.8 1.5 5.2 4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16.5" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M15 18.5c.3-1.8 1.4-3 3.2-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M12 3.5v2M12 18.5v2M4.8 6.2l1.4 1.4M17.8 16.4l1.4 1.4M3.5 12h2M18.5 12h2M4.8 17.8l1.4-1.4M17.8 7.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'signout':
      return (
        <svg {...common}>
          <path d="M10 7V5a2 2 0 012-2h7v18h-7a2 2 0 01-2-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <path d="M15 12H4m0 0l3-3m-3 3l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      {open ? (
        <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      ) : (
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  );
}

const NAV = [
  { to: '/wrs-management', label: 'Dashboard', end: true, icon: 'dashboard' as const },
  { to: '/wrs-management/pos', label: 'POS', icon: 'pos' as const },
  { to: '/wrs-management/orders', label: 'Water Online Orders', icon: 'orders' as const },
  { to: '/wrs-management/ice-orders', label: 'Ice Order Management', icon: 'ice' as const },
  { to: '/wrs-management/delivery', label: 'Delivery Management', icon: 'delivery' as const },
  { to: '/wrs-management/inventory', label: 'Inventory', icon: 'inventory' as const },
  { to: '/wrs-management/customers', label: 'Customers', icon: 'customers' as const },
  { to: '/wrs-management/staff', label: 'Riders', icon: 'riders' as const, ownerOnly: true },
  { to: '/wrs-management/sales', label: 'Reports', icon: 'sales' as const },
  { to: '/wrs-management/containers', label: 'Containers', icon: 'containers' as const },
  { to: '/wrs-management/loyalty', label: 'Loyalty Points', icon: 'loyalty' as const },
  { to: '/wrs-management/expenses', label: 'Expenses', icon: 'expenses' as const },
] as const;

const PAGE_TITLES: { match: (path: string) => boolean; label: string }[] = [
  { match: (p) => p === '/wrs-management', label: 'Dashboard' },
  { match: (p) => p.startsWith('/wrs-management/pos'), label: 'POS' },
  { match: (p) => p.startsWith('/wrs-management/orders'), label: 'Water Online Orders' },
  { match: (p) => p.startsWith('/wrs-management/ice-orders'), label: 'Ice Order Management' },
  { match: (p) => p.startsWith('/wrs-management/delivery'), label: 'Delivery Management' },
  { match: (p) => p.startsWith('/wrs-management/inventory'), label: 'Inventory' },
  { match: (p) => p.startsWith('/wrs-management/containers'), label: 'Containers' },
  { match: (p) => p.startsWith('/wrs-management/sales'), label: 'Reports' },
  { match: (p) => p.startsWith('/wrs-management/loyalty'), label: 'Loyalty Points' },
  { match: (p) => p.startsWith('/wrs-management/customers'), label: 'Customers' },
  { match: (p) => p.startsWith('/wrs-management/expenses'), label: 'Expenses' },
  { match: (p) => p.startsWith('/wrs-management/staff'), label: 'Riders' },
  { match: (p) => p.startsWith('/wrs-management/ewallet'), label: 'E-wallet' },
  { match: (p) => p.startsWith('/wrs-management/settings'), label: 'Settings' },
];

function readStoreOpen() {
  try {
    const stored = localStorage.getItem(STORE_OPEN_KEY) ?? localStorage.getItem('water-chaste-store-open');
    return stored !== 'closed';
  } catch {
    return true;
  }
}

export function AdminLayout() {
  const { user, profile, businessId, signOut, isStoreOwner } = useAuth();
  const { darkMode, toggleDarkMode } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingWater, setPendingWater] = useState(0);
  const [pendingIce, setPendingIce] = useState(0);
  const [pendingStaff, setPendingStaff] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(location.pathname.startsWith('/settings'));
  const [storeOpen, setStoreOpen] = useState(readStoreOpen);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const settingsMenuRef = useRef<HTMLDivElement>(null);
  const { visibleOrders, dismissBanner } = usePendingOrderReminder(businessId);

  const wideMain =
    location.pathname === '/wrs-management/pos' ||
    location.pathname === '/wrs-management/inventory' ||
    location.pathname === '/wrs-management/sales' ||
    location.pathname === '/wrs-management/orders' ||
    location.pathname === '/wrs-management/ice-orders' ||
    location.pathname === '/wrs-management/delivery' ||
    location.pathname === '/wrs-management/containers' ||
    location.pathname.startsWith('/wrs-management/settings');

  const settingsSection = new URLSearchParams(location.search).get('section');
  const pageLabel = PAGE_TITLES.find((item) => item.match(location.pathname))?.label ?? 'Workspace';

  useEffect(() => {
    setNavOpen(false);
    if (location.pathname.startsWith('/wrs-management/settings')) setSettingsOpen(true);
  }, [location.pathname]);

  useLayoutEffect(() => {
    if (!settingsOpen) return;
    const node = settingsMenuRef.current;
    const scroller = node?.closest('.admin-sidebar-body');
    if (!node || !(scroller instanceof HTMLElement)) return;
    const extra = node.getBoundingClientRect().bottom - scroller.getBoundingClientRect().bottom;
    if (extra > 0) scroller.scrollTop += extra + 12;
  }, [settingsOpen, navOpen]);

  useEffect(() => {
    if (!navOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [navOpen]);

  const loadPending = useCallback(async () => {
    if (!businessId) return;
    const pendingOrdersQuery = supabase
      .from('orders')
      .select('id, order_items(products(category))')
      .eq('seller_id', businessId)
      .eq('status', 'pending');
    const pendingStaffQuery = supabase
      .from('profiles')
      .select('user_id', { count: 'exact', head: true })
      .eq('seller_workspace_owner_id', businessId)
      .eq('seller_team_role', 'staff')
      .eq('seller_join_status', 'pending');
    const [ordersRes, staffRes] = await Promise.all([pendingOrdersQuery, pendingStaffQuery]);
    if (!ordersRes.error) {
      let water = 0;
      let ice = 0;
      for (const order of ordersRes.data ?? []) {
        const items = (order.order_items ?? []) as { products: { category: string } | { category: string }[] | null }[];
        const categories = items.map((item) => {
          const product = item.products;
          if (Array.isArray(product)) return product[0]?.category ?? '';
          return product?.category ?? '';
        });
        const hasIce = categories.some((category) => category === 'ice');
        const hasOther = categories.some((category) => category !== 'ice');
        if (hasIce) ice += 1;
        if (!(hasIce && !hasOther)) water += 1;
      }
      setPendingWater(water);
      setPendingIce(ice);
    }
    if (!staffRes.error) setPendingStaff(staffRes.count ?? 0);
  }, [businessId]);

  useEffect(() => {
    void loadPending();
    if (!businessId) return;
    const ch = supabase
      .channel(`admin-pending-${businessId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `seller_id=eq.${businessId}` },
        () => void loadPending()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `seller_workspace_owner_id=eq.${businessId}` },
        () => void loadPending()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [businessId, loadPending]);

  async function handleSignOut() {
    await signOut();
    navigate('/wrs-management/login', { replace: true });
  }

  function setStoreStatus(open: boolean) {
    setStoreOpen(open);
    setStoreMenuOpen(false);
    try {
      localStorage.setItem(STORE_OPEN_KEY, open ? 'open' : 'closed');
    } catch {
      /* ignore */
    }
  }

  const displayName = profile?.display_name?.trim() || user?.email || 'Store owner';
  const todayLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className={`admin-shell${navOpen ? ' admin-shell--nav-open' : ''}`}>
      <header className="admin-mobile-bar">
        <button
          type="button"
          className="admin-menu-btn"
          aria-expanded={navOpen}
          aria-controls="admin-sidebar"
          aria-label={navOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setNavOpen((v) => !v)}
        >
          <MenuIcon open={navOpen} />
        </button>
        <div className="admin-mobile-bar-brand">
          <img src="/logo.png" alt="" className="admin-mobile-bar-logo" />
          <div className="admin-mobile-bar-text">
            <span className="admin-mobile-bar-title">WaterMarket</span>
            <span className="admin-mobile-bar-page">{pageLabel}</span>
          </div>
        </div>
        <div className="admin-mobile-bar-actions">
          <AdminNotificationsButton placement="header" />
        </div>
      </header>

      <button
        type="button"
        className="admin-nav-backdrop"
        aria-hidden={!navOpen}
        tabIndex={navOpen ? 0 : -1}
        onClick={() => setNavOpen(false)}
      />

      <aside id="admin-sidebar" className="admin-sidebar">
        <div className="admin-sidebar-inner">
          <div className="admin-brand">
            <img src="/logo.png" alt="WaterMarket" className="admin-brand-logo" />
            <div>
              <div className="admin-brand-title">WaterMarket</div>
              <div className="admin-brand-sub">WRS Management</div>
            </div>
          </div>

          <div className="store-status">
            <button
              type="button"
              className="store-status-btn"
              aria-expanded={storeMenuOpen}
              onClick={() => setStoreMenuOpen((v) => !v)}
            >
              <span className={`store-status-dot${storeOpen ? ' is-open' : ''}`} aria-hidden />
              <span>{storeOpen ? 'Store is open' : 'Store is closed'}</span>
              <span className="store-status-caret" aria-hidden>
                ▾
              </span>
            </button>
            {storeMenuOpen ? (
              <div className="store-status-menu" role="menu">
                <button type="button" role="menuitem" onClick={() => setStoreStatus(true)}>
                  Store is open
                </button>
                <button type="button" role="menuitem" onClick={() => setStoreStatus(false)}>
                  Store is closed
                </button>
              </div>
            ) : null}
          </div>

          <div className="admin-sidebar-body">
            <p className="admin-nav-section-label">Workspace</p>
            <nav className="admin-nav" aria-label="Workspace">
              {NAV.filter((item) => !('ownerOnly' in item) || isStoreOwner).map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={'end' in item ? item.end : false}
                  className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
                  onClick={() => setNavOpen(false)}
                >
                  <span className="admin-nav-link-inner">
                    <span className="admin-nav-icon-wrap">
                      <NavIcon id={item.icon} />
                    </span>
                    <span className="admin-nav-label">{item.label}</span>
                  </span>
                  {item.to === '/wrs-management/ice-orders' ? (
                    <span className="admin-nav-marks">
                      {pendingIce > 0 ? <span className="admin-badge">{pendingIce}</span> : null}
                      <span className={`admin-status-pill${storeOpen ? '' : ' is-off'}`}>{storeOpen ? 'Online' : 'Offline'}</span>
                    </span>
                  ) : null}
                  {item.to === '/wrs-management/orders' && pendingWater > 0 ? <span className="admin-badge">{pendingWater}</span> : null}
                  {item.to === '/wrs-management/staff' && pendingStaff > 0 ? <span className="admin-badge">{pendingStaff}</span> : null}
                </NavLink>
              ))}

              <button
                type="button"
                className={`admin-nav-link admin-nav-link--button${location.pathname.startsWith('/wrs-management/settings') ? ' active' : ''}`}
                aria-expanded={settingsOpen}
                onClick={() => {
                  if (location.pathname.startsWith('/wrs-management/settings')) {
                    setSettingsOpen((v) => !v);
                    return;
                  }
                  setSettingsOpen(true);
                  navigate('/wrs-management/settings?section=general');
                }}
              >
                <span className="admin-nav-link-inner">
                  <span className="admin-nav-icon-wrap">
                    <NavIcon id="settings" />
                  </span>
                  <span className="admin-nav-label">Settings</span>
                </span>
                <span className="store-status-caret" aria-hidden>
                  {settingsOpen ? '▴' : '▾'}
                </span>
              </button>

              {settingsOpen ? (
                <div className="admin-subnav" ref={settingsMenuRef}>
                  <NavLink
                    to="/wrs-management/settings?section=general"
                    className={() =>
                      location.pathname.startsWith('/wrs-management/settings') && (settingsSection ?? 'general') === 'general'
                        ? 'admin-subnav-link active'
                        : 'admin-subnav-link'
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    General Settings
                  </NavLink>
                  <NavLink
                    to="/wrs-management/settings?section=account"
                    className={() =>
                      settingsSection === 'account' ? 'admin-subnav-link active' : 'admin-subnav-link'
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    Account Settings
                  </NavLink>
                  <NavLink
                    to="/wrs-management/settings?section=notifications"
                    className={() =>
                      settingsSection === 'notifications' ? 'admin-subnav-link active' : 'admin-subnav-link'
                    }
                    onClick={() => setNavOpen(false)}
                  >
                    Notification
                  </NavLink>
                  <button
                    type="button"
                    className={`admin-subnav-toggle${darkMode ? ' on' : ''}`}
                    role="switch"
                    aria-checked={darkMode}
                    aria-label={darkMode ? 'Dark mode on' : 'Dark mode off'}
                    onClick={toggleDarkMode}
                  >
                    <span>Dark mode</span>
                    <span className="theme-switch" aria-hidden>
                      <span className="theme-switch-knob" />
                    </span>
                  </button>
                </div>
              ) : null}
            </nav>
          </div>

          <div className="admin-sidebar-foot">
            <div className="admin-user-row">
              <div className="admin-user-meta">
                <span className="admin-user">{displayName}</span>
                <span className="admin-user-role">{isStoreOwner ? 'Master admin' : 'Admin'}</span>
              </div>
              <button type="button" className="admin-signout-icon" aria-label="Sign out" onClick={() => void handleSignOut()}>
                <NavIcon id="signout" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="admin-topbar">
          <p className="admin-breadcrumb">
            <span>Workspace</span>
            <span aria-hidden>/</span>
            <strong>{pageLabel}</strong>
          </p>
          <div className="admin-topbar-actions">
            <time className="admin-topbar-date" dateTime={new Date().toISOString()}>
              {todayLabel}
            </time>
            <AdminNotificationsButton placement="desktop" />
          </div>
        </header>
        <main className="admin-main">
          <div className={`admin-main-inner${wideMain ? ' admin-main-inner--wide' : ''}`}>
            <PendingOrderReminderBanner orders={visibleOrders} onDismiss={dismissBanner} />
            <Outlet context={{ pendingOrders: pendingWater, pendingIce, refreshPending: loadPending, storeOpen }} />
          </div>
        </main>
      </div>
    </div>
  );
}
