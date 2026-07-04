import { getPlacesFixturePlaces } from '../fixtures/loadFixtures';
import { normalizePlacesResponse } from '../utils/normalize';
import type { PlacesSearchRequest, RecordStore } from '../types';

export type RecordLocatorHandlerOptions = {
  useFixture?: boolean;
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
  const radiusMeters = data.radiusMeters == null ? 8000 : Number(data.radiusMeters);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 500 || radiusMeters > 50_000) {
    throw new RecordLocatorValidationError('radiusMeters must be between 500 and 50000');
  }
  return { latitude, longitude, radiusMeters };
}

async function postPlaces<T>(
  apiKey: string,
  url: string,
  body: Record<string, unknown>
): Promise<T> {
  const response = await fetch(url, {
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
  includedTypes: string[]
): Promise<PlacesApiPlace[]> {
  const payload = await postPlaces<{ places?: PlacesApiPlace[] }>(apiKey, PLACES_NEARBY_URL, {
    includedTypes,
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationRestriction: {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: input.radiusMeters ?? 8000,
      },
    },
  });
  return payload.places ?? [];
}

async function searchText(
  apiKey: string,
  input: PlacesSearchRequest,
  textQuery: string
): Promise<PlacesApiPlace[]> {
  const payload = await postPlaces<{ places?: PlacesApiPlace[] }>(apiKey, PLACES_TEXT_URL, {
    textQuery,
    maxResultCount: 20,
    rankPreference: 'DISTANCE',
    locationBias: {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: input.radiusMeters ?? 8000,
      },
    },
  });
  return payload.places ?? [];
}

export async function handleNearbyRecordStores(
  apiKey: string | undefined,
  input: PlacesSearchRequest,
  options?: RecordLocatorHandlerOptions
): Promise<{ stores: RecordStore[] }> {
  const origin = { latitude: input.latitude, longitude: input.longitude };

  if (options?.useFixture) {
    const stores = normalizePlacesResponse(getPlacesFixturePlaces(), origin);
    return { stores };
  }

  if (!apiKey) {
    throw new Error('GOOGLE_PLACES_API_KEY not configured');
  }

  const [recordStores, musicStores, vinylText, recordText] = await Promise.all([
    searchNearby(apiKey, input, ['record_store']),
    searchNearby(apiKey, input, ['music_store']),
    searchText(apiKey, input, 'vinyl records store'),
    searchText(apiKey, input, 'record store'),
  ]);

  const merged = [...recordStores, ...musicStores, ...vinylText, ...recordText];
  const stores = normalizePlacesResponse(merged, origin);
  return { stores };
}