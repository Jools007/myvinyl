import {
  isExtraVariant,
  lookupInAlbumMap,
  scoreAlbumMatch,
  scoreArtistMatch,
  scoreTrackMatch,
  storeInAlbumMap,
} from './track-match';
import {
  strictAlbumEquals,
  strictArtistEquals,
  strictCatalogTrackMatch,
  strictTitleEquals,
  type CatalogTrackRef,
} from './track-match';
import { normalizeTrackTitle, titleSearchVariants } from './track-title';
import { playAudioLog } from './play-audio-log';
import { isPlausibleTrackBpm } from './bpm';

let cachedToken: { token: string; expires: number } | null = null;
let rateLimitedUntil = 0;
let lastSpotifyRequestAt = 0;

const SPOTIFY_MIN_INTERVAL_MS = 400;
/** Enrich must not block the UI — never sleep/retry on 429. */
const SPOTIFY_MAX_RETRIES = 0;
/** Play previews may wait briefly on 429 so search can succeed. */
const SPOTIFY_PREVIEW_MAX_RETRIES = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const audioFeaturesCache = new Map<
  string,
  {
    bpm?: number;
    camelotKey?: string;
    energy?: number;
    danceability?: number;
  }
>();

const albumAudioCache = new Map<
  string,
  Map<string, SpotifyTrackAudio>
>();

type SpotifyTrack = {
  id: string;
  preview_url: string | null;
  name: string;
  artists?: { name: string }[];
  album?: { name: string };
  external_urls?: { spotify: string };
  duration_ms: number;
  track_number?: number;
};

type SpotifyAlbum = {
  id: string;
  name: string;
  artists?: { name: string }[];
};

export type SpotifyTrackAudio = {
  bpm?: number;
  camelotKey?: string;
  energy?: number;
  danceability?: number;
  spotifyTrackId?: string;
  spotifyTrackName?: string;
  albumName?: string;
  previewUrl?: string | null;
  spotifyUrl?: string;
};

/** Spotify pitch class + mode → Camelot (Mixed In Key) */
const CAMELOT: Record<string, string> = {
  '0-0': '5A', '0-1': '8B',
  '1-0': '12A', '1-1': '3B',
  '2-0': '7A', '2-1': '10B',
  '3-0': '2A', '3-1': '5B',
  '4-0': '9A', '4-1': '12B',
  '5-0': '4A', '5-1': '7B',
  '6-0': '11A', '6-1': '2B',
  '7-0': '6A', '7-1': '9B',
  '8-0': '1A', '8-1': '4B',
  '9-0': '8A', '9-1': '11B',
  '10-0': '3A', '10-1': '6B',
  '11-0': '10A', '11-1': '1B',
};

export function spotifyToCamelot(key: number, mode: number): string | undefined {
  if (key < 0 || key > 11) return undefined;
  return CAMELOT[`${key}-${mode}`];
}

function isRateLimited(): boolean {
  return Date.now() < rateLimitedUntil;
}

/** Used by enrich pipeline to skip doomed Spotify work after a 429. */
export function isSpotifyRateLimited(): boolean {
  return isRateLimited();
}

export function getSpotifyRateLimitRetrySec(): number {
  return Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1000));
}

function markRateLimited(retryAfterSec: number): void {
  rateLimitedUntil = Date.now() + Math.min(retryAfterSec, 8) * 1000;
}

async function getAccessToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (isRateLimited()) {
    if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
    return null;
  }
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1000,
  };
  return cachedToken.token;
}

async function spotifyFetch(url: string, token: string, retries = SPOTIFY_MAX_RETRIES): Promise<Response> {
  const gap = Date.now() - lastSpotifyRequestAt;
  if (gap < SPOTIFY_MIN_INTERVAL_MS) {
    await sleep(SPOTIFY_MIN_INTERVAL_MS - gap);
  }
  lastSpotifyRequestAt = Date.now();

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const waitSec = parseInt(res.headers.get('retry-after') || '2', 10);
    markRateLimited(waitSec);
    if (retries > 0) {
      await sleep(Math.min(waitSec, 3) * 1000 + 200);
      return spotifyFetch(url, token, retries - 1);
    }
    return res;
  }
  if (res.ok) rateLimitedUntil = 0;
  return res;
}

function albumCacheKey(artist: string, albumTitle: string): string {
  return `${artist.trim().toLowerCase()}|${albumTitle.trim().toLowerCase()}`;
}

function featuresFromPayload(
  data: {
    tempo?: number;
    key?: number;
    mode?: number;
    energy?: number;
    danceability?: number;
  },
  genres: string[]
): SpotifyTrackAudio | null {
  const tempo = data.tempo ? Math.round(data.tempo) : undefined;
  const camelotKey =
    data.key != null && data.key >= 0 && data.mode != null
      ? spotifyToCamelot(data.key, data.mode)
      : undefined;

  if (tempo == null && !camelotKey) return null;
  if (tempo != null && !isPlausibleTrackBpm(tempo, genres)) {
    if (!camelotKey) return null;
    return {
      camelotKey,
      energy: data.energy,
      danceability: data.danceability,
    };
  }

  return {
    bpm: tempo,
    camelotKey,
    energy: data.energy,
    danceability: data.danceability,
  };
}

async function fetchAudioFeaturesBatch(
  token: string,
  trackIds: string[],
  genres: string[],
  fetchRetries = SPOTIFY_MAX_RETRIES
): Promise<Map<string, SpotifyTrackAudio>> {
  const out = new Map<string, SpotifyTrackAudio>();
  const pending = trackIds.filter((id) => !audioFeaturesCache.has(id));

  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100);
    if (!chunk.length) continue;

    const res = await spotifyFetch(
      `https://api.spotify.com/v1/audio-features?ids=${chunk.join(',')}`,
      token,
      fetchRetries
    );
    if (res.status === 403 || !res.ok) continue;

    const body = (await res.json()) as {
      audio_features?: ({
        id: string;
        tempo?: number;
        key?: number;
        mode?: number;
        energy?: number;
        danceability?: number;
      } | null)[];
    };

    for (const row of body.audio_features ?? []) {
      if (!row?.id) continue;
      const parsed = featuresFromPayload(row, genres);
      if (parsed) {
        audioFeaturesCache.set(row.id, parsed);
        out.set(row.id, parsed);
      }
    }
  }

  for (const id of trackIds) {
    const cached = audioFeaturesCache.get(id);
    if (cached) out.set(id, cached);
  }

  return out;
}

/** One Spotify search + batch audio-features for every track on an album (cached). */
export async function getSpotifyAlbumTrackMap(
  clientId: string,
  clientSecret: string,
  artist: string,
  albumTitle: string,
  genres: string[] = [],
  fetchRetries = SPOTIFY_MAX_RETRIES
): Promise<Map<string, SpotifyTrackAudio>> {
  const cacheKey = albumCacheKey(artist, albumTitle);
  const cached = albumAudioCache.get(cacheKey);
  if (cached) return cached;

  const map = new Map<string, SpotifyTrackAudio>();
  albumAudioCache.set(cacheKey, map);

  const token = await getAccessToken(clientId, clientSecret);
  if (!token || isRateLimited()) return map;

  const albumQueries = [
    `album:"${albumTitle}" artist:"${artist}"`,
    `${artist} ${albumTitle}`,
  ];

  let albumId: string | undefined;
  for (const q of albumQueries) {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=6`,
      token,
      fetchRetries
    );
    if (!res.ok) continue;
    const data = (await res.json()) as { albums?: { items?: SpotifyAlbum[] } };
    let best: SpotifyAlbum | undefined;
    let bestScore = 0;
    for (const album of data.albums?.items ?? []) {
      const albumArtist = album.artists?.map((a) => a.name).join(' ') ?? '';
      const aScore = scoreArtistMatch(artist, albumArtist);
      const score = aScore * 0.4 + scoreAlbumMatch(albumTitle, album.name) * 0.6;
      if (score > bestScore && score >= 0.82 && aScore >= 0.85) {
        bestScore = score;
        best = album;
      }
    }
    if (best?.id) {
      albumId = best.id;
      break;
    }
  }

  if (!albumId) return map;

  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  while (offset < 200) {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&offset=${offset}`,
      token,
      fetchRetries
    );
    if (!res.ok) break;
    const page = (await res.json()) as { items?: SpotifyTrack[]; total?: number };
    tracks.push(...(page.items ?? []));
    offset += 50;
    if (!page.items?.length || offset >= (page.total ?? 0)) break;
  }

  const ids = tracks.map((t) => t.id).filter(Boolean);
  const featuresById = await fetchAudioFeaturesBatch(token, ids, genres, fetchRetries);

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const audio = featuresById.get(track.id);
    const seqIndex = i + 1;
    const trackNum = track.track_number ?? seqIndex;
    const payload: SpotifyTrackAudio = {
      ...(audio ?? {}),
      spotifyTrackId: track.id,
      spotifyTrackName: track.name,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls?.spotify,
    };
    const hasPreview = Boolean(track.preview_url);
    const hasFeatures = payload.bpm != null || Boolean(payload.camelotKey);
    if (!hasPreview && !hasFeatures) continue;
    storeInAlbumMap(map, track.name, trackNum, payload);
    if (trackNum !== seqIndex) {
      storeInAlbumMap(map, track.name, seqIndex, payload);
    }
  }

  return map;
}

export function lookupSpotifyAlbumTrack(
  albumMap: Map<string, SpotifyTrackAudio>,
  trackTitle: string,
  trackNumber?: number,
  opts?: { vinylPosition?: string }
): SpotifyTrackAudio | undefined {
  return lookupInAlbumMap(albumMap, normalizeTrackTitle(trackTitle), trackNumber, opts);
}

export async function searchTracks(
  clientId: string,
  clientSecret: string,
  q: string,
  limit = 5,
  fetchRetries = SPOTIFY_MAX_RETRIES
): Promise<SpotifyTrack[]> {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`,
    token,
    fetchRetries
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { tracks?: { items?: SpotifyTrack[] } };
  return data.tracks?.items ?? [];
}

export async function getAudioFeatures(
  clientId: string,
  clientSecret: string,
  trackId: string,
  genres: string[] = []
): Promise<SpotifyTrackAudio | null> {
  const cached = audioFeaturesCache.get(trackId);
  if (cached) return cached;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;

  const batch = await fetchAudioFeaturesBatch(token, [trackId], genres);
  return batch.get(trackId) ?? null;
}

function spotifyTrackArtist(t: SpotifyTrack): string {
  return t.artists?.[0]?.name ?? '';
}

export function trackToPreviewAudio(t: SpotifyTrack, albumName?: string): SpotifyTrackAudio {
  return {
    spotifyTrackId: t.id,
    spotifyTrackName: t.name,
    albumName: albumName ?? t.album?.name,
    previewUrl: t.preview_url,
    spotifyUrl: t.external_urls?.spotify,
  };
}

function catalogFromArgs(
  artist: string,
  title: string,
  album: string,
  trackNumber?: number
): CatalogTrackRef {
  return {
    artist: artist.trim(),
    title: title.trim(),
    album: album.trim(),
    trackNumber,
  };
}

function spotifyCandidateFromTrack(t: SpotifyTrack, albumName: string) {
  return {
    title: t.name,
    artist: spotifyTrackArtist(t),
    album: albumName,
    trackNumber: t.track_number,
  };
}

/** Fetch a single Spotify track by ID; optionally verify against catalog metadata. */
export async function fetchSpotifyTrackById(
  clientId: string,
  clientSecret: string,
  trackId: string,
  catalog?: CatalogTrackRef,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<SpotifyTrackAudio | null> {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;

  const res = await spotifyFetch(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
    token,
    fetchRetries
  );
  if (!res.ok) return null;

  const t = (await res.json()) as SpotifyTrack & { album?: { name: string } };
  const albumName = t.album?.name ?? catalog?.album ?? '';
  if (catalog && !strictCatalogTrackMatch(catalog, spotifyCandidateFromTrack(t, albumName))) {
    return null;
  }
  if (!t.preview_url) return null;
  return trackToPreviewAudio(t, albumName);
}

/** Spotify album ID for an exact artist + album title match only. */
async function findExactSpotifyAlbumId(
  clientId: string,
  clientSecret: string,
  catalog: CatalogTrackRef,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<string | undefined> {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return undefined;

  const q = `album:"${catalog.album}" artist:"${catalog.artist}"`;
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=20`,
    token,
    fetchRetries
  );
  if (!res.ok) return undefined;

  const data = (await res.json()) as { albums?: { items?: SpotifyAlbum[] } };
  for (const album of data.albums?.items ?? []) {
    const albumArtist = album.artists?.[0]?.name ?? '';
    if (
      strictAlbumEquals(catalog.album, album.name) &&
      strictArtistEquals(catalog.artist, albumArtist)
    ) {
      return album.id;
    }
  }
  return undefined;
}

async function fetchSpotifyAlbumTracks(
  token: string,
  albumId: string,
  fetchRetries: number
): Promise<SpotifyTrack[]> {
  const tracks: SpotifyTrack[] = [];
  let offset = 0;
  while (offset < 200) {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&offset=${offset}`,
      token,
      fetchRetries
    );
    if (!res.ok) break;
    const page = (await res.json()) as { items?: SpotifyTrack[]; total?: number };
    tracks.push(...(page.items ?? []));
    offset += 50;
    if (!page.items?.length || offset >= (page.total ?? 0)) break;
  }
  return tracks;
}

/** Exact catalog track search — only `track + artist + album` query, strict filter. */
async function findExactPreviewViaTrackSearch(
  clientId: string,
  clientSecret: string,
  catalog: CatalogTrackRef,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<SpotifyTrackAudio | null> {
  const q = `track:"${catalog.title}" artist:"${catalog.artist}" album:"${catalog.album}"`;
  const items = await searchTracks(clientId, clientSecret, q, 20, fetchRetries);

  for (const t of items) {
    if (!t.id || !t.preview_url) continue;
    if (
      !strictCatalogTrackMatch(
        catalog,
        spotifyCandidateFromTrack(t, t.album?.name ?? catalog.album)
      )
    ) {
      continue;
    }
    return trackToPreviewAudio(t);
  }
  return null;
}

/** Exact album on Spotify, then exact track title + artist on that album. */
async function findExactPreviewViaAlbum(
  clientId: string,
  clientSecret: string,
  catalog: CatalogTrackRef,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<SpotifyTrackAudio | null> {
  const albumId = await findExactSpotifyAlbumId(clientId, clientSecret, catalog, fetchRetries);
  if (!albumId) return null;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;

  const tracks = await fetchSpotifyAlbumTracks(token, albumId, fetchRetries);
  for (const t of tracks) {
    if (!t.id || !t.preview_url) continue;
    if (!strictTitleEquals(catalog.title, t.name)) continue;
    if (!strictArtistEquals(catalog.artist, spotifyTrackArtist(t))) continue;
    if (
      catalog.trackNumber != null &&
      t.track_number != null &&
      catalog.trackNumber !== t.track_number
    ) {
      continue;
    }
    return trackToPreviewAudio(t, catalog.album);
  }
  return null;
}

/** Multi-query track search; prefers a match that has a 30s preview URL. */
export async function searchMatchedSpotifyTrack(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  albumTitle?: string,
  trackNumber?: number,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<SpotifyTrack | undefined> {
  const album = albumTitle?.trim();
  const queries: string[] = [];
  if (album) queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  queries.push(`track:"${title}" artist:"${artist}"`);
  queries.push(`${artist} ${title}`);

  let bestWithPreview: SpotifyTrack | undefined;
  let bestWithPreviewScore = 0;
  let bestAny: SpotifyTrack | undefined;
  let bestAnyScore = 0;
  const seen = new Set<string>();

  for (const q of queries) {
    const items = await searchTracks(clientId, clientSecret, q, 12, fetchRetries);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      const score = scoreTrackMatch(
        { artist, title, album: albumTitle, trackNumber },
        {
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(' ') ?? '',
          trackNumber: t.track_number,
          album: t.album?.name,
        },
        { minTitle: 0.88, minArtist: 0.85 }
      );
      if (score <= 0) continue;
      if (t.preview_url && score > bestWithPreviewScore) {
        bestWithPreviewScore = score;
        bestWithPreview = t;
      }
      if (score > bestAnyScore) {
        bestAnyScore = score;
        bestAny = t;
      }
    }
    if (bestWithPreview && bestWithPreviewScore >= 0.9) break;
  }

  return bestWithPreview ?? bestAny;
}

function hasUsableSpotifyAudio(audio: SpotifyTrackAudio | null | undefined): boolean {
  if (!audio) return false;
  return Boolean(audio.previewUrl) || audio.bpm != null || Boolean(audio.camelotKey);
}

/**
 * Search Spotify for several versions of a track and return audio features for each.
 * Queries: studio album (if given), release album, then open track search.
 */
export async function collectSpotifyCandidates(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  opts?: {
    albumTitle?: string;
    studioAlbumHint?: string;
    albumIndex?: number;
    genres?: string[];
  }
): Promise<SpotifyTrackAudio[]> {
  if (isRateLimited()) return [];

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];

  const genres = opts?.genres ?? [];
  const queries: string[] = [];
  const studio = opts?.studioAlbumHint?.trim();
  const album = opts?.albumTitle?.trim();

  if (studio) queries.push(`track:"${title}" artist:"${artist}" album:"${studio}"`);
  if (album && album.toLowerCase() !== studio?.toLowerCase()) {
    queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  }
  queries.push(`track:"${title}" artist:"${artist}"`);

  const seen = new Set<string>();
  const tracks: SpotifyTrack[] = [];

  for (const q of queries) {
    const items = await searchTracks(clientId, clientSecret, q, 10);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      tracks.push(t);
    }
  }

  let ranked = tracks
    .map((t) => ({
      t,
      score: scoreTrackMatch(
        { artist, title, album: album ?? studio, trackNumber: opts?.albumIndex },
        {
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(' ') ?? '',
          trackNumber: t.track_number,
          album: t.album?.name,
        },
        { minTitle: 0.92, minArtist: 0.85 }
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  if (!ranked.length) {
    ranked = tracks.slice(0, 6).map((t) => ({ t, score: 0.5 }));
  }

  const ids = ranked.map((r) => r.t.id).filter(Boolean);
  const featuresById = await fetchAudioFeaturesBatch(token, ids, genres);

  const out: SpotifyTrackAudio[] = [];
  for (const { t, score } of ranked) {
    const features = featuresById.get(t.id);
    if (!features || (features.bpm == null && !features.camelotKey)) continue;
    out.push({
      ...features,
      spotifyTrackId: t.id,
      spotifyTrackName: t.name,
      albumName: t.album?.name,
      previewUrl: t.preview_url,
      spotifyUrl: t.external_urls?.spotify,
    });
    void score;
  }

  return out;
}

/**
 * Lightweight key lookup: 1–2 track searches + one audio-features call.
 * Used when full album maps are skipped (rate limits / timeouts).
 */
export async function fetchSpotifyTrackKey(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  opts?: {
    albumTitle?: string;
    studioAlbumHint?: string;
    genres?: string[];
  }
): Promise<{
  camelotKey?: string;
  matchScore: number;
  albumName?: string;
  trackName?: string;
} | null> {
  if (isRateLimited()) return null;

  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;

  const genres = opts?.genres ?? [];
  const studio = opts?.studioAlbumHint?.trim();
  const album = opts?.albumTitle?.trim();
  const queries: string[] = [];
  if (studio) queries.push(`track:"${title}" artist:"${artist}" album:"${studio}"`);
  if (album && album.toLowerCase() !== studio?.toLowerCase()) {
    queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  }
  queries.push(`track:"${title}" artist:"${artist}"`);

  const seen = new Set<string>();
  let best: { track: SpotifyTrack; score: number } | undefined;

  for (const q of queries) {
    const items = await searchTracks(clientId, clientSecret, q, 6);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      const score = scoreTrackMatch(
        { artist, title, album: studio ?? album },
        {
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(' ') ?? '',
          album: t.album?.name,
        },
        { minTitle: 0.92, minArtist: 0.88 }
      );
      if (score > (best?.score ?? 0)) best = { track: t, score };
    }
    if (best && best.score >= 0.94) break;
  }

  if (!best?.track.id) return null;

  const features = await getAudioFeatures(clientId, clientSecret, best.track.id, genres);
  if (!features?.camelotKey) return null;

  return {
    camelotKey: features.camelotKey,
    matchScore: best.score,
    albumName: best.track.album?.name,
    trackName: best.track.name,
  };
}

function normalizeForOverlap(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function overlapScore(want: string, got: string): number {
  const wantTokens = normalizeForOverlap(want).split(' ').filter((t) => t.length > 1);
  if (!wantTokens.length) return 0;
  const gotSet = new Set(normalizeForOverlap(got).split(' '));
  return wantTokens.filter((t) => gotSet.has(t)).length / wantTokens.length;
}

/**
 * Fast Spotify preview: many title variants, token overlap (no strict album required).
 */
export async function pickSpotifyPreviewLoose(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  albumTitle?: string,
  fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES
): Promise<SpotifyTrackAudio | null> {
  if (isRateLimited() && fetchRetries <= 0) return null;

  const queries: string[] = [];
  const addQ = (q: string) => {
    if (!queries.includes(q)) queries.push(q);
  };

  for (const a of [artist.trim(), artist.split(',')[0].trim()]) {
    for (const t of titleSearchVariants(title)) {
      if (albumTitle?.trim()) {
        addQ(`track:"${t}" artist:"${a}" album:"${albumTitle.trim()}"`);
      }
      addQ(`track:"${t}" artist:"${a}"`);
      addQ(`${a} ${t}`);
    }
  }

  let best: { track: SpotifyTrack; score: number } | undefined;
  const seen = new Set<string>();

  for (const q of queries) {
    playAudioLog('spotify-loose-query', { q });
    const items = await searchTracks(clientId, clientSecret, q, 15, fetchRetries);
    for (const track of items) {
      if (!track.id || !track.preview_url || seen.has(track.id)) continue;
      if (isExtraVariant(title, track.name)) continue;
      seen.add(track.id);
      const titleScore = overlapScore(title, track.name);
      const artistScore = overlapScore(artist, spotifyTrackArtist(track));
      const score = titleScore * 0.6 + artistScore * 0.4;
      if (titleScore < 0.45 || artistScore < 0.35) continue;
      if (score > (best?.score ?? 0)) best = { track, score };
    }
    if (best && best.score >= 0.82) break;
  }

  if (!best?.track.preview_url) return null;

  playAudioLog('spotify-loose-hit', {
    artist,
    title,
    matched: best.track.name,
    score: best.score,
    spotifyTrackId: best.track.id,
  });
  return trackToPreviewAudio(best.track);
}

/**
 * Spotify preview for playback: strict catalog match first, then looser track search.
 */
export async function resolveSpotifyPlayPreview(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  albumTitle?: string,
  opts?: {
    albumIndex?: number;
    spotifyTrackId?: string;
    fetchRetries?: number;
  }
): Promise<SpotifyTrackAudio | null> {
  const album = albumTitle?.trim();
  if (album) {
    const strict = await resolveTrackPreview(
      clientId,
      clientSecret,
      artist,
      title,
      album,
      opts
    );
    if (strict?.previewUrl) return strict;
  }

  const match = await searchMatchedSpotifyTrack(
    clientId,
    clientSecret,
    artist,
    title,
    album,
    opts?.albumIndex,
    opts?.fetchRetries ?? SPOTIFY_PREVIEW_MAX_RETRIES
  );
  if (match?.preview_url) return trackToPreviewAudio(match);
  return null;
}

/**
 * Resolve a 30s Spotify preview using exact collection artist, title, and album.
 * No fuzzy scoring, studio-album guessing, or open-text search.
 */
export async function resolveTrackPreview(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  albumTitle: string,
  opts?: {
    albumIndex?: number;
    spotifyTrackId?: string;
    fetchRetries?: number;
  }
): Promise<SpotifyTrackAudio | null> {
  const fetchRetries = opts?.fetchRetries ?? SPOTIFY_PREVIEW_MAX_RETRIES;
  if (isRateLimited() && fetchRetries <= 0) return null;

  const album = albumTitle.trim();
  if (!artist.trim() || !title.trim() || !album) return null;

  const catalog = catalogFromArgs(artist, title, album, opts?.albumIndex);

  if (opts?.spotifyTrackId?.trim()) {
    const cached = await fetchSpotifyTrackById(
      clientId,
      clientSecret,
      opts.spotifyTrackId.trim(),
      catalog,
      fetchRetries
    );
    if (cached?.previewUrl) return cached;
  }

  const fromSearch = await findExactPreviewViaTrackSearch(
    clientId,
    clientSecret,
    catalog,
    fetchRetries
  );
  if (fromSearch?.previewUrl) return fromSearch;

  return findExactPreviewViaAlbum(clientId, clientSecret, catalog, fetchRetries);
}

/** Album map first (when album known), then track search. */
export async function resolveTrackAudio(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  albumTitle?: string,
  opts?: {
    genres?: string[];
    albumIndex?: number;
    vinylPosition?: string;
    fetchRetries?: number;
  }
): Promise<SpotifyTrackAudio | null> {
  const fetchRetries = opts?.fetchRetries ?? SPOTIFY_PREVIEW_MAX_RETRIES;
  if (isRateLimited() && fetchRetries <= 0) return null;

  const genres = opts?.genres ?? [];
  const albumLookup = { vinylPosition: opts?.vinylPosition };

  if (albumTitle?.trim()) {
    const albumMap = await getSpotifyAlbumTrackMap(
      clientId,
      clientSecret,
      artist,
      albumTitle.trim(),
      genres,
      fetchRetries
    );
    const fromAlbum = lookupSpotifyAlbumTrack(
      albumMap,
      title,
      opts?.albumIndex,
      albumLookup
    );
    if (fromAlbum?.previewUrl) return fromAlbum;
    if (fromAlbum && hasUsableSpotifyAudio(fromAlbum)) return fromAlbum;
  }

  if (albumTitle?.trim()) {
    const previewHit = await resolveTrackPreview(
      clientId,
      clientSecret,
      artist,
      title,
      albumTitle.trim(),
      { albumIndex: opts?.albumIndex, fetchRetries }
    );
    if (previewHit?.previewUrl) return previewHit;
  }

  const match = await searchMatchedSpotifyTrack(
    clientId,
    clientSecret,
    artist,
    title,
    albumTitle,
    opts?.albumIndex,
    fetchRetries
  );
  if (!match?.id) return null;

  const features = await getAudioFeatures(clientId, clientSecret, match.id, genres);

  const result: SpotifyTrackAudio = {
    ...(features ?? {}),
    spotifyTrackId: match.id,
    spotifyTrackName: match.name,
    albumName: match.album?.name,
    previewUrl: match.preview_url,
    spotifyUrl: match.external_urls?.spotify,
  };

  return hasUsableSpotifyAudio(result) ? result : null;
}