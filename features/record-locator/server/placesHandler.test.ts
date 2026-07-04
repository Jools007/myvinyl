import { afterEach, describe, expect, it, vi } from 'vitest';
import { googlePlacesNearbyPayload } from '../testFixtures';
import {
  handleNearbyRecordStores,
  parsePlacesSearchBody,
  RecordLocatorValidationError,
} from './placesHandler';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parsePlacesSearchBody', () => {
  it('parses valid coordinates from proxy request bodies', () => {
    expect(parsePlacesSearchBody({ latitude: 51.5, longitude: -0.12 })).toEqual({
      latitude: 51.5,
      longitude: -0.12,
      radiusMeters: 8000,
    });
  });

  it('rejects invalid latitude', () => {
    expect(() => parsePlacesSearchBody({ latitude: 999, longitude: 0 })).toThrow(
      RecordLocatorValidationError
    );
  });
});

describe('handleNearbyRecordStores', () => {
  it('refuses to run without a server API key', async () => {
    await expect(
      handleNearbyRecordStores(undefined, { latitude: 51.5, longitude: -0.12 })
    ).rejects.toThrow('GOOGLE_PLACES_API_KEY not configured');
  });

  it('fixture mode normalizes bundled Places JSON without calling Google or needing a key', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { stores } = await handleNearbyRecordStores(
      undefined,
      { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 },
      { useFixture: true }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(stores).toHaveLength(3);
    expect(stores.filter((s) => s.openNow).length).toBe(2);
    expect(stores[0].name).toBe('Open Vinyl');
  });

  it('issues four Google Places (New) POSTs with correct endpoints, headers, and payloads', async () => {
    const captured: {
      url: string;
      apiKey: string | null;
      fieldMask: string | null;
      body: Record<string, unknown>;
    }[] = [];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string> | undefined;
      captured.push({
        url,
        apiKey: headers?.['X-Goog-Api-Key'] ?? null,
        fieldMask: headers?.['X-Goog-FieldMask'] ?? null,
        body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      });
      return new Response(JSON.stringify(googlePlacesNearbyPayload), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 };
    const { stores } = await handleNearbyRecordStores('server-only-test-key', input);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(captured.every((c) => c.apiKey === 'server-only-test-key')).toBe(true);
    expect(captured.every((c) => c.fieldMask?.includes('places.displayName'))).toBe(true);

    const nearbyRecord = captured.find(
      (c) =>
        c.url.endsWith('places:searchNearby') &&
        (c.body.includedTypes as string[])?.includes('record_store')
    );
    const nearbyMusic = captured.find(
      (c) =>
        c.url.endsWith('places:searchNearby') &&
        (c.body.includedTypes as string[])?.includes('music_store')
    );
    const textVinyl = captured.find(
      (c) => c.url.endsWith('places:searchText') && c.body.textQuery === 'vinyl records store'
    );
    const textRecord = captured.find(
      (c) => c.url.endsWith('places:searchText') && c.body.textQuery === 'record store'
    );

    expect(nearbyRecord?.body.rankPreference).toBe('DISTANCE');
    expect(nearbyMusic?.body.rankPreference).toBe('DISTANCE');
    expect(
      (nearbyRecord?.body.locationRestriction as { circle?: { center?: unknown } })?.circle?.center
    ).toEqual({ latitude: 51.5, longitude: -0.12 });
    expect(textVinyl?.body.textQuery).toBe('vinyl records store');
    expect(textRecord?.body.textQuery).toBe('record store');

    expect(stores.length).toBeGreaterThanOrEqual(2);
    expect(stores[0].name).toBe('Open Vinyl');
    expect(stores[0].openNow).toBe(true);
    expect(stores.find((s) => s.name === 'Closed Spin')?.openNow).toBe(false);
    expect(stores[0].distanceMeters).toBeLessThan(
      stores.find((s) => s.name === 'Closed Spin')!.distanceMeters
    );
  });
});