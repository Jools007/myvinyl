import type { PlacesSearchRequest, RecordStore } from '../types';
import { normalizeOsmResponse, type OsmElement } from '../utils/osmNormalize';
import type { GoogleFetchFn } from './googleFetch';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_USER_AGENT = 'MyVinylRecordLocator/1.0 (record-store-locator)';

export function buildOverpassQuery(latitude: number, longitude: number, radiusMeters: number): string {
  const radius = Math.min(Math.max(radiusMeters, 1000), 25_000);
  return `[out:json][timeout:25];
(
  node["shop"="music"](around:${radius},${latitude},${longitude});
  node["shop"="vinyl"](around:${radius},${latitude},${longitude});
  node["shop"="hifi"](around:${radius},${latitude},${longitude});
  way["shop"="music"](around:${radius},${latitude},${longitude});
  way["shop"="vinyl"](around:${radius},${latitude},${longitude});
  node["name"~"record|vinyl|vinil|plokštel|vinilo|viniloteka",i](around:${radius},${latitude},${longitude});
  way["name"~"record|vinyl|vinil|plokštel|vinilo|viniloteka",i](around:${radius},${latitude},${longitude});
);
out center tags;`;
}

async function queryOverpass(
  endpoint: string,
  query: string,
  fetchFn: GoogleFetchFn
): Promise<OsmElement[]> {
  const response = await fetchFn(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': OVERPASS_USER_AGENT,
      Accept: 'application/json',
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenStreetMap search failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const payload = (await response.json()) as { elements?: OsmElement[] };
  return payload.elements ?? [];
}

export async function searchOsmRecordStores(
  input: PlacesSearchRequest,
  fetchFn: GoogleFetchFn
): Promise<RecordStore[]> {
  const query = buildOverpassQuery(input.latitude, input.longitude, input.radiusMeters ?? 12_000);
  const origin = { latitude: input.latitude, longitude: input.longitude };

  let lastError: Error | undefined;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const elements = await queryOverpass(endpoint, query, fetchFn);
      const stores = normalizeOsmResponse(elements, origin);
      if (stores.length > 0) return stores;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('OpenStreetMap search failed');
    }
  }

  if (lastError) throw lastError;
  return [];
}