import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { findNearestOpenStore } from './nearestOpenStore';

const store = (id: string, distanceMeters: number, openNow?: boolean): RecordStore => ({
  id,
  name: id,
  address: '1 High St',
  latitude: 51.5,
  longitude: -0.12,
  distanceMeters,
  openNow,
});

describe('findNearestOpenStore', () => {
  it('returns the closest open store', () => {
    const stores = [store('closed-near', 100, false), store('open-far', 900, true), store('open-near', 250, true)];
    expect(findNearestOpenStore(stores)?.id).toBe('open-near');
  });

  it('returns null when nothing is open', () => {
    expect(findNearestOpenStore([store('a', 100, false), store('b', 200, undefined)])).toBeNull();
  });
});