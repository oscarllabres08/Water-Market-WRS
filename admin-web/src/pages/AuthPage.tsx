import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/AuthProvider';
import { useBusinessAccess } from '../auth/useBusinessAccess';
import { PasswordInput } from '../components/PasswordInput';
import {
  parseAuthCredentials,
  sanitizeAuthEmail,
  sanitizeAuthPassword,
  sanitizeAuthPasswordSignup,
} from '../lib/authInputSecurity';
import { clearLoginFailures, lockoutMessage, loginLockedUntil, publicAuthError, recordLoginFailure } from '../lib/loginThrottle';
import { supabase } from '../lib/supabase';

function FeatureIcon({ name }: { name: 'drop' | 'box' | 'people' }) {
  const common = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': true as const };
  if (name === 'drop') {
    return (
      <svg {...common}>
        <path
          d="M12 3c-3.2 4.6-6 8-6 11.2a6 6 0 1 0 12 0C18 11 15.2 7.6 12 3z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (name === 'box') {
    return (
      <svg {...common}>
        <path
          d="M12 3.5L4.5 7.2v9.6L12 20.5l7.5-3.7V7.2L12 3.5z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="M4.5 7.2L12 11l7.5-3.8M12 11v9.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="9" cy="8" r="2.6" stroke="currentColor" strokeWidth="1.8" />
      <path d="M3.8 18.5c.4-2.8 2.4-4.3 5.2-4.3s4.8 1.5 5.2 4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="16.2" cy="9" r="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14.6 18.5c.2-1.8 1.3-3 3-3.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

type Portal = 'wrs' | 'laundry' | 'owner';

const PORTAL_COPY: Record<Portal, { kicker: string; title: string; tagline: string; home: string }> = {
  wrs: {
    kicker: 'Water refilling and ice',
    title: 'WaterMarket WRS',
    tagline: 'Inventory, orders, and staff in one back-office.',
    home: '/wrs-management',
  },
  laundry: {
    kicker: 'Laundry',
    title: 'WaterMarket Laundry',
    tagline: 'Bookings, services, and laundry sales.',
    home: '/laundry-management',
  },
  owner: {
    kicker: 'Owner',
    title: 'WaterMarket Sales',
    tagline: 'Water, ice, and laundry in one view.',
    home: '/overall-sales',
  },
};

function returnPath(home: string, from: unknown) {
  if (typeof from !== 'string') return home;
  const samePortal = from === home || from.startsWith(`${home}/`);
  if (!samePortal) return home;
  if (from === `${home}/login` || from.startsWith(`${home}/login?`) || from.startsWith(`${home}/login#`)) return home;
  return from;
}

export function AuthPage({ portal = 'wrs' }: { portal?: Portal }) {
  const copy = PORTAL_COPY[portal];
  const location = useLocation();
  const { user, loading, profileLoading, gateMessage, clearGateMessage } = useAuth();
  const access = useBusinessAccess();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const canRegister = portal === 'wrs';
  const activeMode = canRegister ? mode : 'signin';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [trap, setTrap] = useState('');
  const [lockedUntil, setLockedUntil] = useState(() => loginLockedUntil());
  const locked = lockedUntil > Date.now();

  useEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute('data-theme');
    root.removeAttribute('data-theme');
    root.style.colorScheme = 'light';
    return () => {
      if (previous === 'dark') {
        root.setAttribute('data-theme', 'dark');
        root.style.colorScheme = 'dark';
      } else {
        root.style.colorScheme = 'light';
      }
    };
  }, []);

  useEffect(() => {
    if (!locked) return;
    const timer = window.setTimeout(() => setLockedUntil(0), lockedUntil - Date.now());
    return () => window.clearTimeout(timer);
  }, [locked, lockedUntil]);

  const allowed = portal === 'owner' ? access.owner : portal === 'laundry' ? access.laundry : access.wrs;
  const masterOnly = Boolean(user && !loading && !profileLoading && !access.loading && !allowed && portal !== 'wrs');
  if (!loading && !profileLoading && !access.loading && user && allowed) {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={returnPath(copy.home, from)} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    clearGateMessage();
    if (trap.trim()) {
      const until = recordLoginFailure();
      setLockedUntil(until);
      setError(until ? lockoutMessage(until) : 'Could not sign in. Check your email and password.');
      return;
    }
    const untilNow = loginLockedUntil();
    if (untilNow) {
      setLockedUntil(untilNow);
      setError(lockoutMessage(untilNow));
      return;
    }
    setBusy(true);
    try {
      const creds = parseAuthCredentials(email, password, {
        mode: activeMode === 'signin' ? 'login' : 'signup',
        strictCommandFilter: activeMode === 'signup',
      });
      if (!creds.ok) {
        setError(creds.error);
        return;
      }
      if (activeMode === 'signup') {
        if (!name.trim()) {
          setError('Please enter your full name.');
          return;
        }
        const confirm = sanitizeAuthPasswordSignup(confirmPassword, true);
        if (confirm !== creds.password) {
          setError('Password and confirm password do not match.');
          return;
        }
      }
      if (activeMode === 'signin') {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: creds.email,
          password: creds.password,
        });
        if (err) throw err;
        clearLoginFailures();
      } else {
        const { data, error: err } = await supabase.auth.signUp({
          email: creds.email,
          password: creds.password,
          options: {
            data: {
              display_name: name.trim(),
              phone: phone.trim(),
              signup_channel: 'admin',
            },
          },
        });
        if (err) throw err;
        clearLoginFailures();
        if (!data.session) {
          setNotice(
            'Account created. Confirm your email if asked, then sign in. If a master admin already exists, they must approve you on Staff Acc Management first.'
          );
          setMode('signin');
          setPassword('');
          setConfirmPassword('');
          return;
        }
        const payload: { p_display_name: string; p_phone?: string } = { p_display_name: name.trim() };
        if (phone.trim()) payload.p_phone = phone.trim();
        const { data: reg, error: regErr } = await supabase.rpc('register_pending_seller', payload);
        if (regErr) throw regErr;
        const result = reg as { ok?: boolean; owner?: boolean; approved?: boolean; pending?: boolean; message?: string } | null;
        if (result?.ok === false) {
          await supabase.auth.signOut();
          setError(result.message ?? 'Registration could not be submitted.');
          return;
        }
        if (result?.owner === true && result?.approved === true) {
          return;
        }
        await supabase.auth.signOut();
        setNotice(
          'Registration submitted. You can sign in only after the master admin approves this account on Staff account approval.'
        );
        setMode('signin');
        setPassword('');
        setConfirmPassword('');
      }
    } catch (ex) {
      const until = recordLoginFailure();
      setLockedUntil(until);
      setError(until ? lockoutMessage(until) : publicAuthError(ex, activeMode));
    } finally {
      setBusy(false);
    }
  }

  const blocked = gateMessage;

  return (
    <div className="auth-page">
      <aside className="auth-hero" aria-label="WaterMarket branding">
        <div className="auth-hero-glow" aria-hidden />
        <div className="auth-hero-content">
          <div className="auth-hero-logo-wrap">
            <img src="/logo.png" alt="WaterMarket" className="auth-hero-logo" />
          </div>
          <div className="auth-hero-copy">
            <p className="auth-hero-kicker">{copy.kicker}</p>
            <h1 className="auth-hero-title">{copy.title}</h1>
            <p className="auth-hero-tagline">{copy.tagline}</p>
          </div>
          <ul className="auth-hero-features">
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                <FeatureIcon name="drop" />
              </span>
              Inventory &amp; POS
            </li>
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                <FeatureIcon name="box" />
              </span>
              Orders &amp; delivery
            </li>
            <li>
              <span className="auth-hero-feature-icon" aria-hidden>
                <FeatureIcon name="people" />
              </span>
              Staff &amp; customers
            </li>
          </ul>
        </div>
      </aside>

      <main className="auth-panel">
        <div className="auth-card">
          <h2 className="auth-panel-title">{activeMode === 'signin' ? 'Sign in' : 'Create account'}</h2>
          <p className="auth-panel-hint">
            Staff sign-in only. A new account cannot open the portal until the master admin approves it.
          </p>
          {notice ? <p className="success-text">{notice}</p> : null}
          {blocked ? <p className="error-text">{blocked}</p> : null}
          {error ? <p className="error-text">{error}</p> : null}
          <form className="auth-form" onSubmit={(e) => void submit(e)}>
            <div className="auth-trap" aria-hidden="true">
              <label htmlFor="company-website">Website</label>
              <input
                id="company-website"
                name="company_website"
                type="text"
                tabIndex={-1}
                autoComplete="off"
                value={trap}
                onChange={(e) => setTrap(e.target.value)}
              />
            </div>
            {activeMode === 'signup' ? (
              <>
                <div className="field">
                  <label htmlFor="full-name">Full name</label>
                  <input
                    id="full-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={80}
                  />
                </div>
                <div className="field">
                  <label htmlFor="phone">Contact number</label>
                  <input
                    id="phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="09xx xxx xxxx"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    maxLength={20}
                  />
                </div>
              </>
            ) : null}
            <div className="field">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(sanitizeAuthEmail(e.target.value))}
                required
                maxLength={254}
                spellCheck={false}
                disabled={locked}
              />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <PasswordInput
                id="password"
                autoComplete={activeMode === 'signin' ? 'current-password' : 'new-password'}
                placeholder={activeMode === 'signin' ? 'Enter your password' : 'Create a password (min. 8 characters)'}
                value={password}
                onChange={(e) =>
                  setPassword(
                    activeMode === 'signup'
                      ? sanitizeAuthPasswordSignup(e.target.value, true)
                      : sanitizeAuthPassword(e.target.value)
                  )
                }
                required
                minLength={activeMode === 'signup' ? 8 : 6}
                maxLength={128}
                disabled={locked}
              />
            </div>
            {activeMode === 'signup' ? (
              <div className="field">
                <label htmlFor="confirm-password">Confirm password</label>
                <PasswordInput
                  id="confirm-password"
                  autoComplete="new-password"
                  placeholder="Re-enter your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(sanitizeAuthPasswordSignup(e.target.value, true))}
                  required
                  minLength={8}
                  maxLength={128}
                  disabled={locked}
                />
              </div>
            ) : null}
            <button type="submit" className="btn btn-primary btn-water auth-submit-btn" disabled={busy || locked}>
              {busy ? 'Please wait…' : activeMode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>
          {masterOnly ? (
            <p className="auth-panel-footer">Only the master admin can sign in here. Use the first account registered on WRS Management.</p>
          ) : null}
          <p className="auth-panel-footer">
            {canRegister && activeMode === 'signin' ? (
              <>
                Need an account?{' '}
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => {
                    setConfirmPassword('');
                    setNotice(null);
                    setMode('signup');
                  }}
                >
                  Register
                </button>
                <span> New accounts stay closed until the master admin approves them.</span>
              </>
            ) : canRegister ? (
              <>
                Already have an account?{' '}
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => {
                    setConfirmPassword('');
                    setNotice(null);
                    setMode('signin');
                  }}
                >
                  Sign in
                </button>
              </>
            ) : (
              <>Sign in with the master admin account from WRS Management.</>
            )}
          </p>
        </div>
      </main>
    </div>
  );
}
