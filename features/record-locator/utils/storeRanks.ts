import type { RecordStore } from '../types';

export function buildStoreRankMap(stores: RecordStore[]): Map<string, number> {
  const ranks = new Map<string, number>();
  stores.forEach((store, index) => {
    ranks.set(store.id, index + 1);
  });
  return ranks;
}