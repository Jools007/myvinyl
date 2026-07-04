import type { GeoPosition, RecordStore } from '../types';
import { haversineDistanceMeters } from './geo';

/**
 * Nearest-neighbor walk order from an origin through selected stores.
 * Returns store ids in visit order (not including origin).
 */
export function optimizeWalkingWaypointOrder(
  origin: GeoPosition,
  stores: RecordStore[],
  selectedIds: string[]
): string[] {
  const selected = stores.filter((s) => selectedIds.includes(s.id));
  if (selected.length <= 1) return selected.map((s) => s.id);

  const remaining = new Map(selected.map((s) => [s.id, s]));
  const ordered: string[] = [];
  let cursor: GeoPosition = origin;

  while (remaining.size > 0) {
    let nearestId: string | null = null;
    let nearestDistance = Infinity;

    for (const [id, store] of remaining) {
      const distance = haversineDistanceMeters(cursor, {
        latitude: store.latitude,
        longitude: store.longitude,
      });
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }

    if (!nearestId) break;
    const next = remaining.get(nearestId)!;
    remaining.delete(nearestId);
    ordered.push(nearestId);
    cursor = { latitude: next.latitude, longitude: next.longitude };
  }

  return ordered;
}

export function storesByIds(stores: RecordStore[], ids: string[]): RecordStore[] {
  const map = new Map(stores.map((s) => [s.id, s]));
  return ids.map((id) => map.get(id)).filter((s): s is RecordStore => Boolean(s));
}