import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';

export type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const VINYL_NAME = /record|vinyl|vinil|plokštel|vinilo|viniloteka|vinylomania|hi-fi|hifi|thelonious/i;
const EXCLUDE_NAME = /grindys|flooring|grindų/i;

function elementCoords(element: OsmElement): GeoPosition | null {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { latitude: lat, longitude: lon };
}

function formatOsmAddress(tags: Record<string, string>): string {
  if (tags['addr:full']?.trim()) return tags['addr:full'].trim();
  const parts = [
    [tags['addr:street'], tags['addr:housenumber']].filter(Boolean).join(' '),
    tags['addr:city'] ?? tags['addr:place'],
    tags['addr:postcode'],
  ].filter(Boolean);
  return parts.join(', ') || tags.address?.trim() || 'Address not listed';
}

export function isLikelyRecordShop(tags: Record<string, string> | undefined): boolean {
  if (!tags) return false;
  const shop = tags.shop?.toLowerCase();
  if (shop === 'music' || shop === 'vinyl' || shop === 'hifi') return true;
  const name = tags.name ?? '';
  if (EXCLUDE_NAME.test(name)) return false;
  return VINYL_NAME.test(name);
}

export function normalizeOsmElement(element: OsmElement, origin: GeoPosition): RecordStore | null {
  const tags = element.tags;
  if (!tags || !isLikelyRecordShop(tags)) return null;

  const coords = elementCoords(element);
  const name = tags.name?.trim();
  if (!coords || !name) return null;

  const id = `osm/${element.type}/${element.id}`;

  return {
    id,
    name,
    address: formatOsmAddress(tags),
    latitude: coords.latitude,
    longitude: coords.longitude,
    phone: tags.phone ?? tags['contact:phone'],
    website: tags.website ?? tags['contact:website'],
    mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    openingHoursSummary: tags.opening_hours,
    distanceMeters: haversineDistanceMeters(origin, coords),
    source: 'osm',
  };
}

export function normalizeOsmResponse(
  elements: OsmElement[] | undefined,
  origin: GeoPosition
): RecordStore[] {
  if (!elements?.length) return [];

  const seen = new Set<string>();
  const stores: RecordStore[] = [];

  for (const element of elements) {
    const normalized = normalizeOsmElement(element, origin);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }

  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}