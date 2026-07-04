import { describe, expect, it } from 'vitest';
import { isLikelyRecordShop, normalizeOsmElement, normalizeOsmResponse } from './osmNormalize';

describe('isLikelyRecordShop', () => {
  it('accepts music and vinyl shops', () => {
    expect(isLikelyRecordShop({ shop: 'music', name: 'Muzikumas' })).toBe(true);
    expect(isLikelyRecordShop({ shop: 'vinyl', name: 'Viniloteka' })).toBe(true);
  });

  it('rejects flooring false positives', () => {
    expect(isLikelyRecordShop({ name: 'Lispimeks dangos ir vinilinės grindys' })).toBe(false);
  });
});

describe('normalizeOsmResponse', () => {
  it('normalizes Vilnius-style OSM elements with distance sorting', () => {
    const origin = { latitude: 54.6872, longitude: 25.2797 };
    const stores = normalizeOsmResponse(
      [
        {
          type: 'node',
          id: 1,
          lat: 54.6753844,
          lon: 25.285,
          tags: { name: 'Muzikumas', shop: 'music', 'addr:street': 'Aušros Vartų g. 13' },
        },
        {
          type: 'node',
          id: 2,
          lat: 54.6877273,
          lon: 25.29,
          tags: { name: 'Viniloteka', shop: 'vinyl' },
        },
      ],
      origin
    );

    expect(stores).toHaveLength(2);
    expect(stores.map((s) => s.name)).toContain('Muzikumas');
    expect(stores.map((s) => s.name)).toContain('Viniloteka');
    expect(stores.every((s) => s.source === 'osm')).toBe(true);
    expect(stores.every((s) => s.distanceMeters < 5000)).toBe(true);
  });

  it('normalizes a single element', () => {
    const store = normalizeOsmElement(
      {
        type: 'node',
        id: 99,
        lat: 54.68,
        lon: 25.28,
        tags: {
          name: 'VinyloMania',
          shop: 'music',
          phone: '+370 614 75907',
          website: 'https://example.com',
        },
      },
      { latitude: 54.6872, longitude: 25.2797 }
    );
    expect(store?.name).toBe('VinyloMania');
    expect(store?.phone).toContain('370');
    expect(store?.website).toContain('https://');
  });
});