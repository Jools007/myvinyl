import {
  isExtraVariant,
  lookupInAlbumMap,
  scoreAlbumMatch,
  scoreArtistMatch,
  scoreTrackMatch,
  storeInAlbumMap,
} from './track-match';
import { normalizeTrackTitle } from './track-title';
import { isPlausibleTrackBpm } from './bpm';

type DeezerSearchHit = {
  id: number;
  title: string;
  title_short: string;
  duration: number;
  bpm?: number;
  artist: { id: number; name: string };
  album: { id: number; title: string };
};

type DeezerAlbum = {
  id: number;
  title: string;
  artist: { name: string };
};

type DeezerTrack = {
  id: number;
  title: string;
  title_short: string;
  bpm?: number;
  track_position?: number;
};

const albumBpmCache = new Map<string, Map<string, number>>();

function albumCacheKey(artist: string, albumTitle: string): string {
  return `${artist.trim().toLowerCase()}|${albumTitle.trim().toLowerCase()}`;
}

function pickBestDeezerMatch(
  hits: DeezerSearchHit[],
  artist: string,
  title: string,
  albumTitle: string | undefined,
  genres: string[] = []
): DeezerSearchHit | undefined {
  let best: DeezerSearchHit | undefined;
  let bestScore = 0;

  for (const hit of hits) {
    const candidateTitle = hit.title_short || hit.title;
    if (isExtraVariant(title, candidateTitle)) continue;
    const score = scoreTrackMatch(
      { artist, title, album: albumTitle },
      {
        title: candidateTitle,
        artist: hit.artist?.name ?? '',
        album: hit.album?.title ?? '',
      },
      { minTitle: 0.94, minArtist: 0.88 }
    );
    if (score <= bestScore) continue;

    const rawBpm = hit.bpm;
    if (rawBpm != null && !isPlausibleTrackBpm(Math.round(rawBpm), genres)) continue;

    bestScore = score;
    best = hit;
  }

  return best;
}

async function deezerFetch<T>(path: string): Promise<T | null> {
  const res = await fetch(`https://api.deezer.com${path}`, {
    headers: { 'User-Agent': 'MyVinyl/1.0' },
  });
  if (!res.ok) return null;
  return res.json() as Promise<T>;
}

async function fetchTrackBpmRaw(trackId: number): Promise<number | null> {
  const detail = await deezerFetch<DeezerTrack>(`/track/${trackId}`);
  const raw = detail?.bpm;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.round(raw);
}

async function fetchTrackBpm(trackId: number, genres: string[]): Promise<number | null> {
  const bpm = await fetchTrackBpmRaw(trackId);
  if (bpm == null || !isPlausibleTrackBpm(bpm, genres)) return null;
  return bpm;
}

async function fetchBpmsParallel(
  rows: DeezerTrack[],
  genres: string[],
  concurrency = 6
): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (row) => ({ id: row.id, bpm: await fetchTrackBpm(row.id, genres) }))
    );
    for (const { id, bpm } of results) {
      if (bpm != null) out.set(id, bpm);
    }
  }
  return out;
}

/** Cached BPM map for all tracks on a Deezer album. */
export async function getDeezerAlbumBpmMap(
  artist: string,
  albumTitle: string,
  genres: string[] = []
): Promise<Map<string, number>> {
  const key = albumCacheKey(artist, albumTitle);
  const cached = albumBpmCache.get(key);
  if (cached) return cached;

  const map = new Map<string, number>();
  albumBpmCache.set(key, map);

  const q1 = encodeURIComponent(`album:"${albumTitle}" artist:"${artist}"`);
  const q2 = encodeURIComponent(`${artist} ${albumTitle}`);
  const [searchA, searchB] = await Promise.all([
    deezerFetch<{ data?: DeezerAlbum[] }>(`/search/album?q=${q1}&limit=6`),
    deezerFetch<{ data?: DeezerAlbum[] }>(`/search/album?q=${q2}&limit=6`),
  ]);

  const albumHits = [...(searchA?.data ?? []), ...(searchB?.data ?? [])];
  let bestAlbum: DeezerAlbum | undefined;
  let bestAlbumScore = 0;
  for (const album of albumHits) {
    const score =
      scoreArtistMatch(artist, album.artist?.name ?? '') * 0.45 +
      scoreAlbumMatch(albumTitle, album.title) * 0.55;
    if (score > bestAlbumScore && score >= 0.9 && scoreArtistMatch(artist, album.artist?.name ?? '') >= 0.9) {
      bestAlbumScore = score;
      bestAlbum = album;
    }
  }
  if (!bestAlbum?.id) return map;

  const tracklist = await deezerFetch<{ data?: DeezerTrack[] }>(
    `/album/${bestAlbum.id}/tracks?limit=100`
  );
  const rows = tracklist?.data ?? [];
  if (!rows.length) return map;

  const bpms = await fetchBpmsParallel(rows, genres);
  for (const row of rows) {
    let bpm = bpms.get(row.id);
    if (bpm == null) {
      const raw = await fetchTrackBpmRaw(row.id);
      if (raw != null) bpm = raw;
    }
    if (bpm == null) continue;
    storeInAlbumMap(map, row.title_short || row.title, row.track_position, bpm);
  }

  return map;
}

export function lookupDeezerAlbumBpm(
  albumMap: Map<string, number>,
  trackTitle: string,
  trackNumber?: number,
  opts?: { vinylPosition?: string }
): number | undefined {
  return lookupInAlbumMap(albumMap, trackTitle, trackNumber, opts);
}

async function resolveFromTrackSearch(
  artist: string,
  trackTitle: string,
  albumTitle: string | undefined,
  genres: string[]
): Promise<{ bpm: number; deezerTrackId: number; title: string } | null> {
  const queries = [
    `artist:"${artist}" track:"${trackTitle}"`,
    albumTitle ? `artist:"${artist}" track:"${trackTitle}" album:"${albumTitle}"` : null,
  ].filter((q): q is string => Boolean(q));

  for (const query of queries) {
    const search = await deezerFetch<{ data?: DeezerSearchHit[] }>(
      `/search?q=${encodeURIComponent(query)}&limit=8`
    );
    const match = pickBestDeezerMatch(search?.data ?? [], artist, trackTitle, albumTitle, genres);
    if (!match?.id) continue;

    const bpm = await fetchTrackBpm(match.id, genres);
    if (bpm == null) continue;

    return {
      bpm,
      deezerTrackId: match.id,
      title: match.title_short ?? match.title,
    };
  }

  return null;
}

/** Deezer track search — multiple album queries, returns BPM candidates. */
export async function collectDeezerTrackCandidates(
  artist: string,
  title: string,
  albums: string[],
  _genres: string[] = []
): Promise<
  { bpm: number; matchScore: number; albumName?: string; trackName: string }[]
> {
  const normalized = normalizeTrackTitle(title);
  const queries = new Set<string>([`artist:"${artist}" track:"${normalized}"`]);
  for (const album of albums) {
    if (album?.trim()) queries.add(`artist:"${artist}" track:"${normalized}" album:"${album.trim()}"`);
  }

  const out: { bpm: number; matchScore: number; albumName?: string; trackName: string }[] = [];
  const seen = new Set<number>();

  for (const query of queries) {
    const search = await deezerFetch<{ data?: DeezerSearchHit[] }>(
      `/search?q=${encodeURIComponent(query)}&limit=10`
    );
    for (const hit of search?.data ?? []) {
      if (!hit.id || seen.has(hit.id) || isExtraVariant(normalized, hit.title_short || hit.title)) {
        continue;
      }
      const match = scoreTrackMatch(
        { artist, title: normalized, album: albums[0] },
        {
          title: hit.title_short || hit.title,
          artist: hit.artist?.name ?? '',
          album: hit.album?.title ?? '',
        },
        { minTitle: 0.92, minArtist: 0.85 }
      );
      if (match <= 0) continue;

    const bpm = hit.bpm != null ? Math.round(hit.bpm) : await fetchTrackBpmRaw(hit.id);
    if (bpm == null) continue;

      seen.add(hit.id);
      out.push({
        bpm,
        matchScore: match,
        albumName: hit.album?.title,
        trackName: hit.title_short || hit.title,
      });
    }
  }

  return out;
}

/** Album map first, then Deezer track search. */
export async function resolveDeezerTrackBpm(
  artist: string,
  title: string,
  albumTitle?: string,
  opts?: { genres?: string[]; albumIndex?: number; vinylPosition?: string }
): Promise<{ bpm: number; deezerTrackId: number; title: string } | null> {
  const normalized = normalizeTrackTitle(title);
  const genres = opts?.genres ?? [];

  if (albumTitle?.trim()) {
    const albumMap = await getDeezerAlbumBpmMap(artist, albumTitle.trim(), genres);
    const fromAlbum = lookupDeezerAlbumBpm(albumMap, normalized, opts?.albumIndex, {
      vinylPosition: opts?.vinylPosition,
    });
    if (fromAlbum != null) {
      return { bpm: fromAlbum, deezerTrackId: 0, title: normalized };
    }
  }

  return resolveFromTrackSearch(artist, normalized, albumTitle?.trim(), genres);
}