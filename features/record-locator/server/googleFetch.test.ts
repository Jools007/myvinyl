import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGoogleFetch,
  isRecordLocatorFixtureMode,
  resolveRecordLocatorApiKey,
  resolveRecordLocatorFetch,
} from './googleFetch';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createGoogleFetch', () => {
  it('fixture mode intercepts Google Places and Routes URLs without calling global fetch', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);

    const fetchFn = createGoogleFetch('fixture');
    const placesResponse = await fetchFn('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
    });
    const routesResponse = await fetchFn(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      { method: 'POST' }
    );

    expect(globalFetch).not.toHaveBeenCalled();
    expect(placesResponse.status).toBe(200);
    expect(routesResponse.status).toBe(200);

    const placesPayload = (await placesResponse.json()) as { places?: unknown[] };
    const routesPayload = (await routesResponse.json()) as { routes?: unknown[] };
    expect(placesPayload.places?.length).toBe(3);
    expect(routesPayload.routes?.length).toBe(1);
  });

  it('fixture mode delegates non-Google URLs to global fetch', async () => {
    const globalFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', globalFetch);

    const fetchFn = createGoogleFetch('fixture');
    const response = await fetchFn('https://example.com/ping');

    expect(globalFetch).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(200);
  });

  it('live mode delegates to global fetch', async () => {
    const globalFetch = vi.fn(async () => new Response('live', { status: 200 }));
    vi.stubGlobal('fetch', globalFetch);

    const fetchFn = createGoogleFetch('live');
    await fetchFn('https://places.googleapis.com/v1/places:searchNearby');

    expect(globalFetch).toHaveBeenCalledTimes(1);
  });
});

describe('resolveRecordLocator runtime', () => {
  it('supplies placeholder API key and fixture fetch when RECORD_LOCATOR_FIXTURE=1', () => {
    const env = { RECORD_LOCATOR_FIXTURE: '1' };
    expect(isRecordLocatorFixtureMode(env)).toBe(true);
    expect(resolveRecordLocatorApiKey(env)).toBe('fixture-intercept');
    expect(resolveRecordLocatorFetch(env)).toBeTypeOf('function');
  });

  it('requires real API key in live mode', () => {
    const env = { RECORD_LOCATOR_FIXTURE: '', GOOGLE_PLACES_API_KEY: '  real-key  ' };
    expect(isRecordLocatorFixtureMode(env)).toBe(false);
    expect(resolveRecordLocatorApiKey(env)).toBe('real-key');
  });
});