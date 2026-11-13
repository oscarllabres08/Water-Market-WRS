import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';

type NavIconId = 'overview' | 'pos' | 'bookings' | 'services' | 'sales' | 'customers' | 'expenses' | 'settings';

type NavItem = { to: string; label: string; end?: boolean; icon?: NavIconId };

function NavIcon({ id }: { id: NavIconId }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (id === 'overview') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
        <rect x="13" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    );
  }
  if (id === 'pos') {
    return (
      <svg {...common}>
        <circle cx="9" cy="20" r="1.2" fill="currentColor" />
        <circle cx="18" cy="20" r="1.2" fill="currentColor" />
        <path d="M3 4h2l2.2 11h11.3l2-7H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'bookings') {
    return (
      <svg {...common}>
        <rect x="4" y="5" width="16" height="15" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 3.5V7M16 3.5V7M4 10h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'services') {
    return (
      <svg {...common}>
        <path d="M8 5l4 2 4-2 4 3-2 3v9H6V11L4 8l4-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'sales') {
    return (
      <svg {...common}>
        <path d="M4 19V5M4 19h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M7 15l3.2-4 3 2.2L18 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (id === 'customers') {
    return (
      <svg {...common}>
        <circle cx="12" cy="8" r="3.2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M5 19c.8-3.2 3.4-5 7-5s6.2 1.8 7 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === 'expenses') {
    return (
      <svg {...common}>
        <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 3.5v2M12 18.5v2M4.8 6.2l1.4 1.4M17.8 16.4l1.4 1.4M3.5 12h2M18.5 12h2M4.8 17.8l1.4-1.4M17.8 7.6l1.4-1.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function ManagementFrame({
  brand,
  section,
  nav,
  signOutTo,
  className,
  children,
}: {
  brand: string;
  section: string;
  nav: NavItem[];
  signOutTo: string;
  className?: string;
  children: ReactNode;
}) {
  const { profile, user, signOut, isStoreOwner } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const displayName = profile?.display_name?.trim() || user?.email || 'Staff';

  return (
    <div className={`admin-shell${open ? ' admin-shell--nav-open' : ''}`}>
      <header className="admin-mobile-bar">
        <button type="button" className="admin-menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((v) => !v)}>
          {open ? '✕' : '☰'}
        </button>
        <div className="admin-mobile-bar-brand">
          <img src="/logo.png" alt="" className="admin-mobile-bar-logo" />
          <div className="admin-mobile-bar-text">
            <span className="admin-mobile-bar-title">WaterMarket</span>
            <span className="admin-mobile-bar-page">{section}</span>
          </div>
        </div>
      </header>
      <button type="button" className="admin-nav-backdrop" aria-hidden={!open} onClick={() => setOpen(false)} />
      <aside className="admin-sidebar">
        <div className="admin-sidebar-inner">
          <div className="admin-brand">
            <img src="/logo.png" alt="WaterMarket" className="admin-brand-logo" />
            <div>
              <div className="admin-brand-title">WaterMarket</div>
              <div className="admin-brand-sub">{brand}</div>
            </div>
          </div>
          <div className="admin-sidebar-body">
            <nav className="admin-nav" aria-label={brand}>
              {nav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => (isActive ? 'admin-nav-link active' : 'admin-nav-link')}
                  onClick={() => setOpen(false)}
                >
                  <span className="admin-nav-link-inner">
                    {item.icon ? (
                      <span className="admin-nav-icon-wrap">
                        <NavIcon id={item.icon} />
                      </span>
                    ) : null}
                    <span className="admin-nav-label">{item.label}</span>
                  </span>
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="admin-sidebar-foot">
            <div className="admin-user-row">
              <div className="admin-user-meta">
                <span className="admin-user">{displayName}</span>
                <span className="admin-user-role">{isStoreOwner ? 'Master admin' : 'Staff'}</span>
              </div>
              <button
                type="button"
                className="admin-signout-icon"
                aria-label="Sign out"
                onClick={() => {
                  void signOut().then(() => navigate(signOutTo, { replace: true }));
                }}
              >
                ↪
              </button>
            </div>
          </div>
        </div>
      </aside>
      <div className="admin-workspace">
        <header className="admin-topbar">
          <p className="admin-breadcrumb">
            <span>{brand}</span>
            <span aria-hidden>/</span>
            <strong>{section}</strong>
          </p>
        </header>
        <main className="admin-main">
          <div className={`admin-main-inner admin-main-inner--wide${className ? ` ${className}` : ''}`}>{children}</div>
        </main>
      </div>
    </div>
  );
}
