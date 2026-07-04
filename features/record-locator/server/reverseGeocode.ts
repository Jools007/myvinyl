import type { GeoPosition } from '../types';
import type { GoogleFetchFn } from './googleFetch';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/reverse';
const NOMINATIM_USER_AGENT = 'MyVinylRecordLocator/1.0 (record-store-locator)';

type NominatimResponse = {
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    county?: string;
    country?: string;
  };
};

export function formatLocationLabel(payload: NominatimResponse, position: GeoPosition): string {
  const addr = payload.address;
  const locality =
    addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality ?? addr?.county;
  const country = addr?.country;
  const coords = `${position.latitude.toFixed(4)}°, ${position.longitude.toFixed(4)}°`;

  if (locality && country) return `${locality}, ${country} · ${coords}`;
  if (payload.display_name) {
    const short = payload.display_name.split(',').slice(0, 2).join(',').trim();
    return `${short} · ${coords}`;
  }
  return coords;
}

export async function reverseGeocodeLabel(
  position: GeoPosition,
  fetchFn: GoogleFetchFn
): Promise<string> {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('lat', String(position.latitude));
  url.searchParams.set('lon', String(position.longitude));
  url.searchParams.set('format', 'json');
  url.searchParams.set('zoom', '14');

  let response: Response | undefined;
  try {
    response = await fetchFn(url.toString(), {
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return `${position.latitude.toFixed(4)}°, ${position.longitude.toFixed(4)}°`;
  }

  if (!response?.ok) {
    return `${position.latitude.toFixed(4)}°, ${position.longitude.toFixed(4)}°`;
  }

  const payload = (await response.json()) as NominatimResponse;
  return formatLocationLabel(payload, position);
}