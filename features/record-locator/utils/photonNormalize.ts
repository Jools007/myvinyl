import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';
import { isLikelyRecordShop } from './osmNormalize';

export type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    city?: string;
    postcode?: string;
    country?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

function photonOsmPath(type?: string): string {
  if (type === 'N' || type === 'node') return 'node';
  if (type === 'W' || type === 'way') return 'way';
  if (type === 'R' || type === 'relation') return 'relation';
  return 'node';
}

function photonId(feature: PhotonFeature): string {
  const type = photonOsmPath(feature.properties.osm_type);
  const id = feature.properties.osm_id ?? 0;
  return `photon/${type}/${id}`;
}

function photonAddress(props: PhotonFeature['properties']): string {
  const street = [props.street, props.housenumber].filter(Boolean).join(' ');
  const parts = [street, props.city, props.postcode, props.country].filter(Boolean);
  return parts.join(', ') || 'Address not listed';
}

export function normalizePhotonFeature(
  feature: PhotonFeature,
  origin: GeoPosition,
  maxDistanceMeters: number
): RecordStore | null {
  const [lon, lat] = feature.geometry.coordinates;
  const props = feature.properties;
  const name = props.name?.trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const tags: Record<string, string> = { name };
  if (props.osm_key === 'shop' && props.osm_value) {
    tags.shop = props.osm_value;
  }
  if (!isLikelyRecordShop(tags) && props.osm_value !== 'music' && props.osm_value !== 'vinyl') {
    if (!isLikelyRecordShop({ name })) return null;
  }

  const distanceMeters = haversineDistanceMeters(origin, { latitude: lat, longitude: lon });
  if (distanceMeters > maxDistanceMeters) return null;

  return {
    id: photonId(feature),
    name,
    address: photonAddress(props),
    latitude: lat,
    longitude: lon,
    distanceMeters,
    source: 'osm',
    mapsUrl: `https://www.openstreetmap.org/${photonOsmPath(props.osm_type)}/${props.osm_id ?? ''}`,
  };
}

export function normalizePhotonResponse(
  features: PhotonFeature[] | undefined,
  origin: GeoPosition,
  maxDistanceMeters: number
): RecordStore[] {
  if (!features?.length) return [];

  const seen = new Set<string>();
  const stores: RecordStore[] = [];

  for (const feature of features) {
    const normalized = normalizePhotonFeature(feature, origin, maxDistanceMeters);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }

  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}