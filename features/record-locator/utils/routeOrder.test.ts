import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import { optimizeWalkingWaypointOrder } from './routeOrder';

const origin = { latitude: 0, longitude: 0 };

const store = (id: string, lat: number, lon: number): RecordStore => ({
  id,
  name: id,
  address: id,
  latitude: lat,
  longitude: lon,
  distanceMeters: Math.hypot(lat, lon) * 111_000,
});

describe('optimizeWalkingWaypointOrder', () => {
  it('returns nearest-neighbor order from origin', () => {
    const stores = [store('far', 0.01, 0.01), store('near', 0.001, 0.001), store('mid', 0.005, 0)];
    const order = optimizeWalkingWaypointOrder(origin, stores, ['far', 'near', 'mid']);
    expect(order[0]).toBe('near');
    expect(order).toHaveLength(3);
    expect(new Set(order)).toEqual(new Set(['near', 'mid', 'far']));
  });

  it('preserves single selection', () => {
    const stores = [store('only', 0.002, 0.002)];
    expect(optimizeWalkingWaypointOrder(origin, stores, ['only'])).toEqual(['only']);
  });
});