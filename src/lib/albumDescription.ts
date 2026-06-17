import { cleanAlbumText, fetchAlbumCharacter } from './api';
import { clampLabelDescription } from './labelContent';
import { isPersistedRecordId } from './records';
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

export type CharacterBlurbPersistHandler = (
  source: AlbumDescriptionSource,
  blurb: string
) => void;

const cache = new Map<string, string>();
const inflightByRecordId = new Map<string, Promise<string>>();
let cacheGeneration = 0;
let characterBlurbPersister: CharacterBlurbPersistHandler | null = null;

export function registerCharacterBlurbPersister(
  handler: CharacterBlurbPersistHandler | null
): void {
  characterBlurbPersister = handler;
}

export function peekCachedBaseAlbumDescription(recordId: string): string | undefined {
  return cache.get(recordId);
}

/** Drop in-memory description cache (e.g. before bulk character refresh). */
export function clearAlbumDescriptionCache(): void {
  cache.clear();
  cacheGeneration += 1;
  inflightByRecordId.clear();
}

export function albumDescriptionCacheGeneration(): number {
  return cacheGeneration;
}

function maybePersistCharacterBlurb(source: AlbumDescriptionSource, blurb: string): void {
  const trimmed = blurb.trim();
  if (!trimmed) return;
  if (source.characterBlurb?.trim()) return;
  if (!isPersistedRecordId(source.id)) return;
  characterBlurbPersister?.(source, trimmed);
}

async function resolveCharacterDescription(
  source: AlbumDescriptionSource,
  opts?: { force?: boolean }
): Promise<string> {
  const stored = source.characterBlurb?.trim();
  if (stored && !opts?.force) {
    cache.set(source.id, clampLabelDescription(stored));
    return stored;
  }

  if (!opts?.force) {
    const cached = cache.get(source.id);
    if (cached !== undefined) return cached;
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
    maybePersistCharacterBlurb(source, text);
    return text;
  } catch {
    cache.set(source.id, '');
    return '';
  }
}

function loadCharacterDescription(
  source: AlbumDescriptionSource,
  opts?: { force?: boolean }
): Promise<string> {
  if (opts?.force || !isPersistedRecordId(source.id)) {
    return resolveCharacterDescription(source, opts);
  }

  const inflight = inflightByRecordId.get(source.id);
  if (inflight) return inflight;

  const promise = resolveCharacterDescription(source, opts).finally(() => {
    if (inflightByRecordId.get(source.id) === promise) {
      inflightByRecordId.delete(source.id);
    }
  });
  inflightByRecordId.set(source.id, promise);
  return promise;
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

  const text = await loadCharacterDescription(source, opts);
  return storeBaseDescription(source.id, text);
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

  const text = await loadCharacterDescription(source, opts);
  return cleanAlbumText(text);
}