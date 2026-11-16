const RIDER_APK_PATH = /^\/downloads?\/rider-app\.apk$/i;

export function isRiderApkPath(pathname) {
  const path = String(pathname || '').split('?')[0].replace(/\/+$/, '') || '/';
  return RIDER_APK_PATH.test(path);
}

export function riderTicketFrom(requestUrl, cookieHeader) {
  const url = new URL(requestUrl);
  const query = url.searchParams.get('t')?.trim() ?? '';
  if (query) return query;
  const match = /(?:^|;\s*)wm_rider_dl=([^;]+)/.exec(cookieHeader || '');
  return match ? decodeURIComponent(match[1]).trim() : '';
}

export function riderDownloadCookie(token) {
  return `wm_rider_dl=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Lax; Path=/downloads; Max-Age=600`;
}

export async function riderTicketValid(token) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) return false;
  const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!base || !key) return false;
  const response = await fetch(`${base}/rest/v1/rpc/rider_download_ticket_valid`, {
    method: 'POST',
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ p_token: token }),
  });
  if (!response.ok) return false;
  return (await response.json()) === true;
}
