import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
};

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

  return {
    id,
    name,
    address,
    latitude,
    longitude,
    rating: place.rating,
    businessStatus: place.businessStatus,
    openNow: place.currentOpeningHours?.openNow,
    openingHoursSummary: summarizeOpeningHours(place),
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri,
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

/** Merge Google + OSM results, preferring Google when two shops are within 80 m. */
export function mergeRecordStoreResults(
  googleStores: RecordStore[],
  osmStores: RecordStore[]
): RecordStore[] {
  const merged = [...googleStores];
  const googlePositions = googleStores.map((s) => ({
    lat: s.latitude,
    lon: s.longitude,
  }));

  for (const osm of osmStores) {
    const duplicate = googlePositions.some((g) => {
      const dLat = Math.abs(g.lat - osm.latitude);
      const dLon = Math.abs(g.lon - osm.longitude);
      return dLat < 0.0008 && dLon < 0.0008;
    });
    if (!duplicate) merged.push(osm);
  }

  return merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
}