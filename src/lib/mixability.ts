import { resolveTrackCamelot } from './camelot';
import type { Track } from './types';

export type MixabilityKind =
  | 'mixable'
  | 'intro'
  | 'outro'
  | 'interlude'
  | 'spoken'
  | 'short'
  | 'unknown';

export type MixabilityProfile = {
  kind: MixabilityKind;
  /** 0–100 — higher = better DJ mix partner */
  score: number;
  reason?: string;
};

const NON_MIXABLE_TITLE =
  /\b(intro|introduction|outro|interlude|prelude|skit|spoken|dialogue|monologue|prologue|epilogue|reprise|hidden\s+track|snippet|excerpt|preview|radio\s+edit|clean\s+edit|acapella|a\s*cappella|spoken\s+word|vocal\s+only|voice\s+only|commentary|announcement|fade\s+out|countdown)\b/i;

const VOCAL_STRIP_TITLE =
  /\b(acoustic\s+version|unplugged|vocal\s+mix|vocal\s+edit|a\s*vocal)\b/i;

/** Parse Discogs-style durations: "3:45", "1:02:30" */
export function parseDurationSeconds(duration?: string): number | null {
  if (!duration?.trim()) return null;
  const parts = duration.trim().split(':').map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function kindFromTitle(title: string): MixabilityKind | null {
  const t = title.toLowerCase();
  if (/\b(intro|introduction|prologue)\b/.test(t)) return 'intro';
  if (/\b(outro|epilogue|fade\s+out)\b/.test(t)) return 'outro';
  if (/\b(interlude|prelude|reprise)\b/.test(t)) return 'interlude';
  if (/\b(skit|spoken|dialogue|monologue|spoken\s+word|commentary|announcement)\b/.test(t)) {
    return 'spoken';
  }
  return null;
}

export function classifyTrackMixability(
  track: Track,
  _recordGenres?: string[]
): MixabilityProfile {
  const title = track.title.trim();
  const titledKind = kindFromTitle(title);

  if (NON_MIXABLE_TITLE.test(title)) {
    return {
      kind: titledKind ?? 'intro',
      score: 0,
      reason: 'Intro / skit / non-mix section',
    };
  }

  const secs = parseDurationSeconds(track.duration);

  if (secs != null && secs < 60) {
    return { kind: 'short', score: 0, reason: 'Under 1 minute' };
  }

  if (secs != null && secs < 90) {
    return { kind: 'short', score: 15, reason: 'Very short' };
  }

  if (VOCAL_STRIP_TITLE.test(title)) {
    return { kind: 'interlude', score: 20, reason: 'Vocal / acoustic cut' };
  }

  if (secs != null && secs < 120) {
    return { kind: 'short', score: 40, reason: 'Short — OK for a bridge' };
  }

  let score = 55;

  if (track.isPrimary) score += 18;
  if (track.bpm != null && !track.bpmEstimated) score += 12;
  if (resolveTrackCamelot(track).code && !track.keyEstimated) score += 8;
  if ((track.vibeTags?.length ?? 0) > 0) score += 4;
  if (secs != null && secs >= 240) score += 8;
  if (secs != null && secs >= 360) score += 4;

  return {
    kind: 'mixable',
    score: Math.min(100, score),
  };
}

/** Tracks below this never appear as mix partners. */
export function isMixPartnerCandidate(track: Track, recordGenres?: string[]): boolean {
  return classifyTrackMixability(track, recordGenres).score >= 45;
}

/**
 * Score adjustment for recommendation engines.
 * Returns -999 to signal hard exclusion.
 */
export function mixabilityAdjustment(
  track: Track,
  recordGenres: string[] | undefined,
  anchor?: Track
): number {
  const profile = classifyTrackMixability(track, recordGenres);
  if (profile.score < 45) return -999;

  let adj = Math.round((profile.score - 55) * 0.45);

  const candSecs = parseDurationSeconds(track.duration);
  const anchorSecs = anchor ? parseDurationSeconds(anchor.duration) : null;

  if (anchorSecs != null && anchorSecs >= 180 && candSecs != null && candSecs < 120) {
    adj -= 30;
  }

  if (anchor && classifyTrackMixability(anchor, recordGenres).score >= 65 && profile.score < 55) {
    adj -= 18;
  }

  if (!track.isPrimary && profile.score < 60) {
    adj -= 8;
  }

  if (profile.kind === 'short') adj -= 10;

  return adj;
}

export function mixabilityLabel(track: Track, recordGenres?: string[]): string | null {
  const { reason, score } = classifyTrackMixability(track, recordGenres);
  if (score >= 45 || !reason) return null;
  return reason;
}