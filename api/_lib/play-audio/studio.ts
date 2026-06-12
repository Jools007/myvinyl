const COMPILATION_MARKERS =
  /\b(best of|greatest hits|gold|anthology|collection|essentials|very best|platinum|ultimate|classics)\b/i;

export function isCompilationAlbum(albumName?: string): boolean {
  if (!albumName?.trim()) return false;
  return COMPILATION_MARKERS.test(albumName);
}

/** Well-known studio albums for artists whose compilations mislead streaming APIs. */
const STUDIO_ALBUMS_BY_ARTIST: Record<string, string[]> = {
  sade: ['Diamond Life', 'Promise', 'Love Deluxe', 'Stronger Than Pride'],
  madonna: ['Madonna', 'Like a Virgin', 'True Blue', 'Like a Prayer'],
  prince: ['1999', 'Purple Rain', "Sign o' the Times"],
};

export function knownStudioAlbumsForArtist(artist: string): string[] {
  const primary = artist.split(',')[0].trim().toLowerCase();
  for (const [key, albums] of Object.entries(STUDIO_ALBUMS_BY_ARTIST)) {
    if (primary === key || primary.includes(key)) return [...albums];
  }
  return [];
}