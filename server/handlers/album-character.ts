import { resolveAlbumCharacter } from '../album-character';

export type AlbumCharacterQuery = {
  artist: string;
  album: string;
  genres?: string[];
};

export class AlbumCharacterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AlbumCharacterValidationError';
  }
}

export function parseAlbumCharacterQuery(
  query: Record<string, string | string[] | undefined>
): AlbumCharacterQuery {
  const pick = (key: string) => {
    const value = query[key];
    if (Array.isArray(value)) return value;
    if (value != null) return [value];
    return [];
  };

  const artist = (pick('artist')[0] ?? '').trim();
  const album = (pick('album')[0] ?? '').trim();
  if (!artist || !album) {
    throw new AlbumCharacterValidationError('artist and album required');
  }

  const genres = [...pick('genres'), ...pick('genre')]
    .flatMap((v) => v.split(','))
    .map((g) => g.trim())
    .filter(Boolean);

  return { artist, album, genres: genres.length ? genres : undefined };
}

export type AlbumCharacterEnv = {
  lastfmKey?: string;
};

export async function handleAlbumCharacter(
  input: AlbumCharacterQuery,
  env: AlbumCharacterEnv
) {
  return resolveAlbumCharacter(input, env);
}