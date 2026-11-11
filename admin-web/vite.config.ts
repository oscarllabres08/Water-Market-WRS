import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function linkPreviewOrigin(mode: string, env: Record<string, string>) {
  const configured = (env.VITE_SITE_URL || '').trim().replace(/\/$/, '');
  if (configured) return configured;
  if (mode === 'development') return 'http://localhost:5174';
  return '__SITE_ORIGIN__';
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
    plugins: [react(), linkPreviewPlugin(mode, env)],
    server: { port: 5174 },
  };
});
