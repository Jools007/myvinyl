import { describe, expect, it } from 'vitest';
import { formatDistanceMeters, haversineDistanceMeters } from './geo';

describe('haversineDistanceMeters', () => {
  it('returns zero for identical coordinates', () => {
    const point = { latitude: 51.5074, longitude: -0.1278 };
    expect(haversineDistanceMeters(point, point)).toBe(0);
  });

  it('computes a known short walk distance', () => {
    const from = { latitude: 51.5074, longitude: -0.1278 };
    const to = { latitude: 51.508, longitude: -0.1285 };
    const meters = haversineDistanceMeters(from, to);
    expect(meters).toBeGreaterThan(50);
    expect(meters).toBeLessThan(200);
  });
});

describe('formatDistanceMeters', () => {
  it('formats sub-kilometer distances in meters', () => {
    expect(formatDistanceMeters(450)).toBe('450 m');
  });

  it('formats kilometer distances with one decimal under 10 km', () => {
    expect(formatDistanceMeters(1250)).toBe('1.3 km');
  });
});