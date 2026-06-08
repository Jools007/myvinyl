import { clientEnrichTrack } from './clientEnrichment';
import {
  directFetchDiscogsCollectionPage,
  directFetchDiscogsRelease,
  directSearchDiscogs,
  directSearchDiscogsByBarcode,
  getClientDiscogsToken,
  hasClientDiscogsToken,
} from './discogsDirect';
import { resolveDiscogsCoverUrl } from './discogsCover';
import type { DiscogsSearchHit } from './types';

export { resolveDiscogsCoverUrl };
export {
  ENRICHMENT_ESTIMATE_HINT,
  isLiveServerEnrichmentAvailable,
} from './clientEnrichment';

export { hasClientDiscogsToken };

export class DiscogsUnavailableError extends Error {
  constructor() {
    super(
      'Discogs is not configured. Set VITE_DISCOGS_TOKEN in your environment and rebuild the app.'
    );
    this.name = 'DiscogsUnavailableError';
  }
}

function requireClientDiscogsToken(): string {
  const token = getClientDiscogsToken();
  if (!token) throw new DiscogsUnavailableError();
  return token;
}

export interface EnrichResult {
  coverUrl?: string;
  genres: string[];
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  vibeTags: string[];
  bpmEstimated?: boolean;
  keyEstimated?: boolean;
  /** True when BPM/key came from this track title lookup (not genre guess) */
  trackSpecific?: boolean;
  spotifyPreviewUrl?: string;
  spotifyTrackId?: string;
  /** Where enrichment data came from */
  source?: 'server' | 'client';
}

export interface EnrichReleaseContext {
  genres?: string[];
  coverUrl?: string;
  releaseTitle?: string;
  tracklist?: { title: string; position?: string }[];
}

export function enrichReleaseContextFromDiscogs(
  release: DiscogsReleaseDetail
): EnrichReleaseContext {
  return {
    genres: release.genres,
    coverUrl: release.coverUrl,
    releaseTitle: release.title,
    tracklist: release.tracklist?.map((track) => ({
      title: track.title,
      position: track.position,
    })),
  };
}

export interface EnrichOptions {
  /** Skip genre-based BPM guesses (default true for DJ per-track lookup) */
  trackOnly?: boolean;
  /** Allow estimated genre Camelot when APIs return no key (default true) */
  keyFallback?: boolean;
  /** Pre-fetched release data (skips server Discogs fetch when provided) */
  release?: EnrichReleaseContext;
}

export interface DiscogsTracklistItem {
  position?: string;
  title: string;
  duration?: string;
  /** Discogs API uses `type_` for track | heading | index */
  type_?: string;
  type?: string;
}

export interface DiscogsReleaseDetail {
  id: number;
  title: string;
  artist: string;
  year?: string;
  genres: string[];
  coverUrl?: string;
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  notes?: string;
  tracklist?: DiscogsTracklistItem[];
}


/** Spotify track match from `/api/spotify/audio` (includes 30s preview URL when available). */
export interface SpotifyTrackPreview {
  bpm?: number;
  camelotKey?: string;
  spotifyTrackId?: string;
  spotifyTrackName?: string;
  albumName?: string;
  previewUrl?: string | null;
  spotifyUrl?: string;
}

export type SpotifyPreviewFetchResult =
  | { ok: true; data: SpotifyTrackPreview }
  | { ok: false; reason: 'not_found' | 'rate_limited' | 'network'; retryAfterSec?: number };

export type PlaybackSource = 'spotify' | 'youtube';

export type TrackPlayback =
  | {
      source: 'spotify';
      previewUrl: string;
      spotifyTrackId?: string;
      durationSec: number;
    }
  | {
      source: 'youtube';
      videoId: string;
      videoTitle?: string;
    };

export type TrackPlaybackFetchResult =
  | { ok: true; data: TrackPlayback }
  | { ok: false; reason: 'not_found' | 'rate_limited' | 'network'; retryAfterSec?: number };

/** Spotify first, then YouTube audio fallback. */
export async function fetchTrackPlayback(
  artist: string,
  trackTitle: string,
  albumTitle?: string,
  opts?: { albumIndex?: number; spotifyTrackId?: string }
): Promise<TrackPlaybackFetchResult> {
  const params = new URLSearchParams({
    artist: artist.trim(),
    title: trackTitle.trim(),
  });
  if (albumTitle?.trim()) params.set('album', albumTitle.trim());
  if (opts?.albumIndex != null && opts.albumIndex > 0) {
    params.set('albumIndex', String(opts.albumIndex));
  }
  if (opts?.spotifyTrackId?.trim()) {
    params.set('spotifyTrackId', opts.spotifyTrackId.trim());
  }
  try {
    const res = await fetch(`/api/play/audio?${params}`, {
      signal: AbortSignal.timeout(22_000),
    });
    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSec: body.retryAfterSec ?? 3,
      };
    }
    if (!res.ok) return { ok: false, reason: 'not_found' };
    return { ok: true, data: (await res.json()) as TrackPlayback };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

export async function fetchSpotifyPreview(
  artist: string,
  trackTitle: string,
  albumTitle: string,
  opts?: { albumIndex?: number; spotifyTrackId?: string }
): Promise<SpotifyPreviewFetchResult> {
  const album = albumTitle.trim();
  if (!album) return { ok: false, reason: 'not_found' };

  const params = new URLSearchParams({
    artist: artist.trim(),
    title: trackTitle.trim(),
    album,
  });
  if (opts?.albumIndex != null && opts.albumIndex > 0) {
    params.set('albumIndex', String(opts.albumIndex));
  }
  if (opts?.spotifyTrackId?.trim()) {
    params.set('spotifyTrackId', opts.spotifyTrackId.trim());
  }
  try {
    const res = await fetch(`/api/spotify/audio?${params}`, {
      signal: AbortSignal.timeout(14_000),
    });
    if (res.status === 503) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterSec?: number };
      return {
        ok: false,
        reason: 'rate_limited',
        retryAfterSec: body.retryAfterSec ?? 3,
      };
    }
    if (!res.ok) return { ok: false, reason: 'not_found' };
    return { ok: true, data: (await res.json()) as SpotifyTrackPreview };
  } catch {
    return { ok: false, reason: 'network' };
  }
}

type DiscogsApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; status?: number; error: string };

async function fetchDiscogsApi<T>(path: string): Promise<DiscogsApiResult<T>> {
  try {
    const res = await fetch(path, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return {
        ok: false,
        status: res.status,
        error: body.error ?? `Discogs request failed (${res.status})`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch {
    return { ok: false, error: 'Could not reach Discogs — check your connection' };
  }
}

function shouldUseClientDiscogsFallback(status?: number): boolean {
  // Only fall back when the server route is missing or explicitly unavailable.
  return status === 404 || status === 503;
}

async function fetchDiscogsCollectionPageViaApi(
  username: string,
  page = 1,
  perPage = 100
): Promise<DiscogsCollectionPageResult> {
  const params = new URLSearchParams({
    username,
    page: String(page),
    per_page: String(perPage),
  });
  const result = await fetchDiscogsApi<DiscogsCollectionPageResult>(
    `/api/discogs/collection?${params}`
  );
  if (result.ok) return result.data;
  if (shouldUseClientDiscogsFallback(result.status) && hasClientDiscogsToken()) {
    return directFetchDiscogsCollectionPage(
      requireClientDiscogsToken(),
      username,
      page,
      perPage
    );
  }
  throw new Error(result.error);
}

export async function searchDiscogs(query: string, perPage = 16): Promise<DiscogsSearchHit[]> {
  const result = await fetchDiscogsApi<{ results?: DiscogsSearchHit[] }>(
    `/api/discogs/search?${new URLSearchParams({ q: query, per_page: String(perPage) })}`
  );
  if (result.ok) return result.data.results ?? [];
  if (shouldUseClientDiscogsFallback(result.status) && hasClientDiscogsToken()) {
    return directSearchDiscogs(requireClientDiscogsToken(), query, perPage);
  }
  throw new Error(result.error);
}

export async function searchDiscogsByBarcode(
  barcode: string,
  perPage = 5
): Promise<DiscogsSearchHit[]> {
  const result = await fetchDiscogsApi<{ results?: DiscogsSearchHit[] }>(
    `/api/discogs/search?${new URLSearchParams({ barcode, per_page: String(perPage) })}`
  );
  if (result.ok) return result.data.results ?? [];
  if (shouldUseClientDiscogsFallback(result.status) && hasClientDiscogsToken()) {
    return directSearchDiscogsByBarcode(requireClientDiscogsToken(), barcode, perPage);
  }
  throw new Error(result.error);
}

export function cleanAlbumText(raw?: string, maxLen = 520): string {
  if (!raw?.trim()) return '';
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1).trim()}…`;
}

export async function fetchAlbumDescription(
  artist: string,
  album: string,
  discogsNotes?: string
): Promise<string> {
  const params = new URLSearchParams({ artist, album });
  if (discogsNotes?.trim()) params.set('discogsNotes', discogsNotes.trim());
  try {
    const res = await fetch(`/api/album-info?${params}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return cleanAlbumText(discogsNotes);
    const data = (await res.json()) as { description?: string | null };
    return cleanAlbumText(data.description ?? discogsNotes);
  } catch {
    return cleanAlbumText(discogsNotes);
  }
}

export type DiscogsCollectionRelease = {
  discogsId: number;
  artist: string;
  title: string;
  year?: string;
  format: string;
  isCdOnly: boolean;
  coverUrl?: string;
  genres: string[];
};

export type DiscogsCollectionPageResult = {
  releases: DiscogsCollectionRelease[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
};

export async function fetchDiscogsCollectionPage(
  username: string,
  page = 1,
  perPage = 100
): Promise<DiscogsCollectionPageResult> {
  return fetchDiscogsCollectionPageViaApi(username, page, perPage);
}

export async function fetchDiscogsRelease(id: number): Promise<DiscogsReleaseDetail> {
  const result = await fetchDiscogsApi<DiscogsReleaseDetail>(`/api/discogs/release/${id}`);
  if (result.ok) return result.data;
  if (shouldUseClientDiscogsFallback(result.status) && hasClientDiscogsToken()) {
    return directFetchDiscogsRelease(requireClientDiscogsToken(), id);
  }
  throw new Error(result.error);
}

/** Use cached release detail when it already has a tracklist; otherwise fetch from Discogs. */
export async function resolveDiscogsReleaseDetail(
  discogsId: number,
  cached?: DiscogsReleaseDetail | null
): Promise<DiscogsReleaseDetail> {
  if (cached?.tracklist && cached.tracklist.length > 0) return cached;
  return fetchDiscogsRelease(discogsId);
}

type DiscogsEnrichHints = {
  genres: string[];
  bpm?: number;
  camelotKey?: string;
  coverUrl?: string;
};

const discogsEnrichCache = new Map<number, DiscogsEnrichHints>();

async function getDiscogsEnrichHints(discogsId?: number): Promise<DiscogsEnrichHints | undefined> {
  if (!discogsId || !hasClientDiscogsToken()) return undefined;

  const cached = discogsEnrichCache.get(discogsId);
  if (cached) return cached;

  try {
    const release = await directFetchDiscogsRelease(getClientDiscogsToken()!, discogsId);
    const hints: DiscogsEnrichHints = {
      genres: release.genres,
      bpm: release.bpm,
      camelotKey: release.camelotKey,
      coverUrl: release.coverUrl,
    };
    discogsEnrichCache.set(discogsId, hints);
    return hints;
  } catch {
    return undefined;
  }
}

function normalizeServerEnrich(data: EnrichResult): EnrichResult {
  return {
    source: 'server',
    genres: data.genres ?? [],
    vibeTags: data.vibeTags ?? [],
    bpm: data.bpm,
    camelotKey: data.camelotKey,
    musicalKey: data.musicalKey,
    bpmEstimated: data.bpmEstimated,
    keyEstimated: data.keyEstimated,
    trackSpecific: data.trackSpecific,
    spotifyPreviewUrl: data.spotifyPreviewUrl,
    spotifyTrackId: data.spotifyTrackId,
    coverUrl: resolveDiscogsCoverUrl(data.coverUrl),
  };
}

async function fetchClientEnrichment(
  artist: string,
  trackTitle: string,
  discogsId?: number,
  genres?: string[],
  options?: EnrichOptions & { trackPosition?: string; usedKeys?: string[] }
): Promise<EnrichResult> {
  const hints = await getDiscogsEnrichHints(discogsId);
  const client = clientEnrichTrack({
    artist,
    trackTitle,
    genres,
    trackPosition: options?.trackPosition,
    usedKeys: options?.usedKeys,
    keyFallback: options?.keyFallback !== false,
    discogsBpm: hints?.bpm,
    discogsCamelotKey: hints?.camelotKey,
    discogsGenres: hints?.genres,
    discogsCoverUrl: hints?.coverUrl,
  });
  return client;
}

function buildEnrichRequestBody(
  artist: string,
  trackTitle: string,
  discogsId?: number,
  albumTitle?: string,
  genres?: string[],
  options?: EnrichOptions & { trackPosition?: string; usedKeys?: string[] }
): Record<string, unknown> {
  const body: Record<string, unknown> = { artist, title: trackTitle };
  if (discogsId) body.discogsId = discogsId;
  if (albumTitle?.trim()) body.album = albumTitle.trim();
  if (options?.trackPosition?.trim()) body.position = options.trackPosition.trim();
  if (options?.usedKeys?.length) body.usedKeys = options.usedKeys;
  if (genres?.length) body.genres = genres;
  if (options?.trackOnly === false) body.trackOnly = false;
  if (options?.keyFallback === false) body.keyFallback = false;
  if (options?.release) body.release = options.release;
  return body;
}

async function fetchEnrichment(
  artist: string,
  trackTitle: string,
  discogsId?: number,
  albumTitle?: string,
  genres?: string[],
  options?: EnrichOptions & { trackPosition?: string; usedKeys?: string[] }
): Promise<EnrichResult> {
  try {
    const res = await fetch('/api/enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        buildEnrichRequestBody(artist, trackTitle, discogsId, albumTitle, genres, options)
      ),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) {
      return normalizeServerEnrich((await res.json()) as EnrichResult);
    }
  } catch {
    /* fall through to client enrichment */
  }

  return fetchClientEnrichment(artist, trackTitle, discogsId, genres, options);
}

/** Enrich using album/release title (legacy). */
export async function enrichRecord(
  artist: string,
  title: string,
  discogsId?: number,
  albumTitle?: string,
  genres?: string[],
  options?: EnrichOptions
): Promise<EnrichResult> {
  return fetchEnrichment(artist, title, discogsId, albumTitle, genres, options);
}

/** Enrich a single track by its own title (BPM, key, vibes). */
export async function enrichTrack(
  artist: string,
  trackTitle: string,
  discogsId?: number,
  albumTitle?: string,
  genres?: string[],
  options?: EnrichOptions & { trackPosition?: string; usedKeys?: string[] }
): Promise<EnrichResult> {
  return fetchEnrichment(artist, trackTitle, discogsId, albumTitle, genres, options);
}

export async function fetchLastFmVibeTracks(tag: string, limit = 12) {
  const res = await fetch(`/api/lastfm/vibe?tag=${encodeURIComponent(tag)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = (await res.json()) as {
    tracks: { name: string; artist: string; url: string; image?: string }[];
  };
  return data.tracks ?? [];
}