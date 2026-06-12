import { resolveDiscogsCoverUrl } from './discogsCover';

export type ClientEnrichResult = {
  source: 'client';
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

/** True when the app can call the serverless `/api/enrich` route (dev + production). */
export function isLiveServerEnrichmentAvailable(): boolean {
  return true;
}

export const ENRICHMENT_ESTIMATE_HINT =
  'BPM and key are genre-based estimates — server enrichment was unavailable for this lookup.';

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
  ['trip-hop', '6A'],
  ['trip hop', '6A'],
  ['downtempo', '6A'],
  ['chillout', '6A'],
  ['nu jazz', '3B'],
  ['nu-jazz', '3B'],
  ['lounge', '3B'],
  ['ambient', '6A'],
  ['dub', '6A'],
  ['reggae', '10A'],
  ['latin', '9A'],
  ['trance', '7B'],
  ['electro', '8A'],
  ['hard rock', '7A'],
  ['rock', '5A'],
  ['metal', '7A'],
  ['punk', '4A'],
  ['pop', '9B'],
  ['blues', '3B'],
  ['country', '10B'],
  ['folk', '6A'],
  ['progressive', '6A'],
  ['psychedelic', '6A'],
];

const DEFAULT_CAMELOT_POOL = ['5A', '7A', '9B', '3B', '10B', '8B'] as const;

type GenreBpmProfile = { center: number; min: number; max: number };

function hashTrackSeed(artist: string, title: string): number {
  const s = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function estimateCamelotFromGenres(genres: string[]): string | undefined {
  const text = genres.join(' ').toLowerCase();
  for (const [key, camelot] of GENRE_CAMELOT) {
    if (text.includes(key)) return camelot;
  }
  return undefined;
}

function defaultCamelotForGenres(genres: string[]): string {
  const text = genres.join(' ').toLowerCase().trim();
  const h = hashTrackSeed(text || 'vinyl', 'album');
  return DEFAULT_CAMELOT_POOL[h % DEFAULT_CAMELOT_POOL.length];
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

  for (let i = 0; i < pool.length; i += 1) {
    const key = pool[(start + i) % pool.length];
    if (usedKeys.filter((k) => k.toUpperCase() === key).length === 0) return key;
  }

  for (let i = 0; i < pool.length; i += 1) {
    const key = pool[(start + i) % pool.length];
    if (usedKeys.filter((k) => k.toUpperCase() === key).length < 2) return key;
  }

  return pool[start];
}

function genreBpmProfile(genres: string[]): GenreBpmProfile {
  const text = genres.join(' ').toLowerCase();

  if (text.includes('drum and bass') || text.includes('dnb')) {
    return { center: 172, min: 160, max: 188 };
  }
  if (text.includes('techno') || text.includes('tech house')) {
    return { center: 128, min: 118, max: 140 };
  }
  if (text.includes('house') || text.includes('garage')) {
    return { center: 124, min: 112, max: 132 };
  }
  if (
    text.includes('soul') ||
    text.includes('smooth') ||
    text.includes('r&b') ||
    text.includes('rnb') ||
    text.includes('quiet storm') ||
    text.includes('ballad')
  ) {
    return { center: 92, min: 72, max: 118 };
  }
  if (text.includes('disco') || text.includes('funk')) {
    return { center: 112, min: 95, max: 128 };
  }
  if (
    text.includes('trip hop') ||
    text.includes('trip-hop') ||
    text.includes('downtempo') ||
    text.includes('chillout') ||
    text.includes('nu jazz') ||
    text.includes('nu-jazz')
  ) {
    return { center: 90, min: 72, max: 108 };
  }
  if (text.includes('jazz') || text.includes('bossa') || text.includes('lounge')) {
    return { center: 105, min: 70, max: 130 };
  }
  if (text.includes('ambient')) {
    return { center: 82, min: 60, max: 100 };
  }
  if (text.includes('hip hop') || text.includes('hip-hop') || text.includes('rap')) {
    return { center: 94, min: 78, max: 110 };
  }
  if (text.includes('hard rock') || text.includes('metal') || text.includes('punk')) {
    return { center: 122, min: 95, max: 150 };
  }
  if (text.includes('rock') || text.includes('alternative')) {
    return { center: 118, min: 90, max: 145 };
  }
  if (text.includes('pop')) {
    return { center: 112, min: 85, max: 135 };
  }
  if (text.includes('blues') || text.includes('country') || text.includes('folk')) {
    return { center: 100, min: 72, max: 125 };
  }

  return { center: 110, min: 75, max: 140 };
}

function titleBpmOffset(title: string): number {
  const t = title.toLowerCase();
  if (/\b(prelude|intro|interlude|ballad|acoustic|lullaby|slow|waltz)\b/.test(t)) return -16;
  if (/\b(rock|power|heal|energy|fast|upbeat)\b/.test(t)) return 6;
  return 0;
}

function pickEstimatedBpmFromProfile(
  genres: string[],
  artist: string,
  title: string,
  trackPosition?: string
): number {
  const profile = genreBpmProfile(genres);
  const { min, center, max } = profile;
  const steps = [
    min,
    Math.round((min + center) / 2),
    center,
    Math.round((center + max) / 2),
    max,
  ];
  const seed = trackPosition?.trim() ? `${trackPosition.trim()}|${title}` : title;
  const h = hashTrackSeed(artist, seed);
  let bpm = steps[h % steps.length];
  bpm = Math.round(bpm + titleBpmOffset(title));
  return Math.min(max, Math.max(min, bpm));
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

function extractBpmFromText(text: string): number | undefined {
  const bpmMatch = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    const n = parseInt(bpmMatch[1], 10);
    if (n >= 60 && n <= 200) return n;
  }
  return undefined;
}

export type ClientEnrichInput = {
  artist: string;
  trackTitle: string;
  genres?: string[];
  trackPosition?: string;
  usedKeys?: string[];
  keyFallback?: boolean;
  discogsBpm?: number;
  discogsCamelotKey?: string;
  discogsGenres?: string[];
  discogsCoverUrl?: string;
};

/** Client-side enrichment when `/api/enrich` is unavailable (Vercel static hosting). */
export function clientEnrichTrack(input: ClientEnrichInput): ClientEnrichResult {
  const genres = [...new Set([...(input.genres ?? []), ...(input.discogsGenres ?? [])])].slice(0, 12);

  let bpm = input.discogsBpm ?? extractBpmFromText(input.trackTitle);
  let camelotKey = input.discogsCamelotKey?.match(/^\d{1,2}[AB]$/i)
    ? input.discogsCamelotKey.toUpperCase()
    : undefined;
  let bpmEstimated = false;
  let keyEstimated = false;

  if (bpm == null && genres.length > 0) {
    bpm = pickEstimatedBpmFromProfile(
      genres,
      input.artist,
      input.trackTitle,
      input.trackPosition
    );
    bpmEstimated = true;
  }

  if (!camelotKey && input.keyFallback !== false && genres.length > 0) {
    camelotKey = pickEstimatedCamelotKey(
      input.artist,
      input.trackTitle,
      genres,
      input.usedKeys,
      input.trackPosition
    );
    keyEstimated = Boolean(camelotKey);
  }

  return {
    source: 'client',
    genres,
    vibeTags: [],
    bpm,
    camelotKey,
    bpmEstimated,
    keyEstimated,
    trackSpecific: false,
    coverUrl: resolveDiscogsCoverUrl(input.discogsCoverUrl),
  };
}