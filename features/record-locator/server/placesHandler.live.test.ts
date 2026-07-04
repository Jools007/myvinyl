import { describe, expect, it } from 'vitest';
import { handleNearbyRecordStores } from './placesHandler';

/**
 * Proves the shipped live branch issues real HTTP to places.googleapis.com
 * (invalid key → Google 4xx, handler surfaces error). No fetch stub.
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
});