import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './index.css';
import './public.css';
import App from './App.tsx';
import { AuthProvider } from './auth/AuthProvider';
import { NotificationsProvider } from './notifications/NotificationsProvider';
import { ThemeProvider } from './theme/ThemeProvider';

document.addEventListener(
  'wheel',
  (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const field =
      target instanceof HTMLInputElement && target.type === 'number'
        ? target
        : target.closest('input[type="number"]');
    if (field) event.preventDefault();
  },
  { passive: false }
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <NotificationsProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </NotificationsProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>
);
