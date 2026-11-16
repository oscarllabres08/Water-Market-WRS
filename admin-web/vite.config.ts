import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { isRiderApkPath, riderDownloadCookie, riderTicketFrom, riderTicketValid } from './lib/riderDownloadGuard.js';

function linkPreviewOrigin(mode: string, env: Record<string, string>) {
  const configured = (env.VITE_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (mode === 'development') return 'http://localhost:5174';
  return '__SITE_ORIGIN__';
}

function riderApkGuard(env: Record<string, string>): Plugin {
  return {
    name: 'rider-apk-guard',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void guardRiderApk(req, res, next, env);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void guardRiderApk(req, res, next, env);
      });
    },
  };
}

function guardRiderApk(
  req: { url?: string; headers: { cookie?: string; host?: string } },
  res: { statusCode: number; setHeader: (name: string, value: string) => void; end: (body?: string) => void },
  next: () => void,
  env: Record<string, string>
) {
  const pathname = (req.url ?? '').split('?')[0];
  if (!isRiderApkPath(pathname)) {
    next();
    return;
  }
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  const host = req.headers.host || 'localhost';
  const proto = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https';
  const requestUrl = `${proto}://${host}${req.url}`;
  void riderTicketValid(riderTicketFrom(requestUrl, req.headers.cookie)).then((allowed: boolean) => {
    if (!allowed) {
      res.statusCode = 302;
      res.setHeader('Location', '/water-refilling');
      res.end();
      return;
    }
    const token = riderTicketFrom(requestUrl, req.headers.cookie);
    if (pathname.toLowerCase() !== '/downloads/rider-app.apk') {
      res.statusCode = 302;
      res.setHeader('Location', `/downloads/rider-app.apk?t=${encodeURIComponent(token)}`);
      res.end();
      return;
    }
    res.setHeader('Set-Cookie', riderDownloadCookie(token).replace('; Secure', ''));
    next();
  });
}

function linkPreviewPlugin(mode: string, env: Record<string, string>): Plugin {
  const origin = linkPreviewOrigin(mode, env);
  return {
    name: 'watermarket-link-preview',
    transformIndexHtml(html) {
      return html.replaceAll('__SITE_ORIGIN__', origin);
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), linkPreviewPlugin(mode, env), riderApkGuard(env)],
    server: {
      port: 5174,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
    preview: {
      port: 4174,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  };
});
