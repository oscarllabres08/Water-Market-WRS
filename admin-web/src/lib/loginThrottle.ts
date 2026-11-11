const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
const KEY = 'wm-portal-login-guard';

type Guard = { fails: number; until: number };

function read(): Guard {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { fails: 0, until: 0 };
    const parsed = JSON.parse(raw) as Partial<Guard>;
    const until = typeof parsed.until === 'number' ? parsed.until : 0;
    if (until > 0 && until <= Date.now()) return { fails: 0, until: 0 };
    return { fails: typeof parsed.fails === 'number' ? parsed.fails : 0, until };
  } catch {
    return { fails: 0, until: 0 };
  }
}

function write(next: Guard) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore private-mode storage errors */
  }
}

/** Timestamp when sign-in is allowed again, or 0 when it is not locked. */
export function loginLockedUntil(): number {
  const until = read().until;
  return until > Date.now() ? until : 0;
}

/** Count a failed sign-in or sign-up. Returns the lock timestamp once the limit is hit. */
export function recordLoginFailure(): number {
  const current = read();
  const fails = current.fails + 1;
  const until = fails >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
  write({ fails: until ? 0 : fails, until });
  return until;
}

export function clearLoginFailures() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function lockoutMessage(until: number): string {
  const minutes = Math.max(1, Math.ceil((until - Date.now()) / 60000));
  return `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
}

/** Staff-facing wording. Avoid echoing provider errors that distinguish unknown emails from bad passwords. */
export function publicAuthError(error: unknown, mode: 'signin' | 'signup'): string {
  const raw = error instanceof Error ? error.message : '';
  const msg = raw.toLowerCase();
  if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
    return 'Email or password is incorrect.';
  }
  if (msg.includes('email not confirmed')) {
    return 'Confirm your email first, then sign in.';
  }
  if (msg.includes('rate limit') || msg.includes('too many')) {
    return 'Too many attempts. Wait a few minutes and try again.';
  }
  if (msg.includes('already registered') || msg.includes('already been registered')) {
    return 'That email is already registered. Sign in instead.';
  }
  if (mode === 'signin') return 'Could not sign in. Check your email and password.';
  return 'Could not create the account. Try again later.';
}
