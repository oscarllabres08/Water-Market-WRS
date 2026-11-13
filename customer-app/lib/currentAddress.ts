import * as Location from 'expo-location';

function uniqueParts(parts: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const part of parts) {
    const value = (part ?? '').trim();
    if (!value) continue;
    if (out.some((item) => item.toLowerCase() === value.toLowerCase())) continue;
    out.push(value);
  }
  return out;
}

export function formatGeocodedAddress(place: Location.LocationGeocodedAddress | undefined): string {
  if (!place) return '';
  const street = [place.streetNumber, place.street].filter(Boolean).join(' ').trim();
  return uniqueParts([street || place.name, place.district, place.city, place.subregion, place.region, place.postalCode]).join(', ');
}

function looksLikeCoordinates(value: string) {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value.trim());
}

async function reverseAddress(latitude: number, longitude: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      { headers: { Accept: 'application/json', 'Accept-Language': 'en' } }
    );
    if (response.ok) {
      const data = (await response.json()) as { display_name?: string; address?: Record<string, string> };
      const place = data.address ?? {};
      const parts = uniqueParts([
        place.house_number,
        place.road,
        place.suburb || place.neighbourhood || place.village || place.quarter,
        place.city || place.town || place.municipality,
        place.state,
      ]);
      if (parts.length > 0) return parts.join(', ');
      if (data.display_name && !looksLikeCoordinates(data.display_name)) return data.display_name;
    }
  } catch {
    // Try the locality lookup when the street service is unavailable.
  }
  try {
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );
    if (response.ok) {
      const data = (await response.json()) as { locality?: string; city?: string; principalSubdivision?: string };
      const parts = uniqueParts([data.locality, data.city, data.principalSubdivision]);
      if (parts.length > 0) return parts.join(', ');
    }
  } catch {
    // The device geocoder is the last place to look.
  }
  return '';
}

export async function readCurrentAddress(): Promise<
  | { ok: true; address: string; latitude: number; longitude: number }
  | { ok: false; error: string }
> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { ok: false, error: 'Location permission denied.' };
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    let address = await reverseAddress(latitude, longitude);
    if (!address) {
      try {
        const places = await Location.reverseGeocodeAsync({ latitude, longitude });
        address = formatGeocodedAddress(places[0]);
      } catch {
        address = '';
      }
    }
    if (!address || looksLikeCoordinates(address)) {
      return { ok: false, error: 'Location was found, but the street address could not be loaded. Type your address instead.' };
    }
    return { ok: true, address, latitude, longitude };
  } catch {
    return { ok: false, error: 'Could not get your current location.' };
  }
}
