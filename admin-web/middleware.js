const PRIVATE_PATH = /^\/(wrs-management|laundry-management|overall-sales|auth)(\/|$)/;

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com https://cdn.jsdelivr.net",
  "frame-src https://maps.google.com https://www.google.com",
  "worker-src 'self' blob:",
].join('; ');

export const config = {
  matcher: ['/((?!.*\\.).*)'],
};

function applySecurityHeaders(headers, pathname) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('X-Permitted-Cross-Domain-Policies', 'none');
  headers.set('Content-Security-Policy', CONTENT_SECURITY_POLICY);
  if (PRIVATE_PATH.test(pathname)) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'no-store');
  }
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const indexUrl = new URL('/index.html', url.origin);
  const response = await fetch(indexUrl, { headers: { 'accept-encoding': 'identity' } });
  let html = await response.text();
  const origin = url.origin.replace(/\/$/, '');
  if (html.includes('__SITE_ORIGIN__')) {
    html = html.replaceAll('__SITE_ORIGIN__', origin);
  }

  const headers = new Headers(response.headers);
  // fetch() already decoded the file. Leaving content-encoding makes the browser fail with ERR_CONTENT_DECODING_FAILED.
  headers.delete('content-encoding');
  headers.delete('content-length');
  headers.set('content-type', 'text/html; charset=utf-8');
  applySecurityHeaders(headers, url.pathname);

  return new Response(html, {
    status: response.status,
    headers,
  });
}
