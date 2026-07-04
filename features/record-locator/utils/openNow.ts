import type { RecordStore } from '../types';

export function isStoreOpenNow(store: RecordStore): boolean {
  return store.openNow === true;
}

export function filterOpenNowStores(stores: RecordStore[]): RecordStore[] {
  return stores.filter(isStoreOpenNow);
}