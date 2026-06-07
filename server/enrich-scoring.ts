import {
  defaultCamelotForGenres,
  estimateCamelotFromGenres,
  isPlausibleTrackBpm,
} from './bpm';
import { hashTrackSeed, pickEstimatedCamelotFromPool } from './camelot-wheel';
import { toCamelotKey } from './key';
import { isExtraVariant, scoreTitleMatch } from './track-match';

export type EnrichSource =
  | 'discogs'
  | 'spotify_album'
  | 'spotify_track'
  | 'deezer_album'
  | 'deezer_track'
  | 'lastfm';

export type BpmCandidate = {
  bpm: number;
  source: EnrichSource;
  /** Title/artist/album identity match (0–1) */
  matchScore: number;
  albumScoped?: boolean;
  positionAnchored?: boolean;
  albumName?: string;
  trackName?: string;
};

export type KeyCandidate = {
  camelotKey: string;
  source: EnrichSource;
  matchScore: number;
  albumScoped?: boolean;
  positionAnchored?: boolean;
  albumName?: string;
  trackName?: string;
  /** From original studio album, not a compilation */
  studioAlbum?: boolean;
};

export type GenreBpmProfile = { center: number; min: number; max: number };

const SOURCE_BPM_WEIGHT: Record<EnrichSource, number> = {
  discogs: 1,
  spotify_album: 0.96,
  deezer_album: 0.92,
  spotify_track: 0.86,
  deezer_track: 0.8,
  lastfm: 0.72,
};

const SOURCE_KEY_WEIGHT: Record<EnrichSource, number> = {
  discogs: 1,
  spotify_album: 0.98,
  spotify_track: 0.9,
  deezer_album: 0,
  deezer_track: 0,
  lastfm: 0.78,
};

const COMPILATION_MARKERS =
  /\b(best of|greatest hits|gold|anthology|collection|essentials|very best|platinum|ultimate|classics)\b/i;

const STUDIO_AVOID_MARKERS =
  /\b(remix|rework|re-?edit|club|dance|extended|live|acoustic|karaoke|cover|tribute|version)\b/i;

export function isCompilationAlbum(albumName?: string): boolean {
  if (!albumName?.trim()) return false;
  return COMPILATION_MARKERS.test(albumName);
}

export function genreBpmProfile(genres: string[]): GenreBpmProfile {
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
  if (text.includes('jazz') || text.includes('bossa') || text.includes('lounge')) {
    return { center: 105, min: 70, max: 130 };
  }
  if (text.includes('ambient') || text.includes('downtempo')) {
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

/** Per-track BPM inside the genre profile — stable per title, varied across an album. */
export function pickEstimatedBpmFromProfile(
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

function bpmGenreFit(bpm: number, profile: GenreBpmProfile): number {
  if (bpm < profile.min || bpm > profile.max) return 0;
  const dist = Math.abs(bpm - profile.center);
  return Math.max(0, 1 - dist / 35);
}

export function scoreBpmCandidate(candidate: BpmCandidate, genres: string[]): number {
  if (!isPlausibleTrackBpm(candidate.bpm, genres)) return -1;

  const profile = genreBpmProfile(genres);
  let score = candidate.matchScore * (SOURCE_BPM_WEIGHT[candidate.source] ?? 0.5);

  if (candidate.albumScoped) score += 0.14;
  if (candidate.positionAnchored) score += 0.1;
  score += bpmGenreFit(candidate.bpm, profile) * 0.28;

  const album = candidate.albumName ?? '';
  if (album && STUDIO_AVOID_MARKERS.test(album)) score -= 0.45;
  if (album && isCompilationAlbum(album)) {
    const farFromCenter = Math.abs(candidate.bpm - profile.center) > 25;
    if (farFromCenter) score -= 0.3;
    if (candidate.bpm > profile.max) score -= 0.25;
  } else if (!album || !isCompilationAlbum(album)) {
    if (!STUDIO_AVOID_MARKERS.test(album)) score += 0.06;
  }

  return score;
}

export function scoreKeyCandidate(
  candidate: KeyCandidate,
  genres: string[],
  usedKeys: string[] = []
): number {
  const key = toCamelotKey(candidate.camelotKey);
  if (!key) return -1;

  let score = candidate.matchScore * (SOURCE_KEY_WEIGHT[candidate.source] ?? 0.5);
  if (candidate.albumScoped) score += 0.16;
  if (candidate.positionAnchored) score += 0.1;
  if (candidate.studioAlbum) score += 0.2;

  const album = candidate.albumName ?? '';
  if (album && isCompilationAlbum(album) && !candidate.studioAlbum) score -= 0.22;
  if (album && STUDIO_AVOID_MARKERS.test(album)) score -= 0.35;

  const repeats = usedKeys.filter((k) => k === key).length;
  if (repeats >= 2) score -= 0.35;
  else if (repeats === 1) score -= 0.12;

  void genres;
  return score;
}

export function pickBestBpm(candidates: BpmCandidate[], genres: string[]): BpmCandidate | undefined {
  let best: BpmCandidate | undefined;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreBpmCandidate(c, genres);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (best && bestScore > 0.32) return best;

  const profile = genreBpmProfile(genres);
  let fallback: BpmCandidate | undefined;
  let fallbackDist = Infinity;
  for (const c of candidates) {
    if (c.matchScore < 0.75) continue;
    const s = scoreBpmCandidate(c, genres);
    if (s < 0.28) continue;
    const dist = Math.abs(c.bpm - profile.center);
    if (dist < fallbackDist) {
      fallbackDist = dist;
      fallback = c;
    }
  }
  return fallback;
}

export function pickBestKey(
  candidates: KeyCandidate[],
  genres: string[],
  usedKeys: string[] = []
): KeyCandidate | undefined {
  let best: KeyCandidate | undefined;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreKeyCandidate(c, genres, usedKeys);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0.34 ? best : undefined;
}

/** Genre-based Camelot when APIs return nothing — stable per track, spread across album. */
export function pickEstimatedCamelotKey(
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

/** Match score for a streaming row vs wanted track context. */
export function streamingMatchScore(
  wanted: { artist: string; title: string; album?: string },
  got: { title: string; artist?: string; album?: string },
  opts?: { minTitle?: number }
): number {
  const minTitle = opts?.minTitle ?? 0.92;
  const t = scoreTitleMatch(wanted.title, got.title);
  if (t < minTitle || isExtraVariant(wanted.title, got.title)) return 0;

  const wantA = wanted.artist.toLowerCase();
  const gotA = (got.artist ?? '').toLowerCase();
  let a = 0;
  if (gotA === wantA) a = 1;
  else if (gotA.includes(wantA) || wantA.includes(gotA)) a = 0.88;
  else return 0;

  let al = 0.5;
  if (wanted.album && got.album) {
    const w = wanted.album.toLowerCase();
    const g = got.album.toLowerCase();
    if (g === w) al = 1;
    else if (g.includes(w) || w.includes(g)) al = 0.9;
    else al = 0.35;
  }

  return t * 0.5 + a * 0.35 + al * 0.15;
}