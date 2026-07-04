import { describe, expect, it, vi } from 'vitest';
import { parsePhotoNameParam, resolvePlacePhoto } from './photoHandler';

describe('parsePhotoNameParam', () => {
  it('requires a places photo name', () => {
    expect(() => parsePhotoNameParam('')).toThrow(/required/i);
    expect(() => parsePhotoNameParam('bad/ref')).toThrow(/invalid/i);
    expect(parsePhotoNameParam('places/ChIJ/photos/abc')).toBe('places/ChIJ/photos/abc');
  });
});

describe('resolvePlacePhoto', () => {
  it('returns placeholder svg when no api key is configured', async () => {
    const result = await resolvePlacePhoto(undefined, 'places/ChIJ/photos/abc', vi.fn());
    expect(result.kind).toBe('svg');
  });

  it('redirects when Google returns a photo URI', async () => {
    const fetchFn = vi.fn(async () =>
      new Response(JSON.stringify({ photoUri: 'https://example.com/photo.jpg' }), { status: 200 })
    );
    const result = await resolvePlacePhoto('real-key', 'places/ChIJ/photos/abc', fetchFn);
    expect(result).toEqual({ kind: 'redirect', location: 'https://example.com/photo.jpg' });
  });
});