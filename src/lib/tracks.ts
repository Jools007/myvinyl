import { enrichTrack, type DiscogsReleaseDetail, type DiscogsTracklistItem, type EnrichResult } from './api';
import { resolveDiscogsCoverUrl } from './discogsCover';
import { resolveTrackCamelot } from './camelot';
import { inferAddSource } from './collectionClear';
import { generateId } from './storage';
import { getPrimaryTrack } from './types';
import type { Track, VinylRecord } from './types';

export { getPrimaryTrack } from './types';

/** Legacy flat shape stored before track-centric migration */
type LegacyVinylRecord = VinylRecord & {
  bpm?: number;
  camelotKey?: string;
  vibeTags?: string[];
};

export function recordNeedsLegacyShapeMigration(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const r = raw as Record<string, unknown>;
  if ('bpm' in r || 'camelotKey' in r || 'vibeTags' in r) return true;
  if (!Array.isArray(r.tracks) || r.tracks.length === 0) return true;
  return false;
}

/** Gap between tracks — album maps are cached server-side after track 1. */
const ENRICH_DELAY_MS = 120;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Strip noise from Discogs titles so Spotify/Last.fm/Deezer can match. */
export function normalizeTrackTitleForSearch(title: string): string {
  return title
    .replace(/^[A-Za-z]{1,2}\d+[.:\s-]+/i, '')
    .replace(/^\d+[.:\s-]+/, '')
    .replace(/^\d+\.?\s*/, '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function clearTrackMusicalData(track: Track): Track {
  return {
    ...track,
    bpm: undefined,
    camelotKey: undefined,
    musicalKey: undefined,
    bpmEstimated: undefined,
    keyEstimated: undefined,
  };
}

function mergeEnrichOntoTrackRow(
  track: Track,
  data: EnrichResult,
  opts?: { replace?: boolean; keyOnly?: boolean }
): Track {
  const mergedVibes = [...new Set([...(track.vibeTags ?? []), ...(data.vibeTags ?? [])])].slice(0, 6);
  const replace = opts?.replace === true;
  const keyOnly = opts?.keyOnly === true;

  // Force re-enrich: always apply fresh API fields (never keep stale ~124 / 11A)
  if (replace) {
    const next: Track = { ...track, vibeTags: mergedVibes };
    if (!keyOnly && data.bpm != null) {
      next.bpm = data.bpm;
      next.bpmEstimated = data.trackSpecific ? false : !!data.bpmEstimated;
    }
    if (data.camelotKey) {
      next.camelotKey = data.camelotKey;
      next.keyEstimated = data.trackSpecific ? false : !!data.keyEstimated;
    }
    if (data.musicalKey != null) next.musicalKey = data.musicalKey;
    if (data.spotifyPreviewUrl) next.spotifyPreviewUrl = data.spotifyPreviewUrl;
    if (data.spotifyTrackId) next.spotifyTrackId = data.spotifyTrackId;
    return next;
  }

  const preferBpm =
    !keyOnly &&
    data.bpm != null &&
    (track.bpm == null || data.trackSpecific || !data.bpmEstimated || !track.bpmEstimated);

  const preferKey =
    data.camelotKey &&
    (!track.camelotKey || data.trackSpecific || !data.keyEstimated || !track.keyEstimated);

  return {
    ...track,
    bpm: preferBpm ? data.bpm : track.bpm,
    camelotKey: preferKey ? data.camelotKey : track.camelotKey,
    musicalKey: data.musicalKey ?? track.musicalKey,
    bpmEstimated:
      data.bpm != null && preferBpm
        ? data.trackSpecific
          ? false
          : !!data.bpmEstimated
        : track.bpmEstimated,
    keyEstimated:
      data.camelotKey && preferKey
        ? data.trackSpecific
          ? false
          : !!data.keyEstimated
        : track.keyEstimated,
    vibeTags: mergedVibes,
    spotifyPreviewUrl: data.spotifyPreviewUrl ?? track.spotifyPreviewUrl,
    spotifyTrackId: data.spotifyTrackId ?? track.spotifyTrackId,
  };
}

export function trackRowKey(track: Pick<Track, 'title' | 'position'>): string {
  return `${(track.position ?? '').trim().toLowerCase()}|${track.title.trim().toLowerCase()}`;
}

function resolveEnrichedForTrack(
  existing: Track,
  byId: Map<string, Track>,
  byKey: Map<string, Track>
): Track | undefined {
  return byId.get(existing.id) ?? byKey.get(trackRowKey(existing));
}

function tracksMatchForEnrich(existing: Track, enriched: Track, enrichedKey: string): boolean {
  if (existing.id === enriched.id) return true;
  if (trackRowKey(existing) === enrichedKey) return true;
  if (
    existing.title.trim().toLowerCase() === enriched.title.trim().toLowerCase() &&
    (existing.position ?? '').trim().toLowerCase() === (enriched.position ?? '').trim().toLowerCase()
  ) {
    return true;
  }
  return false;
}

/** Write one enriched track onto a release (matches by id, then position+title). */
export function replaceTrackOnRelease(record: VinylRecord, enrichedTrack: Track): VinylRecord {
  const key = trackRowKey(enrichedTrack);
  let matched = false;
  const tracks = record.tracks.map((existing) => {
    if (!tracksMatchForEnrich(existing, enrichedTrack, key)) {
      return { ...existing, vibeTags: existing.vibeTags ?? [] };
    }
    matched = true;
    return {
      ...existing,
      id: existing.id,
      title: existing.title,
      position: existing.position,
      duration: existing.duration ?? enrichedTrack.duration,
      artist: existing.artist ?? enrichedTrack.artist,
      bpm: enrichedTrack.bpm,
      camelotKey: enrichedTrack.camelotKey,
      musicalKey: enrichedTrack.musicalKey,
      bpmEstimated: enrichedTrack.bpmEstimated,
      keyEstimated: enrichedTrack.keyEstimated,
      vibeTags: enrichedTrack.vibeTags ?? existing.vibeTags ?? [],
      isPrimary: existing.isPrimary,
    };
  });

  if (!matched) {
    return {
      ...record,
      tracks: [...tracks, { ...enrichedTrack, vibeTags: enrichedTrack.vibeTags ?? [] }],
    };
  }

  return { ...record, tracks };
}

/** Apply enriched BPM/key onto the current release tracks (id, then position+title). */
export function mergeEnrichedTracksIntoRelease(
  record: VinylRecord,
  enrichedTracks: Track[]
): VinylRecord {
  const byId = new Map(enrichedTracks.map((t) => [t.id, t]));
  const byKey = new Map(enrichedTracks.map((t) => [trackRowKey(t), t]));

  return {
    ...record,
    tracks: record.tracks.map((existing) => {
      const enriched = resolveEnrichedForTrack(existing, byId, byKey);
      if (!enriched) {
        return { ...existing, vibeTags: existing.vibeTags ?? [] };
      }
      return {
        ...existing,
        id: existing.id,
        title: existing.title,
        position: existing.position,
        duration: existing.duration ?? enriched.duration,
        artist: existing.artist ?? enriched.artist,
        bpm: enriched.bpm ?? existing.bpm,
        camelotKey: enriched.camelotKey ?? existing.camelotKey,
        musicalKey: enriched.musicalKey ?? existing.musicalKey,
        bpmEstimated: enriched.bpmEstimated ?? existing.bpmEstimated,
        keyEstimated: enriched.keyEstimated ?? existing.keyEstimated,
        vibeTags: [...new Set([...(existing.vibeTags ?? []), ...(enriched.vibeTags ?? [])])].slice(0, 6),
        isPrimary: existing.isPrimary,
      };
    }),
  };
}

export type EnrichReleaseOpts = {
  discogsId?: number;
  /** Release/album title — always sent to the enrich API for album-scoped matching */
  albumTitle: string;
  genres?: string[];
  force?: boolean;
};

/** Enrich each track sequentially; fires callbacks around every API round-trip. */
export async function enrichReleaseTracksSequential(
  record: VinylRecord,
  opts: EnrichReleaseOpts,
  callbacks: {
    onTrackStart?: (track: Track) => void;
    onTrackEnriched: (track: Track) => void;
    getTrack?: (trackId: string) => Track | undefined;
    isCancelled?: () => boolean;
  }
): Promise<void> {
  const trackIds = record.tracks.map((t) => t.id);
  const usedKeys: string[] = [];
  for (let i = 0; i < trackIds.length; i++) {
    if (callbacks.isCancelled?.()) return;

    const source =
      callbacks.getTrack?.(trackIds[i]) ??
      record.tracks.find((t) => t.id === trackIds[i]);
    if (!source) continue;

    const force = opts.force ?? false;

    if (!force && !trackNeedsEnrichment(source)) {
      callbacks.onTrackEnriched(source);
      continue;
    }

    callbacks.onTrackStart?.(source);

    const enriched = await enrichOneTrack(record.artist, { ...source }, {
      discogsId: opts.discogsId,
      albumTitle: opts.albumTitle,
      genres: opts.genres,
      replace: force,
      usedKeys: [...usedKeys],
    });

    const code = enriched.camelotKey?.match(/^\d{1,2}[AB]$/i)?.[0].toUpperCase();
    if (code) usedKeys.push(code);

    callbacks.onTrackEnriched(enriched);
    if (callbacks.isCancelled?.()) return;
    if (i < trackIds.length - 1) await sleep(ENRICH_DELAY_MS);
  }
}

/** Fetch per-track enrichment for a release (batch; no live UI updates). */
export async function fetchEnrichedTracksForRelease(record: VinylRecord): Promise<Track[]> {
  const enriched: Track[] = [];
  await enrichReleaseTracksSequential(
    record,
    {
      discogsId: record.discogsId,
      albumTitle: record.title,
      genres: record.genres,
      force: true,
    },
    { onTrackEnriched: (t) => enriched.push(t) }
  );
  return enriched;
}

function trackNeedsEnrichment(track: Track): boolean {
  return track.bpm == null || !resolveTrackCamelot(track).code;
}

/** True when every track has BPM + Camelot for DJ use. */
export function isReleaseFullyEnriched(record: VinylRecord): boolean {
  if (!record.tracks.length) return false;
  return record.tracks.every((t) => t.bpm != null && Boolean(resolveTrackCamelot(t).code));
}

/** @deprecated Use fetchEnrichedTracksForRelease + merge on latest record in state */
export async function enrichReleaseTracks(record: VinylRecord): Promise<VinylRecord> {
  const enrichedTracks = await fetchEnrichedTracksForRelease(record);
  return mergeEnrichedTracksIntoRelease(record, enrichedTracks);
}

export async function enrichOneTrack(
  artist: string,
  track: Track,
  opts: {
    discogsId?: number;
    albumTitle: string;
    genres?: string[];
    replace?: boolean;
    usedKeys?: string[];
  }
): Promise<Track> {
  const searchTitle = normalizeTrackTitleForSearch(track.title);
  if (!searchTitle) return track;

  const albumTitle = opts.albumTitle.trim();
  const trackArtist = track.artist?.trim() || artist;
  const attempts: { artist: string; title: string }[] = [
    { artist: trackArtist, title: searchTitle },
  ];
  if (trackArtist.toLowerCase() !== artist.trim().toLowerCase()) {
    attempts.push({ artist: artist.trim(), title: searchTitle });
  }

  let best = opts.replace ? clearTrackMusicalData(track) : track;

  // One server round-trip: album+position match first, loose search only on server fallback
  for (const attempt of attempts) {
    try {
      const data = await enrichTrack(
        attempt.artist,
        attempt.title,
        opts.discogsId,
        albumTitle,
        opts.genres,
        {
          trackOnly: true,
          keyFallback: true,
          trackPosition: track.position?.trim() || undefined,
          usedKeys: opts.usedKeys,
        }
      );
      best = mergeEnrichOntoTrackRow(best, data, { replace: opts.replace });
      if (best.bpm != null && resolveTrackCamelot(best).code) return best;
      if (!opts.replace && (best.bpm != null || resolveTrackCamelot(best).code)) return best;
    } catch {
      /* try next artist variant */
    }
  }

  return best;
}

/** Enrich one track on a release (manual refresh or detail actions). */
export async function enrichSingleTrackForRecord(
  record: VinylRecord,
  trackId: string
): Promise<Track | null> {
  const track = record.tracks.find((t) => t.id === trackId);
  if (!track) return null;

  return enrichOneTrack(record.artist, track, {
    discogsId: record.discogsId,
    albumTitle: record.title,
    genres: record.genres,
  });
}

/**
 * Enrich every track with its own title + artist lookup. Genre BPM/Camelot is
 * only used when a track has no track-specific hit after the API pass.
 */
export async function enrichAllTracks(
  artist: string,
  tracks: Track[],
  opts: {
    discogsId?: number;
    albumTitle: string;
    genres?: string[];
    /** Re-query every track (manual release enrich) */
    force?: boolean;
  }
): Promise<Track[]> {
  if (!tracks.length) return tracks;

  const enriched: Track[] = [];
  const usedKeys: string[] = [];
  for (let i = 0; i < tracks.length; i++) {
    let track = tracks[i];
    if (opts.force || trackNeedsEnrichment(track)) {
      track = await enrichOneTrack(artist, track, {
        discogsId: opts.discogsId,
        albumTitle: opts.albumTitle,
        genres: opts.genres,
        replace: opts.force,
        usedKeys: [...usedKeys],
      });
      const code = track.camelotKey?.match(/^\d{1,2}[AB]$/i)?.[0].toUpperCase();
      if (code) usedKeys.push(code);
    }
    enriched.push({ ...track, vibeTags: track.vibeTags ?? [] });
    if (i < tracks.length - 1) await sleep(ENRICH_DELAY_MS);
  }

  return enriched;
}

export function migrateRecord(raw: LegacyVinylRecord): VinylRecord {
  let migrated: VinylRecord;

  if (Array.isArray(raw.tracks) && raw.tracks.length > 0) {
    const { bpm: _b, camelotKey: _k, vibeTags: _v, ...release } = raw as LegacyVinylRecord;
    migrated = {
      ...release,
      tracks: raw.tracks.map((t) => ({
        ...t,
        vibeTags: t.vibeTags ?? [],
      })),
    };
  } else {
    const legacy = raw as LegacyVinylRecord;
    const { bpm, camelotKey, vibeTags, tracks: _t, ...release } = legacy;

    migrated = {
      ...release,
      tracks: [
        {
          id: generateId(),
          title: release.title,
          isPrimary: true,
          bpm,
          camelotKey,
          vibeTags: vibeTags ?? [],
        },
      ],
    };
  }

  return {
    ...migrated,
    addSource: inferAddSource(migrated),
    coverUrl: resolveDiscogsCoverUrl(migrated.coverUrl),
  };
}

export function createPrimaryTrack(
  title: string,
  musical?: Partial<Pick<Track, 'bpm' | 'camelotKey' | 'musicalKey' | 'vibeTags' | 'artist' | 'position' | 'duration'>>
): Track {
  return {
    id: generateId(),
    title,
    isPrimary: true,
    vibeTags: musical?.vibeTags ?? [],
    ...musical,
  };
}

export function patchTrack(
  record: VinylRecord,
  trackId: string,
  patch: Partial<Pick<Track, 'bpm' | 'camelotKey' | 'musicalKey' | 'vibeTags' | 'title' | 'artist' | 'position' | 'duration'>>
): VinylRecord {
  const exists = record.tracks.some((t) => t.id === trackId);
  if (!exists) {
    return {
      ...record,
      tracks: [...record.tracks, createPrimaryTrack(record.title, patch)],
    };
  }

  return {
    ...record,
    tracks: record.tracks.map((t) =>
      t.id === trackId ? { ...t, ...patch, vibeTags: patch.vibeTags ?? t.vibeTags } : t
    ),
  };
}

export function patchPrimaryTrack(
  record: VinylRecord,
  patch: Partial<Pick<Track, 'bpm' | 'camelotKey' | 'musicalKey' | 'vibeTags' | 'title' | 'artist'>>
): VinylRecord {
  const primary = getPrimaryTrack(record);
  if (!primary) {
    return {
      ...record,
      tracks: [createPrimaryTrack(record.title, patch)],
    };
  }
  return patchTrack(record, primary.id, patch);
}

function trackMatchKey(title: string, position?: string): string {
  return trackRowKey({ title, position });
}

/** Merge Discogs tracklist into an existing record, preserving track ids and enrichment. */
export function mergeDiscogsTracklistIntoRecord(
  record: VinylRecord,
  discogs: Pick<DiscogsReleaseDetail, 'tracklist' | 'genres' | 'coverUrl' | 'year'>
): VinylRecord {
  const items = (discogs.tracklist ?? []).filter(isPlayableDiscogsTrack);
  if (items.length === 0) return record;

  const existingByKey = new Map<string, Track>();
  for (const t of record.tracks) {
    existingByKey.set(trackMatchKey(t.title, t.position), t);
    if (!t.position) existingByKey.set(t.title.trim().toLowerCase(), t);
  }

  const previousPrimary = getPrimaryTrack(record);
  const previousPrimaryId = previousPrimary?.id;

  const tracks: Track[] = items.map((item) => {
    const title = item.title.trim();
    const position = item.position?.trim() || undefined;
    const match =
      existingByKey.get(trackMatchKey(title, position)) ??
      existingByKey.get(title.toLowerCase());

    if (match) {
      return {
        ...match,
        title,
        position: position ?? match.position,
        duration: item.duration?.trim() || match.duration,
        vibeTags: match.vibeTags ?? [],
      };
    }

    return {
      id: generateId(),
      title,
      position,
      duration: item.duration?.trim() || undefined,
      isPrimary: false,
      vibeTags: [],
    };
  });

  let primaryIndex = previousPrimaryId
    ? tracks.findIndex((t) => t.id === previousPrimaryId)
    : 0;
  if (primaryIndex < 0) primaryIndex = 0;

  const normalizedTracks = tracks.map((t, i) => ({
    ...t,
    isPrimary: i === primaryIndex,
  }));

  return {
    ...record,
    tracks: normalizedTracks,
    genres:
      discogs.genres?.length && discogs.genres.length > 0
        ? [...new Set([...record.genres, ...discogs.genres])].slice(0, 12)
        : record.genres,
    coverUrl:
      resolveDiscogsCoverUrl(record.coverUrl) ??
      resolveDiscogsCoverUrl(discogs.coverUrl),
    year: record.year,
  };
}

export function isPlayableDiscogsTrack(item: DiscogsTracklistItem): boolean {
  const kind = (item.type_ ?? item.type ?? 'track').toLowerCase();
  if (kind === 'heading' || kind === 'index') return false;
  return Boolean(item.title?.trim());
}

/** Map Discogs tracklist → app tracks (catalog fields only; use enrichAllTracks for BPM/key/vibes). */
export function tracksFromDiscogsTracklist(
  tracklist: DiscogsTracklistItem[] | undefined,
  fallbackTitle?: string
): Track[] {
  const items = (tracklist ?? []).filter(isPlayableDiscogsTrack);

  if (items.length === 0) {
    return [createPrimaryTrack(fallbackTitle ?? 'Unknown', { vibeTags: [] })];
  }

  return items.map((item, index) => ({
    id: generateId(),
    title: item.title.trim(),
    position: item.position?.trim() || undefined,
    duration: item.duration?.trim() || undefined,
    isPrimary: index === 0,
    vibeTags: [],
  }));
}

/** Build a full release from Discogs detail; optional overrides apply to primary track only. */
export function releaseFromDiscogsImport(
  release: Omit<VinylRecord, 'id' | 'addedAt' | 'tracks'>,
  discogs: Pick<DiscogsReleaseDetail, 'tracklist' | 'bpm' | 'camelotKey' | 'musicalKey'>,
  overrides?: {
    bpm?: number;
    camelotKey?: string;
    vibeTags?: string[];
  }
): Omit<VinylRecord, 'id' | 'addedAt'> {
  let tracks = tracksFromDiscogsTracklist(discogs.tracklist, release.title);

  const primaryPatch = {
    bpm: overrides?.bpm ?? discogs.bpm,
    camelotKey: overrides?.camelotKey ?? discogs.camelotKey,
    musicalKey: discogs.musicalKey,
    vibeTags: overrides?.vibeTags ?? [],
  };

  if (
    tracks.length > 0 &&
    (primaryPatch.bpm != null ||
      primaryPatch.camelotKey ||
      primaryPatch.musicalKey ||
      primaryPatch.vibeTags.length > 0)
  ) {
    const [primary, ...rest] = tracks;
    tracks = [{ ...primary, ...primaryPatch, vibeTags: primaryPatch.vibeTags }, ...rest];
  }

  return { ...release, tracks };
}

/** Build a release payload from add-form fields (musical data → primary track only). */
export function releaseWithPrimaryTrack(
  release: Omit<VinylRecord, 'id' | 'addedAt' | 'tracks'>,
  musical: {
    bpm?: number;
    camelotKey?: string;
    musicalKey?: string;
    vibeTags?: string[];
    trackTitle?: string;
  }
): Omit<VinylRecord, 'id' | 'addedAt'> {
  return {
    ...release,
    tracks: [
      createPrimaryTrack(musical.trackTitle ?? release.title, {
        bpm: musical.bpm,
        camelotKey: musical.camelotKey,
        musicalKey: musical.musicalKey,
        vibeTags: musical.vibeTags ?? [],
      }),
    ],
  };
}

export function mergeEnrichmentOntoTrack(
  record: VinylRecord,
  trackId: string,
  data: {
    bpm?: number;
    camelotKey?: string;
    vibeTags?: string[];
  }
): Partial<VinylRecord> {
  const track = record.tracks.find((t) => t.id === trackId);
  if (!track) return {};

  const mergedVibes = [...new Set([...(track.vibeTags ?? []), ...(data.vibeTags ?? [])])].slice(0, 6);

  return {
    tracks: patchTrack(record, trackId, {
      bpm: data.bpm ?? track.bpm,
      camelotKey: data.camelotKey ?? track.camelotKey,
      vibeTags: mergedVibes,
    }).tracks,
  };
}

/** @deprecated Prefer mergeEnrichmentOntoTrack for a specific track id */
export function mergeEnrichmentOntoRelease(
  record: VinylRecord,
  data: {
    coverUrl?: string;
    genres?: string[];
    bpm?: number;
    camelotKey?: string;
    vibeTags?: string[];
  },
  trackId?: string
): Partial<VinylRecord> {
  const targetId = trackId ?? getPrimaryTrack(record)?.id;
  const patch: Partial<VinylRecord> = {
    coverUrl:
      resolveDiscogsCoverUrl(data.coverUrl) ?? resolveDiscogsCoverUrl(record.coverUrl),
    genres: data.genres?.length ? data.genres : record.genres,
  };

  if (!targetId) return patch;

  return {
    ...patch,
    ...mergeEnrichmentOntoTrack(record, targetId, data),
  };
}