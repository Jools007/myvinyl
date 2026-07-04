import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { buildStoreRankMap } from './storeRanks';

const store = (id: string): RecordStore => ({
  id,
  name: id,
  address: '1 High St',
  latitude: 51.5,
  longitude: -0.12,
  distanceMeters: 100,
});

describe('buildStoreRankMap', () => {
  it('assigns 1-based ranks in list order', () => {
    const ranks = buildStoreRankMap([store('a'), store('b'), store('c')]);
    expect(ranks.get('a')).toBe(1);
    expect(ranks.get('b')).toBe(2);
    expect(ranks.get('c')).toBe(3);
  });
});