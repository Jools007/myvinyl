import { cleanAlbumText, fetchAlbumDescription, fetchDiscogsRelease } from './api';
import { clampLabelDescription } from './labelContent';
import type { VinylRecord } from './types';

function storeBaseDescription(recordId: string, text: string): string {
  const clamped = clampLabelDescription(text.trim());
  cache.set(recordId, clamped);
  return clamped;
}

export type AlbumDescriptionSource = Pick<
  VinylRecord,
  'id' | 'artist' | 'title' | 'discogsId'
>;

const cache = new Map<string, string>();

export function peekCachedBaseAlbumDescription(recordId: string): string | undefined {
  return cache.get(recordId);
}

/** Album copy from Discogs / Last.fm — not personal crate notes. */
export async function fetchBaseAlbumDescription(
  source: AlbumDescriptionSource
): Promise<string> {
  const cached = cache.get(source.id);
  if (cached !== undefined) return cached;

  let discogsNotes: string | undefined;

  if (source.discogsId) {
    try {
      const release = await fetchDiscogsRelease(source.discogsId);
      discogsNotes = release.notes;
      const fromDiscogs = cleanAlbumText(discogsNotes);
      if (fromDiscogs) {
        return storeBaseDescription(source.id, fromDiscogs);
      }
    } catch {
      /* try album-info next */
    }
  }

  try {
    const text = await fetchAlbumDescription(source.artist, source.title, discogsNotes);
    return storeBaseDescription(source.id, text);
  } catch {
    return storeBaseDescription(source.id, '');
  }
}