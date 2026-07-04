import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';

export function withDistancesFrom(
  stores: Omit<RecordStore, 'distanceMeters'>[],
  origin: GeoPosition
): RecordStore[] {
  return stores.map((store) => ({
    ...store,
    distanceMeters: haversineDistanceMeters(origin, {
      latitude: store.latitude,
      longitude: store.longitude,
    }),
  }));
}

export function sortStoresByDistance(stores: RecordStore[]): RecordStore[] {
  return [...stores].sort((a, b) => a.distanceMeters - b.distanceMeters);
}