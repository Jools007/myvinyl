import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { filterOpenNowStores } from './openNow';

const store = (id: string, openNow?: boolean): RecordStore => ({
  id,
  name: id,
  address: '1 High St',
  latitude: 51.5,
  longitude: -0.12,
  distanceMeters: 100,
  openNow,
});

describe('filterOpenNowStores', () => {
  it('keeps only stores with openNow true', () => {
    const stores = [store('a', true), store('b', false), store('c', undefined), store('d', true)];
    const filtered = filterOpenNowStores(stores);
    expect(filtered.map((s) => s.id)).toEqual(['a', 'd']);
  });
});