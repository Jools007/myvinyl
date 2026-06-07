import { normalizeTrackTitle } from './track-title';

const VARIANT_MARKERS =
  /\b(remix|rework|re-?edit|mix|version|live|acoustic|instrumental|karaoke|demo|radio\s*edit|extended|club|dub|mashup|bootleg|cover|tribute|ringtone)\b/i;

const VARIANT_MARKERS_STRICT =
  /\b(remix|rework|re-?edit|extended\s+mix|club\s+mix|live|acoustic|instrumental|karaoke|demo|radio\s*edit|dub\s+mix|mashup|bootleg)\b/i;

export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\[.*?\]/g, ' ')
    .replace(/feat\.?.*$/i, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Numeric Discogs position only (e.g. "4"). Vinyl A1/B2 use {@link parseVinylPosition}. */
export function parseTrackNumber(position?: string): number | undefined {
  if (!position?.trim()) return undefined;
  const p = position.trim();
  if (/^\d+$/.test(p)) {
    const num = parseInt(p, 10);
    return num > 0 ? num : undefined;
  }
  return undefined;
}

export type VinylPosition = { side: string; number: number };

/** Parse vinyl catalog position (e.g. A1, B2, C1). */
export function parseVinylPosition(position?: string): VinylPosition | undefined {
  if (!position?.trim()) return undefined;
  const p = position.trim();
  const m = /^([A-Za-z]+)(\d+)$/i.exec(p);
  if (!m) return undefined;
  const number = parseInt(m[2], 10);
  return number > 0 ? { side: m[1].toUpperCase(), number } : undefined;
}

export function normalizeVinylPositionKey(position?: string): string | undefined {
  const vinyl = parseVinylPosition(position);
  if (vinyl) return `${vinyl.side.toLowerCase()}${vinyl.number}`;
  const num = parseTrackNumber(position);
  return num != null ? String(num) : undefined;
}

export type DiscogsTrackRow = { title: string; position?: string };

function isPlayableDiscogsRow(row: DiscogsTrackRow): boolean {
  return Boolean(row.title?.trim());
}

function discogsPositionMatches(rowPosition: string | undefined, vinylPosition: string): boolean {
  const posKey = normalizeVinylPositionKey(vinylPosition);
  const numericPos = parseTrackNumber(vinylPosition);
  const rowPosKey = normalizeVinylPositionKey(rowPosition);
  const rowNum = parseTrackNumber(rowPosition);
  return (
    (posKey != null && rowPosKey === posKey) ||
    (numericPos != null && rowNum === numericPos) ||
    vinylPosition.trim().toLowerCase() === (rowPosition ?? '').trim().toLowerCase()
  );
}

export function strictTitleEquals(wantedTitle: string, candidateTitle: string): boolean {
  const want = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const got = normalizeForMatch(normalizeTrackTitle(candidateTitle));
  return Boolean(want && got && want === got && !isExtraVariant(wantedTitle, candidateTitle));
}

/** Primary credited artist must match exactly (no fuzzy token overlap). */
export function strictArtistEquals(wantedArtist: string, candidateArtist: string): boolean {
  const want = normalizeForMatch(wantedArtist.split(',')[0]);
  const got = normalizeForMatch(candidateArtist.split(',')[0]);
  return Boolean(want && got && want === got);
}

/** Album title must match exactly after normalization. */
export function strictAlbumEquals(wantedAlbum: string, candidateAlbum: string): boolean {
  const want = normalizeForMatch(wantedAlbum);
  const got = normalizeForMatch(candidateAlbum);
  return Boolean(want && got && want === got);
}

export type CatalogTrackRef = {
  artist: string;
  title: string;
  album: string;
  trackNumber?: number;
};

/** Exact match of collection artist + track + album (optional track #). */
export function strictCatalogTrackMatch(
  catalog: CatalogTrackRef,
  spotify: { title: string; artist: string; album: string; trackNumber?: number }
): boolean {
  if (!strictTitleEquals(catalog.title, spotify.title)) return false;
  if (!strictArtistEquals(catalog.artist, spotify.artist)) return false;
  if (!strictAlbumEquals(catalog.album, spotify.album)) return false;
  if (
    catalog.trackNumber != null &&
    spotify.trackNumber != null &&
    catalog.trackNumber !== spotify.trackNumber
  ) {
    return false;
  }
  return true;
}

/**
 * Discogs hint for album lookup: match by position first (uses Discogs title),
 * else a single exact title match on the tracklist.
 */
export function resolveDiscogsHint(
  tracklist: DiscogsTrackRow[] | undefined,
  title: string,
  vinylPosition?: string
): { row: DiscogsTrackRow; albumIndex: number; canonicalTitle: string; position?: string } | undefined {
  if (!tracklist?.length) return undefined;

  const playable = tracklist.filter(isPlayableDiscogsRow);

  if (vinylPosition?.trim()) {
    for (let i = 0; i < playable.length; i++) {
      const row = playable[i];
      if (!discogsPositionMatches(row.position, vinylPosition)) continue;
      return {
        row,
        albumIndex: i + 1,
        canonicalTitle: normalizeTrackTitle(row.title),
        position: row.position ?? vinylPosition,
      };
    }
  }

  const titleHits: { row: DiscogsTrackRow; albumIndex: number }[] = [];
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    if (scoreTitleMatch(title, row.title) >= 0.98) {
      titleHits.push({ row, albumIndex: i + 1 });
    }
  }
  if (titleHits.length !== 1) return undefined;

  const hit = titleHits[0];
  return {
    row: hit.row,
    albumIndex: hit.albumIndex,
    canonicalTitle: normalizeTrackTitle(hit.row.title),
    position: hit.row.position,
  };
}

/**
 * Strict Discogs match: position AND title must both match (exact, no fuzzy).
 */
export function strictDiscogsMatch(
  tracklist: DiscogsTrackRow[] | undefined,
  title: string,
  vinylPosition: string
): { row: DiscogsTrackRow; albumIndex: number } | undefined {
  if (!tracklist?.length || !vinylPosition.trim()) return undefined;

  const playable = tracklist.filter(isPlayableDiscogsRow);
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    if (!discogsPositionMatches(row.position, vinylPosition)) continue;
    if (!strictTitleEquals(title, row.title)) continue;
    return { row, albumIndex: i + 1 };
  }
  return undefined;
}

/** @deprecated Prefer strictDiscogsMatch when position is known */
export function matchDiscogsTrackRow(
  tracklist: DiscogsTrackRow[] | undefined,
  title: string,
  vinylPosition?: string
): { row: DiscogsTrackRow; albumIndex: number } | undefined {
  if (!tracklist?.length) return undefined;
  if (vinylPosition?.trim()) {
    return strictDiscogsMatch(tracklist, title, vinylPosition);
  }

  const playable = tracklist.filter(isPlayableDiscogsRow);
  const matches: { row: DiscogsTrackRow; albumIndex: number }[] = [];
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    if (strictTitleEquals(title, row.title)) matches.push({ row, albumIndex: i + 1 });
  }
  return matches.length === 1 ? matches[0] : undefined;
}

export function resolveAlbumTrackIndex(
  tracklist: DiscogsTrackRow[] | undefined,
  title: string,
  vinylPosition?: string
): number | undefined {
  return matchDiscogsTrackRow(tracklist, title, vinylPosition)?.albumIndex;
}

export function buildAlbumLookupKeys(
  title: string,
  trackNumber?: number,
  vinylPosition?: string
): { exact: string; positioned?: string; vinyl?: string } {
  const exact = normalizeForMatch(normalizeTrackTitle(title));
  const positioned =
    trackNumber != null && trackNumber > 0 ? `${trackNumber}|${exact}` : undefined;
  const vinylKey = normalizeVinylPositionKey(vinylPosition);
  const vinyl = vinylKey ? `${vinylKey}|${exact}` : undefined;
  return { exact, positioned, vinyl };
}

export function isExtraVariant(wantedTitle: string, candidateTitle: string): boolean {
  const wantNorm = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const gotNorm = normalizeForMatch(candidateTitle);
  if (!wantNorm || !gotNorm) return true;

  const wantHasVariant = VARIANT_MARKERS.test(wantedTitle);
  const gotHasVariant = VARIANT_MARKERS_STRICT.test(candidateTitle);

  if (gotHasVariant && !wantHasVariant) return true;

  // Candidate much longer — often a mashup title containing wanted phrase
  if (gotNorm.length > wantNorm.length * 1.45 && gotNorm.includes(wantNorm)) return true;

  return false;
}

export function scoreTitleMatch(wantedTitle: string, candidateTitle: string): number {
  const want = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const got = normalizeForMatch(candidateTitle);
  if (!want || !got) return 0;
  if (isExtraVariant(wantedTitle, candidateTitle)) return 0;
  if (got === want) return 1;
  if (got.startsWith(want) && got.length <= want.length + 4) return 0.95;
  if (want.startsWith(got) && want.length <= got.length + 4) return 0.93;
  return 0;
}

export function scoreArtistMatch(wantedArtist: string, candidateArtist: string): number {
  const want = normalizeForMatch(wantedArtist);
  const got = normalizeForMatch(candidateArtist);
  if (!want || !got) return 0;
  if (want === got) return 1;
  const wantPrimary = want.split(',')[0].trim();
  const gotPrimary = got.split(',')[0].trim();
  if (wantPrimary === gotPrimary) return 0.98;
  if (gotPrimary.includes(wantPrimary) || wantPrimary.includes(gotPrimary)) return 0.9;
  const wantTokens = wantPrimary.split(' ').filter((t) => t.length > 1);
  const gotTokens = new Set(gotPrimary.split(' '));
  const overlap = wantTokens.filter((t) => gotTokens.has(t)).length;
  if (overlap >= Math.min(wantTokens.length, 2)) {
    return (overlap / wantTokens.length) * 0.85;
  }
  return 0;
}

export function scoreAlbumMatch(wantedAlbum: string | undefined, candidateAlbum: string): number {
  if (!wantedAlbum?.trim()) return 0.5;
  const want = normalizeForMatch(wantedAlbum);
  const got = normalizeForMatch(candidateAlbum);
  if (!got) return 0;
  if (got === want) return 1;
  if (got.includes(want) || want.includes(got)) return 0.92;
  return 0;
}

export type TrackMatchCandidate = {
  title: string;
  artist?: string;
  album?: string;
  trackNumber?: number;
};

export function scoreTrackMatch(
  wanted: {
    artist: string;
    title: string;
    album?: string;
    trackNumber?: number;
  },
  candidate: TrackMatchCandidate,
  opts?: { minTitle?: number; minArtist?: number }
): number {
  const minTitle = opts?.minTitle ?? 0.92;
  const minArtist = opts?.minArtist ?? 0.88;

  const a = scoreArtistMatch(wanted.artist, candidate.artist ?? '');
  const t = scoreTitleMatch(wanted.title, candidate.title);
  if (t < minTitle || a < minArtist) return 0;

  const al = scoreAlbumMatch(wanted.album, candidate.album ?? '');
  let score = t * 0.52 + a * 0.38 + al * 0.1;

  if (
    wanted.trackNumber != null &&
    candidate.trackNumber != null &&
    wanted.trackNumber === candidate.trackNumber
  ) {
    score += 0.08;
  }

  return Math.min(score, 1);
}

/** Album map lookup: vinyl+title → track#+title → exact title. */
export function lookupInAlbumMap<T>(
  map: Map<string, T>,
  title: string,
  trackNumber?: number,
  opts?: { vinylPosition?: string }
): T | undefined {
  const { exact, positioned, vinyl } = buildAlbumLookupKeys(
    title,
    trackNumber,
    opts?.vinylPosition
  );
  if (vinyl && map.has(vinyl)) return map.get(vinyl);
  if (positioned && map.has(positioned)) return map.get(positioned);
  if (map.has(exact)) return map.get(exact);
  return undefined;
}

export function storeInAlbumMap<T>(
  map: Map<string, T>,
  title: string,
  trackNumber: number | undefined,
  value: T,
  vinylPosition?: string
): void {
  const { exact, positioned, vinyl } = buildAlbumLookupKeys(title, trackNumber, vinylPosition);
  if (vinyl) map.set(vinyl, value);
  if (positioned) map.set(positioned, value);
  map.set(exact, value);
}