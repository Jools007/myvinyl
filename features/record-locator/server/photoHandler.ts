import type { GoogleFetchFn } from './googleFetch';

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#1a1a1e"/>
  <circle cx="200" cy="130" r="48" fill="#2a2a32" stroke="#5eb8ad" stroke-width="3"/>
  <circle cx="200" cy="130" r="16" fill="#5eb8ad"/>
  <text x="200" y="220" text-anchor="middle" fill="#a8a6a0" font-family="system-ui,sans-serif" font-size="16">Record shop</text>
</svg>`;

export class RecordLocatorPhotoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecordLocatorPhotoError';
  }
}

export function parsePhotoNameParam(value: string | null | undefined): string {
  const name = value?.trim();
  if (!name) {
    throw new RecordLocatorPhotoError('Photo name is required');
  }
  if (!name.startsWith('places/')) {
    throw new RecordLocatorPhotoError('Invalid photo reference');
  }
  return name;
}

export type PlacePhotoResult =
  | { kind: 'redirect'; location: string }
  | { kind: 'svg'; body: string; contentType: string };

export async function resolvePlacePhoto(
  apiKey: string | undefined,
  photoName: string,
  fetchFn: GoogleFetchFn
): Promise<PlacePhotoResult> {
  if (!apiKey?.trim()) {
    return {
      kind: 'svg',
      body: PLACEHOLDER_SVG,
      contentType: 'image/svg+xml',
    };
  }

  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  mediaUrl.searchParams.set('maxHeightPx', '480');
  mediaUrl.searchParams.set('maxWidthPx', '640');
  mediaUrl.searchParams.set('skipHttpRedirect', 'true');

  const response = await fetchFn(mediaUrl.toString(), {
    headers: { 'X-Goog-Api-Key': apiKey },
  });

  if (!response.ok) {
    throw new RecordLocatorPhotoError(`Google photo lookup failed (${response.status})`);
  }

  const payload = (await response.json()) as { photoUri?: string };
  if (!payload.photoUri) {
    throw new RecordLocatorPhotoError('Google photo lookup returned no image');
  }

  return { kind: 'redirect', location: payload.photoUri };
}