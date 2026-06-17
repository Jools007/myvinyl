import { cleanAlbumText, fetchAlbumCharacter } from './api';
import { clampLabelDescription } from './labelContent';
import type { VinylRecord } from './types';

function storeBaseDescription(recordId: string, text: string): string {
  const clamped = clampLabelDescription(text.trim());
  cache.set(recordId, clamped);
  return clamped;
}

export type AlbumDescriptionSource = Pick<
  VinylRecord,
  'id' | 'artist' | 'title' | 'year' | 'discogsId' | 'genres' | 'characterBlurb'
>;

const cache = new Map<string, string>();
let cacheGeneration = 0;

export function peekCachedBaseAlbumDescription(recordId: string): string | undefined {
  return cache.get(recordId);
}

/** Drop in-memory description cache (e.g. before bulk character refresh). */
export function clearAlbumDescriptionCache(): void {
  cache.clear();
  cacheGeneration += 1;
}

export function albumDescriptionCacheGeneration(): number {
  return cacheGeneration;
}

/** Musical character copy — not personal crate notes or pressing variants. */
export async function fetchBaseAlbumDescription(
  source: AlbumDescriptionSource,
  opts?: { force?: boolean }
): Promise<string> {
  const stored = source.characterBlurb?.trim();
  if (stored && !opts?.force) {
    return storeBaseDescription(source.id, stored);
  }

  const cached = !opts?.force ? cache.get(source.id) : undefined;
  if (cached !== undefined) return cached;

  try {
    const result = await fetchAlbumCharacter(
      source.artist,
      source.title,
      source.genres ?? [],
      source.year
    );
    const text = cleanAlbumText(result.description ?? '');
    return storeBaseDescription(source.id, text);
  } catch {
    return storeBaseDescription(source.id, '');
  }
}

/** Full display text (up to 520 chars) for About this release. */
export async function fetchAlbumCharacterDescription(
  source: AlbumDescriptionSource,
  opts?: { force?: boolean }
): Promise<string> {
  const stored = source.characterBlurb?.trim();
  if (stored && !opts?.force) return cleanAlbumText(stored);

  if (!opts?.force) {
    const cached = peekCachedBaseAlbumDescription(source.id);
    if (cached !== undefined) return cleanAlbumText(cached);
  }

  try {
    const result = await fetchAlbumCharacter(
      source.artist,
      source.title,
      source.genres ?? [],
      source.year
    );
    const text = cleanAlbumText(result.description ?? '');
    cache.set(source.id, clampLabelDescription(text));
    return text;
  } catch {
    return '';
  }
}