import type { VinylRecord } from './types';

/** Discogs VA markers — artist field is not a real performer. */
const VARIOUS_ARTIST_MARKERS =
  /^(various|various artists|v\/a|va|multi[- ]artist|diverse|assorted)\b/i;

const SOUNDTRACK_MARKERS =
  /\b(soundtrack|motion picture|original cast|ost|score|music from|from the film|from the movie)\b/i;

/** Chart / insights display labels (not stored on records). */
export const COMPILATIONS_CHART_LABEL = 'Compilations';
export const SOUNDTRACKS_CHART_LABEL = 'Soundtracks';

export type CompilationScope = 'all' | 'compilations' | 'soundtracks';

export function isVariousArtist(artist: string): boolean {
  const a = artist.trim().toLowerCase();
  if (!a) return false;
  return VARIOUS_ARTIST_MARKERS.test(a);
}

export function isSoundtrackAlbum(albumName?: string): boolean {
  if (!albumName?.trim()) return false;
  return SOUNDTRACK_MARKERS.test(albumName);
}

export function isCompilationRelease(record: VinylRecord): boolean {
  return isVariousArtist(record.artist);
}

export function isSoundtrackRelease(record: VinylRecord): boolean {
  return isCompilationRelease(record) && isSoundtrackAlbum(record.title);
}

/** Insights-only label — raw `record.artist` stays unchanged. */
export function insightsArtistLabel(artist: string): string {
  return isVariousArtist(artist) ? COMPILATIONS_CHART_LABEL : artist.trim();
}

export function recordMatchesCompilationScope(
  record: VinylRecord,
  scope: CompilationScope
): boolean {
  if (!isCompilationRelease(record)) return false;
  if (scope === 'all') return true;
  if (scope === 'soundtracks') return isSoundtrackRelease(record);
  return !isSoundtrackRelease(record);
}