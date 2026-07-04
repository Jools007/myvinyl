import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';
import { isLikelyRecordShopCandidate } from './recordShopRelevance';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MERGE_MAX_METERS = 80;
export const RECORD_LOCATOR_PHOTO_API = '/api/record-locator/photo';

type PlacesApiPlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  primaryType?: string;
  types?: string[];
  currentOpeningHours?: { openNow?: boolean; weekdayDescriptions?: string[] };
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  photos?: Array<{ name?: string }>;
};

export function buildPlacePhotoUrl(photoName: string | undefined): string | undefined {
  if (!photoName?.trim()) return undefined;
  return `${RECORD_LOCATOR_PHOTO_API}?n=${encodeURIComponent(photoName.trim())}`;
}

export function summarizeOpeningHours(place: PlacesApiPlace): string | undefined {
  const descriptions =
    place.currentOpeningHours?.weekdayDescriptions ??
    place.regularOpeningHours?.weekdayDescriptions;
  if (!descriptions?.length) return undefined;
  const today = DAY_NAMES[new Date().getDay()];
  const todayLine = descriptions.find((line) => line.startsWith(today));
  return todayLine ?? descriptions[0];
}

export function normalizePlacesPlace(
  place: PlacesApiPlace,
  origin: GeoPosition
): RecordStore | null {
  const id = place.id?.trim();
  const name = place.displayName?.text?.trim();
  const address = place.formattedAddress?.trim();
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;

  if (!id || !name || !address || latitude == null || longitude == null) {
    return null;
  }

  if (
    !isLikelyRecordShopCandidate(
      {
        name,
        address,
        types: place.types,
      },
      { source: 'google' }
    )
  ) {
    return null;
  }

  return {
    id,
    name,
    address,
    latitude,
    longitude,
    rating: place.rating,
    ratingCount: place.userRatingCount,
    businessStatus: place.businessStatus,
    openNow: place.currentOpeningHours?.openNow,
    openingHoursSummary: summarizeOpeningHours(place),
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri,
    photoUrl: buildPlacePhotoUrl(place.photos?.[0]?.name),
    distanceMeters: haversineDistanceMeters(origin, { latitude, longitude }),
    source: 'google',
  };
}

export function normalizePlacesResponse(
  places: PlacesApiPlace[] | undefined,
  origin: GeoPosition
): RecordStore[] {
  if (!places?.length) return [];

  const seen = new Set<string>();
  const stores: RecordStore[] = [];

  for (const place of places) {
    const normalized = normalizePlacesPlace(place, origin);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }

  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function enrichStoreWithFallback(primary: RecordStore, fallback: RecordStore): RecordStore {
  return {
    ...primary,
    phone: primary.phone ?? fallback.phone,
    website: primary.website ?? fallback.website,
    openingHoursSummary: primary.openingHoursSummary ?? fallback.openingHoursSummary,
    openNow: primary.openNow ?? fallback.openNow,
    photoUrl: primary.photoUrl ?? fallback.photoUrl,
    rating: primary.rating ?? fallback.rating,
    ratingCount: primary.ratingCount ?? fallback.ratingCount,
    mapsUrl: primary.mapsUrl ?? fallback.mapsUrl,
  };
}

/** Merge Google + OSM results, preferring Google when two shops are within 80 m. */
export function mergeRecordStoreResults(
  googleStores: RecordStore[],
  osmStores: RecordStore[]
): RecordStore[] {
  const merged = [...googleStores];

  for (const osm of osmStores) {
    const matchIndex = merged.findIndex(
      (google) =>
        haversineDistanceMeters(google, osm) <= MERGE_MAX_METERS
    );

    if (matchIndex >= 0) {
      merged[matchIndex] = enrichStoreWithFallback(merged[matchIndex], osm);
      continue;
    }

    merged.push(osm);
  }

  return merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
}