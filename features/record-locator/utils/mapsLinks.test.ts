import { describe, expect, it } from 'vitest';
import { buildDirectionsUrl } from './mapsLinks';

describe('buildDirectionsUrl', () => {
  it('builds Apple Maps links when provider is apple', () => {
    const url = buildDirectionsUrl(
      { latitude: 54.68, longitude: 25.28 },
      'VinyloMania',
      { latitude: 54.69, longitude: 25.27 },
      'apple'
    );
    expect(url).toContain('maps.apple.com');
    expect(url).toContain('daddr=54.68%2C25.28');
    expect(url).toContain('saddr=54.69%2C25.27');
  });

  it('builds Google Maps links when provider is google', () => {
    const url = buildDirectionsUrl(
      { latitude: 54.68, longitude: 25.28 },
      'VinyloMania',
      undefined,
      'google'
    );
    expect(url).toContain('google.com/maps');
  });
});