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
  const locality = place.district || place.subregion || place.city;
  return uniqueParts([
    street || place.name,
    place.district,
    place.subregion,
    place.city,
    locality,
    place.region,
    place.postalCode,
    place.country,
  ]).join(', ');
}

function looksLikeCoordinates(value: string) {
  return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(value.trim());
}

function isTooCoarseAddress(value: string) {
  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  return parts.length <= 2 && !/\d/.test(value);
}

async function reverseAddressNominatim(latitude: number, longitude: number): Promise<string> {
  const response = await fetch(
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
    { headers: { Accept: 'application/json', 'Accept-Language': 'en' } }
  );
  if (!response.ok) return '';
  const data = (await response.json()) as { display_name?: string; address?: Record<string, string> };
  const place = data.address ?? {};
  const parts = uniqueParts([
    place.house_number,
    place.road || place.pedestrian || place.footway,
    place.neighbourhood || place.suburb || place.quarter || place.hamlet || place.village,
    place.city_district || place.city || place.town || place.municipality,
    place.state || place.region,
    place.postcode,
  ]);
  if (parts.length > 0) return parts.join(', ');
  if (data.display_name && !looksLikeCoordinates(data.display_name)) return data.display_name;
  return '';
}

async function reverseAddressBigDataCloud(latitude: number, longitude: number): Promise<string> {
  const response = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
  );
  if (!response.ok) return '';
  const data = (await response.json()) as {
    locality?: string;
    city?: string;
    principalSubdivision?: string;
    postcode?: string;
    plusCode?: string;
  };
  const parts = uniqueParts([data.locality, data.city, data.principalSubdivision, data.postcode]);
  if (parts.length > 0 && !isTooCoarseAddress(parts.join(', '))) return parts.join(', ');
  return '';
}

async function reverseAddress(latitude: number, longitude: number): Promise<string> {
  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    const fromDevice = formatGeocodedAddress(places[0]);
    if (fromDevice && !looksLikeCoordinates(fromDevice) && !isTooCoarseAddress(fromDevice)) {
      return fromDevice;
    }
  } catch {
    // Fall back to web geocoders.
  }

  try {
    const nominatim = await reverseAddressNominatim(latitude, longitude);
    if (nominatim && !isTooCoarseAddress(nominatim)) return nominatim;
    if (nominatim) return nominatim;
  } catch {
    // Try the next service.
  }

  try {
    const bdc = await reverseAddressBigDataCloud(latitude, longitude);
    if (bdc) return bdc;
  } catch {
    // Try device geocoder again as last resort.
  }

  try {
    const places = await Location.reverseGeocodeAsync({ latitude, longitude });
    return formatGeocodedAddress(places[0]);
  } catch {
    return '';
  }
}

export async function readCurrentAddress(): Promise<
  | { ok: true; address: string; latitude: number; longitude: number }
  | { ok: false; error: string }
> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') return { ok: false, error: 'Location permission denied.' };
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
      mayShowUserSettingsDialog: true,
    });
    const latitude = pos.coords.latitude;
    const longitude = pos.coords.longitude;
    const address = await reverseAddress(latitude, longitude);
    if (!address || looksLikeCoordinates(address)) {
      return {
        ok: false,
        error: 'Location was found, but the street address could not be loaded. Type your address or landmark instead.',
      };
    }
    if (isTooCoarseAddress(address)) {
      return {
        ok: false,
        error:
          'GPS signal is weak — only a general area was found. Move near a window, wait a few seconds, try again, or type your exact address.',
      };
    }
    return { ok: true, address, latitude, longitude };
  } catch {
    return { ok: false, error: 'Could not get your current location.' };
  }
}