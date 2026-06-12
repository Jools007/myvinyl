import { resolveDiscogsCoverUrl } from '../discogs-cover';
import { bestCoverImage, getRelease } from '../discogs';
import { pickEstimatedBpmFromProfile, pickEstimatedCamelotKey } from '../enrich-scoring';
import { withTimeout } from '../enrich-timeout';
import { resolveTrackEnrichment } from '../enrich-track';

export type EnrichReleasePayload = {
  genres?: string[];
  coverUrl?: string;
  releaseTitle?: string;
  tracklist?: { title: string; position?: string }[];
};

export type EnrichInput = {
  artist: string;
  title: string;
  album?: string;
  position?: string;
  discogsId?: number;
  genres?: string[];
  usedKeys?: string[];
  trackOnly?: boolean;
  keyFallback?: boolean;
  release?: EnrichReleasePayload;
};

export type EnrichResponse = {
  coverUrl?: string;
  genres: string[];
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  vibeTags: string[];
  bpmEstimated?: boolean;
  keyEstimated?: boolean;
  trackSpecific?: boolean;
  spotifyPreviewUrl?: string;
  spotifyTrackId?: string;
};

export type ApiEnv = {
  discogsToken?: string;
  spotifyId?: string;
  spotifySecret?: string;
  lastfmKey?: string;
};

type CachedDiscogsRelease = {
  coverUrl?: string;
  genres: string[];
  tracklist?: { title: string; position?: string }[];
  releaseTitle?: string;
  expires: number;
};

const discogsReleaseCache = new Map<number, CachedDiscogsRelease>();
const DISCOGS_CACHE_MS = 15 * 60 * 1000;

export class EnrichValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichValidationError';
  }
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseTracklist(
  value: unknown
): { title: string; position?: string }[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const rows: { title: string; position?: string }[] = [];
  for (const row of value) {
    if (!row || typeof row !== 'object') continue;
    const title = 'title' in row ? String(row.title ?? '').trim() : '';
    if (!title) continue;
    const position =
      'position' in row && row.position != null
        ? String(row.position).trim() || undefined
        : undefined;
    rows.push(position ? { title, position } : { title });
  }
  return rows.length ? rows : undefined;
}

function parseReleasePayload(value: unknown): EnrichReleasePayload | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const release = value as Record<string, unknown>;
  return {
    genres: parseStringList(release.genres),
    coverUrl:
      typeof release.coverUrl === 'string' ? release.coverUrl.trim() || undefined : undefined,
    releaseTitle:
      typeof release.releaseTitle === 'string'
        ? release.releaseTitle.trim() || undefined
        : typeof release.title === 'string'
          ? release.title.trim() || undefined
          : undefined,
    tracklist: parseTracklist(release.tracklist),
  };
}

function parseDiscogsId(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const id = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(id) && id > 0 ? id : undefined;
}

function parseBoolean(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value === '1' || value.toLowerCase() === 'true') return true;
    if (value === '0' || value.toLowerCase() === 'false') return false;
  }
  return defaultValue;
}

export function parseEnrichBody(body: unknown): EnrichInput {
  if (!body || typeof body !== 'object') {
    throw new EnrichValidationError('Request body must be a JSON object');
  }

  const data = body as Record<string, unknown>;
  const artist = typeof data.artist === 'string' ? data.artist.trim() : '';
  const title = typeof data.title === 'string' ? data.title.trim() : '';

  if (!artist || !title) {
    throw new EnrichValidationError('artist and title are required');
  }

  return {
    artist,
    title,
    album: typeof data.album === 'string' ? data.album.trim() || undefined : undefined,
    position:
      typeof data.position === 'string' ? data.position.trim() || undefined : undefined,
    discogsId: parseDiscogsId(data.discogsId),
    genres: parseStringList(data.genres),
    usedKeys: parseStringList(data.usedKeys),
    trackOnly: parseBoolean(data.trackOnly, true),
    keyFallback: parseBoolean(data.keyFallback, true),
    release: parseReleasePayload(data.release),
  };
}

export function parseEnrichQuery(
  query: Record<string, string | string[] | undefined>
): EnrichInput {
  const pick = (key: string) => {
    const value = query[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };

  const artist = pick('artist')?.trim() ?? '';
  const title = pick('title')?.trim() ?? '';
  if (!artist || !title) {
    throw new EnrichValidationError('artist and title are required');
  }

  const genresParam = pick('genres');
  const usedKeysParam = pick('usedKeys');
  const genreFallback = pick('genreFallback') === '1';

  return {
    artist,
    title,
    album: pick('album')?.trim() || undefined,
    position: pick('position')?.trim() || undefined,
    discogsId: parseDiscogsId(pick('discogsId')),
    genres: genresParam
      ? genresParam
          .split(',')
          .map((g) => g.trim())
          .filter(Boolean)
      : undefined,
    usedKeys: usedKeysParam
      ? usedKeysParam
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean)
      : undefined,
    trackOnly: !genreFallback,
    keyFallback: pick('keyFallback') === '1' || genreFallback,
  };
}

async function getCachedDiscogsRelease(
  token: string,
  id: number
): Promise<CachedDiscogsRelease | null> {
  const hit = discogsReleaseCache.get(id);
  if (hit && hit.expires > Date.now()) return hit;

  try {
    const release = await getRelease(token, id);
    const entry: CachedDiscogsRelease = {
      coverUrl: resolveDiscogsCoverUrl(bestCoverImage(release.images)),
      genres: [...(release.genres || []), ...(release.styles || [])],
      releaseTitle: release.title?.trim() || undefined,
      tracklist: release.tracklist,
      expires: Date.now() + DISCOGS_CACHE_MS,
    };
    discogsReleaseCache.set(id, entry);
    return entry;
  } catch {
    return null;
  }
}

async function resolveReleaseContext(
  input: EnrichInput,
  discogsToken?: string
): Promise<{
  coverUrl?: string;
  genres: string[];
  discogsTracklist?: { title: string; position?: string }[];
  discogsReleaseTitle?: string;
}> {
  const fromClient = input.release;
  let coverUrl = resolveDiscogsCoverUrl(fromClient?.coverUrl);
  let genres = [...(input.genres ?? []), ...(fromClient?.genres ?? [])].filter(Boolean);
  let discogsTracklist = fromClient?.tracklist;
  let discogsReleaseTitle = fromClient?.releaseTitle;

  if (input.discogsId && discogsToken) {
    const cached = await getCachedDiscogsRelease(discogsToken, input.discogsId);
    if (cached) {
      coverUrl = coverUrl ?? cached.coverUrl;
      genres = cached.genres.length ? cached.genres : genres;
      discogsTracklist = discogsTracklist ?? cached.tracklist;
      discogsReleaseTitle = discogsReleaseTitle ?? cached.releaseTitle;
    }
  }

  return {
    coverUrl,
    genres: [...new Set(genres)].slice(0, 12),
    discogsTracklist,
    discogsReleaseTitle,
  };
}

export async function handleEnrich(input: EnrichInput, env: ApiEnv): Promise<EnrichResponse> {
  const positionSeed = input.position;
  const usedKeys = input.usedKeys ?? [];
  const keyFallback = input.keyFallback !== false;

  const { coverUrl, genres, discogsTracklist, discogsReleaseTitle } =
    await resolveReleaseContext(input, env.discogsToken);

  const trackMeta = await withTimeout(
    resolveTrackEnrichment({
      artist: input.artist,
      trackTitle: input.title,
      albumTitle: input.album,
      discogsReleaseTitle,
      trackPosition: positionSeed,
      genres,
      discogsTracklist,
      spotifyId: env.spotifyId,
      spotifySecret: env.spotifySecret,
      lastfmKey: env.lastfmKey,
      trackOnly: input.trackOnly !== false,
      keyFallback,
      usedKeys,
    }),
    12_000,
    {
      vibeTags: [],
      bpm: genres.length
        ? pickEstimatedBpmFromProfile(genres, input.artist, input.title, positionSeed)
        : undefined,
      bpmEstimated: genres.length > 0,
      camelotKey: genres.length
        ? pickEstimatedCamelotKey(input.artist, input.title, genres, usedKeys, positionSeed)
        : undefined,
      keyEstimated: genres.length > 0,
      trackSpecific: false,
    }
  );

  return {
    coverUrl,
    genres,
    bpm: trackMeta.bpm,
    camelotKey: trackMeta.camelotKey,
    musicalKey: trackMeta.musicalKey,
    vibeTags: [...trackMeta.vibeTags],
    bpmEstimated: trackMeta.bpmEstimated,
    keyEstimated: trackMeta.keyEstimated,
    trackSpecific: trackMeta.trackSpecific,
    spotifyPreviewUrl: trackMeta.spotifyPreviewUrl,
    spotifyTrackId: trackMeta.spotifyTrackId,
  };
}