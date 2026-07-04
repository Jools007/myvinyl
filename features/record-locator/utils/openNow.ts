import type { RecordStore } from '../types';
import { evaluateOsmOpeningHours } from './openingHours';

export function resolveStoreOpenNow(store: RecordStore, date: Date = new Date()): boolean | undefined {
  if (store.openNow != null) return store.openNow;
  if (!store.openingHoursSummary) return undefined;
  return evaluateOsmOpeningHours(store.openingHoursSummary, date).openNow;
}

export function isStoreOpenNow(store: RecordStore, date: Date = new Date()): boolean {
  return resolveStoreOpenNow(store, date) === true;
}

export function filterOpenNowStores(stores: RecordStore[], date: Date = new Date()): RecordStore[] {
  return stores.filter((store) => isStoreOpenNow(store, date));
}