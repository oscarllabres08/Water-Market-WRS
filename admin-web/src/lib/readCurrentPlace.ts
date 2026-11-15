export type CurrentPin = { latitude: number; longitude: number; address: string };

function readPosition(options: PositionOptions): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

function locationError(err: unknown, fallback: string) {
  if (typeof err === 'object' && err && 'code' in err && (err as { code: number }).code === 1) {
    return 'Allow location access so we can fill the address.';
  }
  return fallback;
}

function uniqueParts(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part, index, all) => part && all.findIndex((item) => item.toLowerCase() === part.toLowerCase()) === index);
}

async function reverseAddress(latitude: number, longitude: number): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`,
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
      if (data.display_name) return data.display_name;
    }
  } catch {
    // Try the city lookup when the street service is unavailable.
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
    // The pin is still saved when the street name cannot be looked up.
  }
  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

export async function readCurrentPlace(): Promise<CurrentPin> {
  if (!navigator.geolocation) throw new Error('This browser cannot read your location.');
  let position: GeolocationPosition;
  try {
    position = await readPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  } catch (err) {
    const denied = locationError(err, '');
    if (denied) throw new Error(denied);
    try {
      position = await readPosition({ enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
    } catch (retry) {
      throw new Error(locationError(retry, 'Could not get your current location.'));
    }
  }
  const latitude = position.coords.latitude;
  const longitude = position.coords.longitude;
  return { latitude, longitude, address: await reverseAddress(latitude, longitude) };
}