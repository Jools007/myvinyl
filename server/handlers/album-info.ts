import { withTimeout } from '../enrich-timeout';
import { getAlbumInfo } from '../lastfm';

export type AlbumInfoInput = {
  artist: string;
  album: string;
  discogsNotes?: string;
};

export type AlbumInfoEnv = {
  lastfmKey?: string;
};

export class AlbumInfoValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlbumInfoValidationError';
  }
}

export function parseAlbumInfoQuery(
  query: Record<string, string | string[] | undefined>
): AlbumInfoInput {
  const pick = (key: string) => {
    const value = query[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const artist = pick('artist')?.trim() ?? '';
  const album = pick('album')?.trim() ?? '';
  if (!artist || !album) {
    throw new AlbumInfoValidationError('artist and album required');
  }

  return {
    artist,
    album,
    discogsNotes: pick('discogsNotes')?.trim() || undefined,
  };
}

export async function handleAlbumInfo(
  input: AlbumInfoInput,
  env: AlbumInfoEnv
): Promise<{ description: string | null }> {
  let description =
    input.discogsNotes?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';

  if (env.lastfmKey) {
    try {
      const info = await withTimeout(
        getAlbumInfo(env.lastfmKey, input.artist, input.album),
        6000,
        null
      );
      const wiki = info?.wikiText?.replace(/\s+/g, ' ').trim();
      if (wiki && wiki.length > (description?.length ?? 0)) {
        description = wiki;
      }
    } catch (error) {
      console.error(
        '[handleAlbumInfo] Last.fm lookup failed:',
        error instanceof Error ? error.message : error
      );
    }
  }

  if (description.length > 520) {
    description = `${description.slice(0, 517).trim()}…`;
  }

  return { description: description || null };
}