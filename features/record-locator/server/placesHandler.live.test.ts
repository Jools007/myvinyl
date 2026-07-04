import { describe, expect, it } from 'vitest';
import { createGoogleFetch } from './googleFetch';
import { handleNearbyRecordStores } from './placesHandler';

const hasLiveKey = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
const runLiveNetwork = process.env.RECORD_LOCATOR_LIVE === '1';

describe('handleNearbyRecordStores fixture mode', () => {
  it('runs Google orchestration with injected fixture fetch for tests', async () => {
    const fetchFn = createGoogleFetch('fixture');
    const nominatimFetch: typeof fetchFn = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('nominatim.openstreetmap.org')) {
        return new Response(JSON.stringify({ address: { city: 'London', country: 'UK' } }), {
          status: 200,
        });
      }
      return fetchFn(input, init);
    };

    const { stores, meta } = await handleNearbyRecordStores(
      'fixture-intercept',
      { latitude: 51.5074, longitude: -0.1278, radiusMeters: 3000 },
      { fetchFn: nominatimFetch }
    );

    expect(stores.length).toBe(3);
    expect(meta.source).toBe('fixture');
    expect(stores.filter((s) => s.openNow).length).toBe(2);
  });
});

describe.skipIf(!runLiveNetwork)('handleNearbyRecordStores live network', () => {
  it('returns real Vilnius OSM shops without any Google API key', async () => {
    const { stores, meta } = await handleNearbyRecordStores(undefined, {
      latitude: 54.6872,
      longitude: 25.2797,
      radiusMeters: 12_000,
    });

    expect(stores.length).toBeGreaterThan(0);
    expect(meta.source).toBe('osm');
    expect(meta.locationLabel.toLowerCase()).toContain('vilnius');
    expect(stores[0].distanceMeters).toBeLessThan(15_000);
  }, 45_000);

  it.skipIf(!hasLiveKey)(
    'merges Google Places with OSM when GOOGLE_PLACES_API_KEY is configured',
    async () => {
      const { stores, meta } = await handleNearbyRecordStores(process.env.GOOGLE_PLACES_API_KEY!.trim(), {
        latitude: 54.6872,
        longitude: 25.2797,
        radiusMeters: 12_000,
      });
      expect(stores.length).toBeGreaterThan(0);
      expect(['google', 'combined', 'osm']).toContain(meta.source);
    },
    45_000
  );
});