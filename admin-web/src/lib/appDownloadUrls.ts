/**
 * APK download links for the public site.
 * Default: static files in public/downloads/ (committed and deployed with admin-web).
 * Optional: VITE_*_APK_URL overrides for external hosting.
 */
function trimUrl(value: string | undefined) {
  return (value ?? '').trim();
}

export function customerApkDownloadUrl(): string {
  const override = trimUrl(import.meta.env.VITE_CUSTOMER_APK_URL);
  if (override) return override;
  return '/downloads/customer-app.apk';
}

export function riderApkDownloadUrl(): string {
  const override = trimUrl(import.meta.env.VITE_RIDER_APK_URL);
  if (override) return override;
  return '/downloads/rider-app.apk';
}