import { isCompilationAlbum } from './enrich-scoring';

/** Well-known studio albums for artists whose compilations mislead streaming APIs. */
const STUDIO_ALBUMS_BY_ARTIST: Record<string, string[]> = {
  sade: ['Diamond Life', 'Promise', 'Love Deluxe', 'Stronger Than Pride'],
  madonna: ['Madonna', 'Like a Virgin', 'True Blue', 'Like a Prayer'],
  prince: ['1999', 'Purple Rain', 'Sign o\' the Times'],
};

export function knownStudioAlbumsForArtist(artist: string): string[] {
  const primary = artist.split(',')[0].trim().toLowerCase();
  for (const [key, albums] of Object.entries(STUDIO_ALBUMS_BY_ARTIST)) {
    if (primary === key || primary.includes(key)) return [...albums];
  }
  return [];
}

export function resolveStudioAlbumTitles(
  artist: string,
  releaseAlbum?: string,
  lastfmAlbum?: string
): string[] {
  const out = new Set<string>();
  const compilation = isCompilationAlbum(releaseAlbum);

  if (lastfmAlbum?.trim() && !isCompilationAlbum(lastfmAlbum)) {
    out.add(lastfmAlbum.trim());
  }

  if (compilation) {
    for (const title of knownStudioAlbumsForArtist(artist)) {
      out.add(title);
    }
  }

  return [...out];
}