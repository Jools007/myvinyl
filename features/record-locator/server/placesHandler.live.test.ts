import { describe, expect, it } from 'vitest';
import { createGoogleFetch } from './googleFetch';
import { handleNearbyRecordStores } from './placesHandler';

const hasLiveKey = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());

/**
 * Live outbound HTTP — uses shipped handler with default createGoogleFetch('live').
 * Invalid key proves real requests reach places.googleapis.com (no fetch stub).
 */
describe('handleNearbyRecordStores live Google HTTP', () => {
  it('reaches Google Places API and surfaces auth failure for an invalid key', async () => {
    await expect(
      handleNearbyRecordStores('invalid-key-proves-live-outbound', {
        latitude: 51.5074,
        longitude: -0.1278,
        radiusMeters: 3000,
      })
    ).rejects.toThrow(/Google Places API failed/);
  });

  it.skipIf(!hasLiveKey)(
    'returns normalized stores when GOOGLE_PLACES_API_KEY is configured (200 success path)',
    async () => {
      const { stores } = await handleNearbyRecordStores(process.env.GOOGLE_PLACES_API_KEY!.trim(), {
        latitude: 51.5074,
        longitude: -0.1278,
        radiusMeters: 3000,
      });
      expect(Array.isArray(stores)).toBe(true);
      expect(stores.length).toBeGreaterThan(0);
      expect(stores[0]).toMatchObject({
        id: expect.any(String),
        name: expect.any(String),
        address: expect.any(String),
        distanceMeters: expect.any(Number),
      });
    }
  );
});

/**
 * Shipped success path without network — same handler code as production, fixture fetch
 * intercepts Google URLs (identical to RECORD_LOCATOR_FIXTURE=1 proxy behavior).
 */
describe('handleNearbyRecordStores shipped success path (fixture fetch intercept)', () => {
  it('runs four-call orchestration and returns normalized stores via injected fixture fetch', async () => {
    const fetchFn = createGoogleFetch('fixture');
    const { stores } = await handleNearbyRecordStores('fixture-intercept', {
      latitude: 51.5074,
      longitude: -0.1278,
      radiusMeters: 3000,
    }, { fetchFn });

    expect(stores.length).toBe(3);
    expect(stores.every((s) => s.id && s.name && s.address)).toBe(true);
    expect(stores.filter((s) => s.openNow).length).toBe(2);
  });
});