/** Normalize vinyl/Discogs track titles for search APIs. */
export function normalizeTrackTitle(title: string): string {
  return title
    .trim()
    .replace(/^[A-Za-z]{1,2}\d+[.:\s-]+/i, '')
    .replace(/^\d+[.:\s-]+/, '')
    .replace(/^\d+\.?\s*/, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PAREN_NOISE =
  /\([^)]*\b(remaster|remastered|deluxe|explicit|mono|stereo|digital|anniversary|expanded|bonus|single|album|version|edit|mix|hd|hq|clean|dirty|lp|cd|dvd|vinyl|reissue|restored)\b[^)]*\)/gi;

const BRACKET_NOISE = /\[[^\]]*\b(remaster|deluxe|explicit|live)\b[^\]]*\]/gi;

/** Strip common suffix noise while keeping the core song title. */
export function cleanTitleForSearch(title: string): string {
  return normalizeTrackTitle(
    title
      .replace(PAREN_NOISE, ' ')
      .replace(BRACKET_NOISE, ' ')
      .replace(/\s+-\s+(remaster|remastered|deluxe|explicit).*$/i, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

/** Multiple title strings to try on Spotify/YouTube (collection title first). */
export function titleSearchVariants(trackTitle: string): string[] {
  const base = trackTitle.trim();
  const variants = new Set<string>();
  const add = (s?: string) => {
    const t = s?.trim();
    if (t && t.length > 1) variants.add(t);
  };

  add(base);
  add(normalizeTrackTitle(base));
  add(cleanTitleForSearch(base));

  const noFeat = cleanTitleForSearch(base.replace(/\s+feat\.?\s+.*/i, ' '));
  add(noFeat);

  const noSlash = cleanTitleForSearch(base.split('/')[0] ?? base);
  add(noSlash);

  const beforeDash = cleanTitleForSearch(base.replace(/\s+-\s+[^-]+$/i, ' '));
  add(beforeDash);

  return [...variants];
}

/** Primary + credited artist forms for search. */
export function artistSearchVariants(artist: string): string[] {
  const raw = artist.trim();
  const variants = new Set<string>();
  const add = (s?: string) => {
    const t = s?.trim();
    if (t) variants.add(t);
  };

  add(raw);
  add(raw.split(',')[0]?.trim());
  add(raw.split('&')[0]?.trim());
  add(raw.split(' feat')[0]?.trim());
  add(raw.split(' ft')[0]?.trim());

  return [...variants];
}

/** Album title variants (drop edition noise). */
export function albumSearchVariants(album: string): string[] {
  const raw = album.trim();
  const variants = new Set<string>();
  const add = (s?: string) => {
    const t = s?.trim();
    if (t) variants.add(t);
  };

  add(raw);
  add(cleanTitleForSearch(raw));
  add(
    raw
      .replace(/\s*\([^)]*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return [...variants];
}