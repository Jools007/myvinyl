import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { sortStoresByDistance, withDistancesFrom } from './sort';

const baseStore = (id: string, lat: number, lon: number): Omit<RecordStore, 'distanceMeters'> => ({
  id,
  name: `Store ${id}`,
  address: `${id} Street`,
  latitude: lat,
  longitude: lon,
});

describe('withDistancesFrom + sortStoresByDistance', () => {
  it('sorts stores closest-first from origin', () => {
    const origin = { latitude: 51.5, longitude: -0.12 };
    const stores = withDistancesFrom(
      [
        baseStore('far', 51.52, -0.12),
        baseStore('near', 51.501, -0.121),
        baseStore('mid', 51.51, -0.12),
      ],
      origin
    );
    const sorted = sortStoresByDistance(stores);
    expect(sorted.map((s) => s.id)).toEqual(['near', 'mid', 'far']);
  });
});