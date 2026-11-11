import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';

type NavItem = { to: string; label: string; end?: boolean };

export function ManagementFrame({
  brand,
  section,
  nav,
  signOutTo,
  children,
}: {
  brand: string;
  section: string;
  nav: NavItem[];
  signOutTo: string;
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
                  <span className="admin-nav-label">{item.label}</span>
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
          <div className="admin-main-inner admin-main-inner--wide">{children}</div>
        </main>
      </div>
    </div>
  );
}
