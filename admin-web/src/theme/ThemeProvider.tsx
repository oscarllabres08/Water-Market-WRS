import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_KEY = 'watermarket-admin-theme';

type Theme = 'light' | 'dark';

type ThemeContextValue = {
  theme: Theme;
  darkMode: boolean;
  setDarkMode: (enabled: boolean) => void;
  toggleDarkMode: () => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem('water-chaste-admin-theme');
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function isAuthPath() {
  const path = window.location.pathname;
  return path === '/auth' || path.startsWith('/auth/');
}

function applyTheme(theme: Theme) {
  if (theme === 'dark' && !isAuthPath()) {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.style.colorScheme = 'dark';
  } else {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = 'light';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = readStoredTheme();
    applyTheme(stored);
    return stored;
  });

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore storage errors */
    }
  }, [theme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      darkMode: theme === 'dark',
      setDarkMode: (enabled) => setTheme(enabled ? 'dark' : 'light'),
      toggleDarkMode: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
