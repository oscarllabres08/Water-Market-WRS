export type LatLng = {
  lat: number;
  lng: number;
};

/** Public OSRM-compatible routers. Driving km, closer to Google Maps than a straight line. */
const ROUTE_BASES = [
  'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  'https://router.project-osrm.org/route/v1/driving',
];

const cache = new Map<string, number>();

function cacheKey(origin: LatLng, dest: LatLng): string {
  const r = (n: number) => n.toFixed(3);
  return `${r(origin.lat)},${r(origin.lng)};${r(dest.lat)},${r(dest.lng)}`;
}

async function routeKm(base: string, origin: LatLng, dest: LatLng): Promise<number | null> {
  const url = `${base}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false&alternatives=false`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return null;
    const json = (await res.json()) as { routes?: { distance?: number }[] };
    const meters = json.routes?.[0]?.distance;
    if (typeof meters !== 'number' || !Number.isFinite(meters) || meters < 0) return null;
    return meters / 1000;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Road distance in km, or null if every router fails. Cached per ~100 m. */
export async function fetchDrivingDistanceKm(origin: LatLng, dest: LatLng): Promise<number | null> {
  const key = cacheKey(origin, dest);
  const hit = cache.get(key);
  if (hit != null) return hit;

  return new Promise((resolve) => {
    let pending = ROUTE_BASES.length;
    let settled = false;
    for (const base of ROUTE_BASES) {
      void routeKm(base, origin, dest).then((km) => {
        pending -= 1;
        if (!settled && km != null) {
          settled = true;
          cache.set(key, km);
          resolve(km);
          return;
        }
        if (pending === 0 && !settled) resolve(null);
      });
    }
  });
}
