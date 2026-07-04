import type { RecordStore } from '../types';
import { resolveStoreOpenNow } from './openNow';

/** Returns the open shop with the smallest distanceMeters. */
export function findNearestOpenStore(stores: RecordStore[], date: Date = new Date()): RecordStore | null {
  let nearest: RecordStore | null = null;

  for (const store of stores) {
    if (resolveStoreOpenNow(store, date) !== true) continue;
    if (!nearest || store.distanceMeters < nearest.distanceMeters) {
      nearest = store;
    }
  }

  return nearest;
}