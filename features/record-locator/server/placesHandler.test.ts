import { afterEach, describe, expect, it, vi } from 'vitest';
import { googlePlacesNearbyPayload } from '../testFixtures';
import { createGoogleFetch, type GoogleFetchFn } from './googleFetch';
import {
  handleNearbyRecordStores,
  parsePlacesSearchBody,
  RecordLocatorValidationError,
} from './placesHandler';

const vilniusOsmPayload = {
  elements: [
    {
      type: 'node',
      id: 100,
      lat: 54.6753844,
      lon: 25.285,
      tags: { name: 'Muzikumas', shop: 'music', 'addr:street': 'Aušros Vartų g. 13' },
    },
    {
      type: 'node',
      id: 101,
      lat: 54.6877273,
      lon: 25.29,
      tags: { name: 'Viniloteka', shop: 'vinyl' },
    },
  ],
};

const nominatimPayload = {
  address: { city: 'Vilnius', country: 'Lithuania' },
  display_name: 'Vilnius, Lithuania',
};

function mockOsmAndGeocodeFetch(): GoogleFetchFn {
  return vi.fn(async (url: string) => {
    if (url.includes('overpass-api.de')) {
      return new Response(JSON.stringify(vilniusOsmPayload), { status: 200 });
    }
    if (url.includes('nominatim.openstreetmap.org')) {
      return new Response(JSON.stringify(nominatimPayload), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as GoogleFetchFn;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parsePlacesSearchBody', () => {
  it('parses valid coordinates from proxy request bodies', () => {
    expect(parsePlacesSearchBody({ latitude: 51.5, longitude: -0.12 })).toEqual({
      latitude: 51.5,
      longitude: -0.12,
      radiusMeters: 12_000,
    });
  });

  it('rejects invalid latitude', () => {
    expect(() => parsePlacesSearchBody({ latitude: 999, longitude: 0 })).toThrow(
      RecordLocatorValidationError
    );
  });
});

describe('handleNearbyRecordStores', () => {
  it('searches OpenStreetMap for real local shops when no Google API key is configured', async () => {
    const fetchFn = mockOsmAndGeocodeFetch();
    const { stores, meta } = await handleNearbyRecordStores(undefined, {
      latitude: 54.6872,
      longitude: 25.2797,
      radiusMeters: 12_000,
    }, { fetchFn });

    expect(meta.source).toBe('osm');
    expect(meta.locationLabel).toContain('Vilnius');
    expect(stores.length).toBeGreaterThanOrEqual(2);
    expect(stores[0].distanceMeters).toBeLessThan(15_000);
    expect(stores.every((s) => s.source === 'osm')).toBe(true);
  });

  it('fixture fetch runs full Google orchestration for explicit test mode', async () => {
    const baseFetch = createGoogleFetch('fixture');
    const googleUrls: string[] = [];
    const fetchFn: GoogleFetchFn = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('nominatim.openstreetmap.org')) {
        return new Response(
          JSON.stringify({ address: { city: 'London', country: 'UK' } }),
          { status: 200 }
        );
      }
      if (url.includes('googleapis.com')) {
        googleUrls.push(url);
        return baseFetch(input, init);
      }
      return new Response('{}', { status: 200 });
    };

    const { stores, meta } = await handleNearbyRecordStores(
      'fixture-intercept',
      { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 },
      { fetchFn }
    );

    expect(googleUrls.length).toBeGreaterThanOrEqual(4);
    expect(stores).toHaveLength(3);
    expect(meta.source).toBe('fixture');
  });

  it('issues five Google Places (New) POSTs with correct endpoints when key is present', async () => {
    const captured: { url: string; body: Record<string, unknown> }[] = [];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('googleapis.com')) {
        captured.push({
          url,
          body: JSON.parse(String(init?.body)) as Record<string, unknown>,
        });
        return new Response(JSON.stringify(googlePlacesNearbyPayload), { status: 200 });
      }
      if (url.includes('nominatim')) {
        return new Response(JSON.stringify({ display_name: 'London' }), { status: 200 });
      }
      if (url.includes('overpass')) {
        return new Response(JSON.stringify({ elements: [] }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const input = { latitude: 51.5, longitude: -0.12, radiusMeters: 8000 };
    const { stores } = await handleNearbyRecordStores('server-only-test-key', input, {
      fetchFn: fetchMock as unknown as GoogleFetchFn,
    });

    const googleCalls = captured.filter((c) => c.url.includes('googleapis.com'));
    expect(googleCalls.length).toBe(5);
    expect(stores.length).toBeGreaterThanOrEqual(2);
    expect(stores[0].name).toBe('Open Vinyl');
  });
});