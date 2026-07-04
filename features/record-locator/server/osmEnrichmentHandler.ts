import type { RecordStore } from '../types';
import { applyOpeningHoursToStore } from '../utils/openingHours';
import type { GoogleFetchFn } from './googleFetch';

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const OVERPASS_USER_AGENT = 'MyVinylRecordLocator/1.0 (record-store-enrichment)';

type OsmRef = {
  element: 'node' | 'way' | 'relation';
  osmId: number;
};

type OsmTagElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
};

export function parseOsmStoreRef(storeId: string): OsmRef | null {
  const match = storeId.match(/(?:osm|photon)\/(node|way|relation)\/(\d+)/);
  if (!match) return null;
  return { element: match[1] as OsmRef['element'], osmId: Number(match[2]) };
}

function buildTagsQuery(refs: OsmRef[]): string {
  const lines = refs.map((ref) => `${ref.element}(${ref.osmId});`);
  return `[out:json][timeout:20];\n(\n${lines.join('\n')}\n);\nout tags;`;
}

async function fetchOsmTags(
  refs: OsmRef[],
  fetchFn: GoogleFetchFn
): Promise<Map<string, Record<string, string>>> {
  if (!refs.length) return new Map();

  const query = buildTagsQuery(refs);
  let lastError: Error | undefined;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': OVERPASS_USER_AGENT,
          Accept: 'application/json',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Overpass enrichment failed (${response.status}): ${text.slice(0, 160)}`);
      }

      const payload = (await response.json()) as { elements?: OsmTagElement[] };
      const tagsByKey = new Map<string, Record<string, string>>();

      for (const element of payload.elements ?? []) {
        if (!element.tags) continue;
        tagsByKey.set(`${element.type}/${element.id}`, element.tags);
      }

      return tagsByKey;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Overpass enrichment failed');
    }
  }

  if (lastError) throw lastError;
  return new Map();
}

function mergeTagsIntoStore(store: RecordStore, tags: Record<string, string>): RecordStore {
  const openingHoursSummary = tags.opening_hours ?? store.openingHoursSummary;
  const enriched: RecordStore = {
    ...store,
    phone: store.phone ?? tags.phone ?? tags['contact:phone'],
    website: store.website ?? tags.website ?? tags['contact:website'],
    openingHoursSummary,
  };

  return applyOpeningHoursToStore(enriched);
}

export async function enrichStoresWithOsmTags(
  stores: RecordStore[],
  fetchFn: GoogleFetchFn
): Promise<RecordStore[]> {
  const refs: OsmRef[] = [];
  const refByStoreId = new Map<string, OsmRef>();

  for (const store of stores) {
    const ref = parseOsmStoreRef(store.id);
    if (!ref) continue;
    refs.push(ref);
    refByStoreId.set(store.id, ref);
  }

  if (!refs.length) {
    return stores.map((store) => applyOpeningHoursToStore(store));
  }

  try {
    const tagsByKey = await fetchOsmTags(refs, fetchFn);
    return stores.map((store) => {
      const ref = refByStoreId.get(store.id);
      if (!ref) return applyOpeningHoursToStore(store);
      const tags = tagsByKey.get(`${ref.element}/${ref.osmId}`);
      if (!tags) return applyOpeningHoursToStore(store);
      return mergeTagsIntoStore(store, tags);
    });
  } catch {
    return stores.map((store) => applyOpeningHoursToStore(store));
  }
}