import { mergeRecordStoreResults, normalizePlacesResponse } from '../utils/normalize';
import type { PlacesSearchRequest, RecordStore, RecordStoreSearchMeta } from '../types';
import type { GoogleFetchFn } from './googleFetch';
import { FIXTURE_API_KEY } from './googleFetch';
import { enrichStoresWithOsmTags } from './osmEnrichmentHandler';
import { searchOsmRecordStores } from './osmSearchHandler';
import { searchPhotonRecordStores } from './photonSearchHandler';
import { reverseGeocodeLabel } from './reverseGeocode';

export type RecordLocatorHandlerOptions = {
  fetchFn?: GoogleFetchFn;
};

const PLACES_NEARBY_URL = 'https://places.googleapis.com/v1/places:searchNearby';
const PLACES_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText';

const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.rating',
  'places.businessStatus',
  'places.currentOpeningHours',
  'places.regularOpeningHours',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.photos',
  'places.userRatingCount',
].join(',');

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  businessStatus?: string;
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: Array<{ name?: string }>;
  userRatingCount?: number;
};

export class RecordLocatorValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordLocatorValidationError';
  }
}

export function parsePlacesSearchBody(body: unknown): PlacesSearchRequest {
  if (!body || typeof body !== 'object') {
    throw new RecordLocatorValidationError('Request body must be a JSON object');
  }
  const data = body as Record<string, unknown>;
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RecordLocatorValidationError('Valid latitude is required');
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RecordLocatorValidationError('Valid longitude is required');
  }
  const radiusMeters = data.radiusMeters == null ? 12_000 : Number(data.radiusMeters);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 500 || radiusMeters > 50_000) {
    throw new RecordLocatorValidationError('radiusMeters must be between 500 and 50000');
  }
  return { latitude, longitude, radiusMeters };
}

async function postPlaces<T>(
  apiKey: string,
  url: string,
  body: Record<string, unknown>,
  fetchFn: GoogleFetchFn
): Promise<T> {
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': FIELD_MASK,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places API failed (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

async function searchNearby(
  apiKey: string,
  input: PlacesSearchRequest,
  includedTypes: string[],
  fetchFn: GoogleFetchFn
): Promise<PlacesApiPlace[]> {
  const payload = await postPlaces<{ places?: PlacesApiPlace[] }>(
    apiKey,
    PLACES_NEARBY_URL,
    {
      includedTypes,
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationRestriction: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: input.radiusMeters ?? 12_000,
        },
      },
    },
    fetchFn
  );
  return payload.places ?? [];
}

async function searchText(
  apiKey: string,
  input: PlacesSearchRequest,
  textQuery: string,
  fetchFn: GoogleFetchFn
): Promise<PlacesApiPlace[]> {
  const payload = await postPlaces<{ places?: PlacesApiPlace[] }>(
    apiKey,
    PLACES_TEXT_URL,
    {
      textQuery,
      maxResultCount: 20,
      rankPreference: 'DISTANCE',
      locationBias: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: input.radiusMeters ?? 12_000,
        },
      },
    },
    fetchFn
  );
  return payload.places ?? [];
}

async function searchGoogleRecordStores(
  apiKey: string,
  input: PlacesSearchRequest,
  fetchFn: GoogleFetchFn
): Promise<RecordStore[]> {
  const origin = { latitude: input.latitude, longitude: input.longitude };
  const [recordStores, musicStores, vinylText, recordText, shopText] = await Promise.all([
    searchNearby(apiKey, input, ['record_store'], fetchFn),
    searchNearby(apiKey, input, ['music_store'], fetchFn),
    searchText(apiKey, input, 'vinyl record shop', fetchFn),
    searchText(apiKey, input, 'record store', fetchFn),
    searchText(apiKey, input, 'vinyl shop', fetchFn),
  ]);

  const merged = [...recordStores, ...musicStores, ...vinylText, ...recordText, ...shopText];
  return normalizePlacesResponse(merged, origin);
}

function isRealGoogleKey(apiKey: string | undefined): apiKey is string {
  return Boolean(apiKey?.trim() && apiKey !== FIXTURE_API_KEY);
}

export async function handleNearbyRecordStores(
  apiKey: string | undefined,
  input: PlacesSearchRequest,
  options?: RecordLocatorHandlerOptions
): Promise<{ stores: RecordStore[]; meta: RecordStoreSearchMeta }> {
  const origin = { latitude: input.latitude, longitude: input.longitude };
  const fetchFn: GoogleFetchFn =
    options?.fetchFn ?? (globalThis.fetch.bind(globalThis) as GoogleFetchFn);
  const coordsLabel = `${origin.latitude.toFixed(4)}°, ${origin.longitude.toFixed(4)}°`;

  const isFixture = apiKey === FIXTURE_API_KEY;
  if (isFixture) {
    const [stores, locationLabel] = await Promise.all([
      searchGoogleRecordStores(apiKey!, input, fetchFn),
      reverseGeocodeLabel(origin, fetchFn).catch(() => coordsLabel),
    ]);
    return {
      stores,
      meta: { source: 'fixture', locationLabel, googleCount: stores.length, osmCount: 0 },
    };
  }

  const locationPromise = reverseGeocodeLabel(origin, fetchFn).catch(() => coordsLabel);

  let googleStores: RecordStore[] = [];
  let googleError: string | undefined;

  const googlePromise = isRealGoogleKey(apiKey)
    ? searchGoogleRecordStores(apiKey, input, fetchFn).catch((error) => {
        googleError = error instanceof Error ? error.message : 'Google Places search failed';
        return [] as RecordStore[];
      })
    : Promise.resolve([] as RecordStore[]);

  let osmStores: RecordStore[] = [];
  let osmError: string | undefined;

  const photonPromise = searchPhotonRecordStores(input, fetchFn).catch(() => [] as RecordStore[]);

  const osmPromise = photonPromise.then(async (photonStores) => {
    if (photonStores.length > 0) return photonStores;
    try {
      return await searchOsmRecordStores(input, fetchFn);
    } catch (error) {
      osmError = error instanceof Error ? error.message : 'OpenStreetMap search failed';
      return [];
    }
  });

  const [locationLabel, googleResult, osmResult] = await Promise.all([
    locationPromise,
    googlePromise,
    osmPromise,
  ]);
  googleStores = googleResult;
  osmStores = osmResult;

  if (googleStores.length === 0 && osmStores.length === 0) {
    const parts = [googleError, osmError].filter(Boolean);
    throw new Error(
      parts.length
        ? parts.join(' · ')
        : 'No record stores found near your location. Try widening your search area.'
    );
  }

  const mergedStores =
    googleStores.length > 0 && osmStores.length > 0
      ? mergeRecordStoreResults(googleStores, osmStores)
      : [...googleStores, ...osmStores].sort((a, b) => a.distanceMeters - b.distanceMeters);

  const stores = await enrichStoresWithOsmTags(mergedStores, fetchFn);

  const source: RecordStoreSearchMeta['source'] =
    googleStores.length > 0 && osmStores.length > 0
      ? 'combined'
      : googleStores.length > 0
        ? 'google'
        : 'osm';

  return {
    stores,
    meta: {
      source,
      locationLabel,
      googleCount: googleStores.length,
      osmCount: osmStores.length,
      googleEnriched: googleStores.length > 0,
    },
  };
}