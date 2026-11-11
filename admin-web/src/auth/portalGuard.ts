const PORTALS = ['/wrs-management', '/laundry-management', '/overall-sales'] as const;

export const IDLE_LIMIT_MS = 60 * 60 * 1000;

export function isPortalPath(pathname: string) {
  return PORTALS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPortalLogin(pathname: string) {
  return PORTALS.some((prefix) => pathname === `${prefix}/login` || pathname.startsWith(`${prefix}/login/`));
}

/** Signed-in management screens. Login pages stay reachable for staff. */
export function isStaffArea(pathname: string) {
  return isPortalPath(pathname) && !isPortalLogin(pathname);
}
