const COMPILATION_MARKERS =
  /\b(best of|greatest hits|gold|anthology|collection|essentials|very best|platinum|ultimate|classics)\b/i;

const SOUNDTRACK_MARKERS =
  /\b(soundtrack|motion picture|original cast|ost|score|music from|from the film|from the film|from the movie)\b/i;

const VARIOUS_ARTIST_MARKERS =
  /^(various|various artists|v\/a|va|multi[- ]artist|diverse|assorted)\b/i;

export function isCompilationAlbum(albumName?: string): boolean {
  if (!albumName?.trim()) return false;
  return COMPILATION_MARKERS.test(albumName);
}

export function isSoundtrackAlbum(albumName?: string): boolean {
  if (!albumName?.trim()) return false;
  return SOUNDTRACK_MARKERS.test(albumName);
}

/** Discogs VA / soundtrack rows — artist string is not a real performer. */
export function isVariousArtist(artist: string): boolean {
  const a = artist.trim().toLowerCase();
  if (!a) return false;
  return VARIOUS_ARTIST_MARKERS.test(a);
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