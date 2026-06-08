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
  release?: {
    genres?: string[];
    coverUrl?: string;
    releaseTitle?: string;
    tracklist?: { title: string; position?: string }[];
  };
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

export class EnrichValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnrichValidationError';
  }
}

const WHEEL_NEIGHBORS: Record<string, string[]> = {
  '1A': ['12A', '2A', '1B'],
  '2A': ['1A', '3A', '2B'],
  '3A': ['2A', '4A', '3B'],
  '4A': ['3A', '5A', '4B'],
  '5A': ['4A', '6A', '5B'],
  '6A': ['5A', '7A', '6B'],
  '7A': ['6A', '8A', '7B'],
  '8A': ['7A', '9A', '8B'],
  '9A': ['8A', '10A', '9B'],
  '10A': ['9A', '11A', '10B'],
  '11A': ['10A', '12A', '11B'],
  '12A': ['11A', '1A', '12B'],
  '1B': ['12B', '2B', '1A'],
  '2B': ['1B', '3B', '2A'],
  '3B': ['2B', '4B', '3A'],
  '4B': ['3B', '5B', '4A'],
  '5B': ['4B', '6B', '5A'],
  '6B': ['5B', '7B', '6A'],
  '7B': ['6B', '8B', '7A'],
  '8B': ['7B', '9B', '8A'],
  '9B': ['8B', '10B', '9A'],
  '10B': ['9B', '11B', '10A'],
  '11B': ['10B', '12B', '11A'],
  '12B': ['11B', '1B', '12A'],
};

const GENRE_CAMELOT: [string, string][] = [
  ['tech house', '8A'],
  ['deep house', '10A'],
  ['house', '8A'],
  ['techno', '8A'],
  ['minimal', '9A'],
  ['garage', '5A'],
  ['drum and bass', '4A'],
  ['dnb', '4A'],
  ['soul', '8B'],
  ['smooth', '8B'],
  ['quiet storm', '8B'],
  ['r&b', '5B'],
  ['rnb', '5B'],
  ['disco', '10B'],
  ['funk', '5B'],
  ['jazz', '3B'],
  ['hip hop', '4A'],
  ['hip-hop', '4A'],
  ['rap', '4A'],
  ['ambient', '6A'],
  ['dub', '6A'],
  ['reggae', '10A'],
  ['latin', '9A'],
  ['trance', '7B'],
  ['electro', '8A'],
  ['hard rock', '7A'],
  ['rock', '5A'],
  ['pop', '9B'],
  ['blues', '6B'],
  ['country', '4B'],
  ['folk', '2B'],
];

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

function hashTrackSeed(artist: string, title: string): number {
  const s = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function genreBpmProfile(genres: string[]) {
  const text = genres.join(' ').toLowerCase();
  if (text.includes('drum and bass') || text.includes('dnb')) return { center: 172, min: 160, max: 188 };
  if (text.includes('techno') || text.includes('tech house')) return { center: 128, min: 118, max: 140 };
  if (text.includes('deep house')) return { center: 122, min: 112, max: 128 };
  if (text.includes('house')) return { center: 124, min: 115, max: 132 };
  if (text.includes('disco') || text.includes('funk')) return { center: 118, min: 105, max: 126 };
  if (text.includes('soul') || text.includes('r&b') || text.includes('rnb')) return { center: 98, min: 88, max: 108 };
  if (text.includes('jazz')) return { center: 110, min: 95, max: 125 };
  if (text.includes('hip hop') || text.includes('hip-hop') || text.includes('rap')) return { center: 92, min: 80, max: 100 };
  if (text.includes('ambient') || text.includes('dub')) return { center: 80, min: 70, max: 95 };
  if (text.includes('rock') || text.includes('metal')) return { center: 122, min: 110, max: 140 };
  if (text.includes('pop')) return { center: 112, min: 95, max: 128 };
  return { center: 118, min: 95, max: 132 };
}

function titleBpmOffset(title: string): number {
  const t = title.toLowerCase();
  if (/\b(slow|ballad|lullaby|ambient)\b/.test(t)) return -6;
  if (/\b(fast|uptempo|club|dance|remix)\b/.test(t)) return 5;
  return 0;
}

function estimateCamelotFromGenres(genres: string[]): string | undefined {
  const text = genres.join(' ').toLowerCase();
  for (const [key, camelot] of GENRE_CAMELOT) {
    if (text.includes(key)) return camelot;
  }
  return undefined;
}

function defaultCamelotForGenres(genres: string[]): string {
  const text = genres.join(' ').toLowerCase();
  if (text.includes('electronic') || text.includes('dance')) return '8A';
  if (text.includes('soul') || text.includes('jazz')) return '8B';
  return '5A';
}

function pickEstimatedCamelotFromPool(
  baseKey: string,
  artist: string,
  title: string,
  usedKeys: string[] = []
): string {
  const base = baseKey.match(/^\d{1,2}[AB]$/i)?.[0].toUpperCase();
  if (!base) return baseKey;
  const pool = [base, ...(WHEEL_NEIGHBORS[base] ?? [])];
  const start = hashTrackSeed(artist, title) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    if (!usedKeys.some((k) => k.toUpperCase() === key)) return key;
  }
  return pool[start];
}

function pickEstimatedBpm(
  genres: string[],
  artist: string,
  title: string,
  trackPosition?: string
): number {
  const profile = genreBpmProfile(genres);
  const steps = [
    profile.min,
    Math.round((profile.min + profile.center) / 2),
    profile.center,
    Math.round((profile.center + profile.max) / 2),
    profile.max,
  ];
  const seed = trackPosition?.trim() ? `${trackPosition.trim()}|${title}` : title;
  const h = hashTrackSeed(artist, seed);
  let bpm = steps[h % steps.length];
  bpm = Math.round(bpm + titleBpmOffset(title));
  return Math.min(profile.max, Math.max(profile.min, bpm));
}

function pickEstimatedCamelotKey(
  artist: string,
  title: string,
  genres: string[],
  usedKeys: string[] = [],
  trackPosition?: string
): string | undefined {
  if (!genres.length) return undefined;
  const base = estimateCamelotFromGenres(genres) ?? defaultCamelotForGenres(genres);
  const seed = trackPosition?.trim() ? `${trackPosition.trim()}|${title}` : title;
  return pickEstimatedCamelotFromPool(base, artist, seed, usedKeys);
}

function spotifyToCamelot(key: number, mode: number): string | undefined {
  if (key < 0 || key > 11) return undefined;
  return CAMELOT[`${key}-${mode}`];
}

function parseStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseReleasePayload(value: unknown): EnrichInput['release'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const release = value as Record<string, unknown>;
  const tracklist = Array.isArray(release.tracklist)
    ? release.tracklist
        .map((row) => {
          if (!row || typeof row !== 'object') return null;
          const title = 'title' in row ? String(row.title ?? '').trim() : '';
          if (!title) return null;
          const position =
            'position' in row && row.position != null
              ? String(row.position).trim() || undefined
              : undefined;
          return position ? { title, position } : { title };
        })
        .filter(Boolean) as { title: string; position?: string }[]
    : undefined;

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
    tracklist: tracklist?.length ? tracklist : undefined,
  };
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
  if (!artist || !title) throw new EnrichValidationError('artist and title are required');

  const discogsIdRaw = data.discogsId;
  const discogsId =
    discogsIdRaw == null || discogsIdRaw === ''
      ? undefined
      : Number.isFinite(Number(discogsIdRaw)) && Number(discogsIdRaw) > 0
        ? Number(discogsIdRaw)
        : undefined;

  return {
    artist,
    title,
    album: typeof data.album === 'string' ? data.album.trim() || undefined : undefined,
    position:
      typeof data.position === 'string' ? data.position.trim() || undefined : undefined,
    discogsId,
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
    return Array.isArray(value) ? value[0] : value;
  };
  const artist = pick('artist')?.trim() ?? '';
  const title = pick('title')?.trim() ?? '';
  if (!artist || !title) throw new EnrichValidationError('artist and title are required');

  const genresParam = pick('genres');
  const usedKeysParam = pick('usedKeys');
  const genreFallback = pick('genreFallback') === '1';
  const discogsIdRaw = pick('discogsId');
  const discogsId =
    discogsIdRaw && Number.isFinite(Number(discogsIdRaw)) && Number(discogsIdRaw) > 0
      ? Number(discogsIdRaw)
      : undefined;

  return {
    artist,
    title,
    album: pick('album')?.trim() || undefined,
    position: pick('position')?.trim() || undefined,
    discogsId,
    genres: genresParam
      ? genresParam.split(',').map((g) => g.trim()).filter(Boolean)
      : undefined,
    usedKeys: usedKeysParam
      ? usedKeysParam.split(',').map((k) => k.trim()).filter(Boolean)
      : undefined,
    trackOnly: !genreFallback,
    keyFallback: pick('keyFallback') === '1' || genreFallback,
  };
}

let spotifyTokenCache: { token: string; expires: number } | null = null;

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string | null> {
  if (spotifyTokenCache && Date.now() < spotifyTokenCache.expires) {
    return spotifyTokenCache.token;
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${auth}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  spotifyTokenCache = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000,
  };
  return data.access_token;
}

async function spotifyTrackAudio(
  clientId: string,
  clientSecret: string,
  artist: string,
  title: string,
  album?: string
): Promise<{
  bpm?: number;
  camelotKey?: string;
  spotifyTrackId?: string;
  spotifyPreviewUrl?: string;
} | null> {
  const token = await getSpotifyToken(clientId, clientSecret);
  if (!token) return null;

  const q = `track:${title} artist:${artist}${album ? ` album:${album}` : ''}`;
  const searchRes = await fetch(
    `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: 'track', limit: '5' })}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!searchRes.ok) return null;

  const searchData = (await searchRes.json()) as {
    tracks?: { items?: { id: string; name: string; preview_url?: string | null; artists?: { name: string }[]; album?: { name: string } }[] };
  };
  const items = searchData.tracks?.items ?? [];
  const wantArtist = artist.toLowerCase();
  const wantTitle = title.toLowerCase();
  const match =
    items.find((item) => {
      const gotArtist = item.artists?.[0]?.name?.toLowerCase() ?? '';
      const gotTitle = item.name.toLowerCase();
      return (
        gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)
      ) && (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist));
    }) ?? items[0];
  if (!match?.id) return null;

  const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features/${match.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!featuresRes.ok) {
    return {
      spotifyTrackId: match.id,
      spotifyPreviewUrl: match.preview_url ?? undefined,
    };
  }

  const features = (await featuresRes.json()) as {
    tempo?: number;
    key?: number;
    mode?: number;
  };

  return {
    bpm: features.tempo ? Math.round(features.tempo) : undefined,
    camelotKey:
      features.key != null && features.mode != null
        ? spotifyToCamelot(features.key, features.mode)
        : undefined,
    spotifyTrackId: match.id,
    spotifyPreviewUrl: match.preview_url ?? undefined,
  };
}

export async function handleEnrich(
  input: EnrichInput,
  env: {
    spotifyId?: string;
    spotifySecret?: string;
  }
): Promise<EnrichResponse> {
  const genres = [
    ...new Set([...(input.genres ?? []), ...(input.release?.genres ?? [])]),
  ].slice(0, 12);
  const coverUrl = input.release?.coverUrl;
  const albumTitle = (input.release?.releaseTitle ?? input.album)?.trim();
  const keyFallback = input.keyFallback !== false;
  const usedKeys = input.usedKeys ?? [];

  let bpm: number | undefined;
  let camelotKey: string | undefined;
  let bpmEstimated = false;
  let keyEstimated = false;
  let trackSpecific = false;
  let spotifyPreviewUrl: string | undefined;
  let spotifyTrackId: string | undefined;

  if (env.spotifyId && env.spotifySecret) {
    try {
      const spotify = await spotifyTrackAudio(
        env.spotifyId,
        env.spotifySecret,
        input.artist,
        input.title,
        albumTitle
      );
      if (spotify?.bpm) {
        bpm = spotify.bpm;
        trackSpecific = true;
      }
      if (spotify?.camelotKey) {
        camelotKey = spotify.camelotKey;
        trackSpecific = true;
      }
      spotifyPreviewUrl = spotify?.spotifyPreviewUrl;
      spotifyTrackId = spotify?.spotifyTrackId;
    } catch {
      /* genre fallback below */
    }
  }

  if (bpm == null && genres.length > 0) {
    bpm = pickEstimatedBpm(genres, input.artist, input.title, input.position);
    bpmEstimated = true;
  }

  if (!camelotKey && keyFallback && genres.length > 0) {
    camelotKey = pickEstimatedCamelotKey(
      input.artist,
      input.title,
      genres,
      usedKeys,
      input.position
    );
    keyEstimated = Boolean(camelotKey);
  }

  return {
    coverUrl,
    genres,
    bpm,
    camelotKey,
    vibeTags: [],
    bpmEstimated,
    keyEstimated,
    trackSpecific,
    spotifyPreviewUrl,
    spotifyTrackId,
  };
}

