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
}

export interface EnrichOptions {
  /** Skip genre-based BPM guesses (default true for DJ per-track lookup) */
  trackOnly?: boolean;
  /** Allow estimated genre Camelot when APIs return no key (default true) */
  keyFallback?: boolean;
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

export async function searchDiscogs(query: string, perPage = 16): Promise<DiscogsSearchHit[]> {
  return directSearchDiscogs(requireClientDiscogsToken(), query, perPage);
}

export async function searchDiscogsByBarcode(
  barcode: string,
  perPage = 5
): Promise<DiscogsSearchHit[]> {
  return directSearchDiscogsByBarcode(requireClientDiscogsToken(), barcode, perPage);
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
  return directFetchDiscogsCollectionPage(
    requireClientDiscogsToken(),
    username,
    page,
    perPage
  );
}

export async function fetchDiscogsRelease(id: number): Promise<DiscogsReleaseDetail> {
  return directFetchDiscogsRelease(requireClientDiscogsToken(), id);
}

/** Use cached release detail when it already has a tracklist; otherwise fetch from Discogs. */
export async function resolveDiscogsReleaseDetail(
  discogsId: number,
  cached?: DiscogsReleaseDetail | null
): Promise<DiscogsReleaseDetail> {
  if (cached?.tracklist && cached.tracklist.length > 0) return cached;
  return fetchDiscogsRelease(discogsId);
}

async function fetchEnrichment(
  artist: string,
  trackTitle: string,
  discogsId?: number,
  albumTitle?: string,
  genres?: string[],
  options?: EnrichOptions & { trackPosition?: string; usedKeys?: string[] }
): Promise<EnrichResult> {
  const params = new URLSearchParams({ artist, title: trackTitle });
  if (discogsId) params.set('discogsId', String(discogsId));
  if (albumTitle?.trim()) params.set('album', albumTitle.trim());
  if (options?.trackPosition?.trim()) params.set('position', options.trackPosition.trim());
  if (options?.usedKeys?.length) params.set('usedKeys', options.usedKeys.join(','));
  if (genres?.length) params.set('genres', genres.join(','));
  if (options?.trackOnly === false) params.set('genreFallback', '1');
  if (options?.keyFallback === true) params.set('keyFallback', '1');
  const res = await fetch(`/api/enrich?${params}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Enrichment failed');
  }
  const data = (await res.json()) as EnrichResult;
  return {
    genres: data.genres ?? [],
    vibeTags: data.vibeTags ?? [],
    bpm: data.bpm,
    camelotKey: data.camelotKey,
    musicalKey: data.musicalKey,
    bpmEstimated: data.bpmEstimated,
    keyEstimated: data.keyEstimated,
    trackSpecific: data.trackSpecific,
    coverUrl: resolveDiscogsCoverUrl(data.coverUrl),
  };
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