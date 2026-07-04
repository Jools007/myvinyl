import { getPlacesFixturePlaces, getRoutesFixturePayload } from '../fixtures/loadFixtures';

const PLACES_HOST = 'places.googleapis.com';
const ROUTES_HOST = 'routes.googleapis.com';

export type GoogleFetchMode = 'live' | 'fixture';

export type GoogleFetchFn = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

export const FIXTURE_API_KEY = 'fixture-intercept';

function urlString(input: string | URL | Request): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function isGooglePlacesUrl(url: string): boolean {
  return url.includes(PLACES_HOST);
}

function isGoogleRoutesUrl(url: string): boolean {
  return url.includes(ROUTES_HOST);
}

function fixtureResponseForUrl(url: string): Response {
  if (isGooglePlacesUrl(url)) {
    return new Response(JSON.stringify({ places: getPlacesFixturePlaces() }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (isGoogleRoutesUrl(url)) {
    return new Response(JSON.stringify(getRoutesFixturePayload()), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  throw new Error(`Fixture fetch cannot handle URL: ${url}`);
}

export function createGoogleFetch(mode: GoogleFetchMode): GoogleFetchFn {
  if (mode === 'live') {
    return globalThis.fetch.bind(globalThis) as GoogleFetchFn;
  }

  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = urlString(input);
    if (isGooglePlacesUrl(url) || isGoogleRoutesUrl(url)) {
      return fixtureResponseForUrl(url);
    }
    return globalThis.fetch(input, init);
  };
}

export function isRecordLocatorFixtureMode(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env.RECORD_LOCATOR_FIXTURE === '1';
}

export function resolveRecordLocatorApiKey(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (key) return key;
  return isRecordLocatorFixtureMode(env) ? FIXTURE_API_KEY : undefined;
}

export function resolveRecordLocatorFetch(
  env: Record<string, string | undefined> = process.env
): GoogleFetchFn {
  return createGoogleFetch(isRecordLocatorFixtureMode(env) ? 'fixture' : 'live');
}