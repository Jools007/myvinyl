import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleRecordStores } from '../testFixtures';
import { handleWalkingRoute } from './routesHandler';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handleWalkingRoute', () => {
  it('POSTs to Google Routes computeRoutes with walk mode and waypoint optimization', async () => {
    let routesUrl = '';
    let routesBody: Record<string, unknown> = {};
    let routesApiKey = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        routesUrl = url;
        routesApiKey = (init?.headers as Record<string, string>)['X-Goog-Api-Key'] ?? '';
        routesBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            routes: [
              {
                duration: '900s',
                distanceMeters: 1200,
                optimizedIntermediateWaypointIndex: [0],
                legs: [
                  {
                    duration: '240s',
                    distanceMeters: 320,
                    steps: [{ navigationInstruction: { instructions: 'Head north' } }],
                  },
                  {
                    duration: '660s',
                    distanceMeters: 880,
                    steps: [{ navigationInstruction: { instructions: 'Turn right' } }],
                  },
                ],
              },
            ],
          }),
          { status: 200 }
        );
      })
    );

    const origin = { latitude: 51.5, longitude: -0.12 };
    const selected = ['places/open-vinyl', 'places/open-crate'];
    const route = await handleWalkingRoute('routes-test-key', {
      origin,
      stores: sampleRecordStores,
      selectedStoreIds: selected,
    });

    expect(routesUrl).toBe('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(routesApiKey).toBe('routes-test-key');
    expect(routesBody.travelMode).toBe('WALK');
    expect(routesBody.optimizeWaypointOrder).toBe(true);
    expect(route.orderedStoreIds.length).toBe(2);
    expect(route.legs[0].steps[0]).toContain('Head north');
  });

  it('fixture mode builds route legs from bundled Routes JSON without calling Google', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const route = await handleWalkingRoute(
      undefined,
      {
        origin: { latitude: 51.5, longitude: -0.12 },
        stores: sampleRecordStores,
        selectedStoreIds: ['places/open-vinyl', 'places/open-crate'],
      },
      { useFixture: true }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(route.legs).toHaveLength(2);
    expect(route.legs[0].steps[0]).toContain('Groove Lane');
  });

  it('falls back to nearest-neighbor ordering when Routes API key is absent', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const route = await handleWalkingRoute(undefined, {
      origin: { latitude: 51.5, longitude: -0.12 },
      stores: sampleRecordStores,
      selectedStoreIds: ['places/open-vinyl', 'places/open-crate'],
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(route.orderedStoreIds).toHaveLength(2);
    expect(route.legs.length).toBe(2);
  });
});