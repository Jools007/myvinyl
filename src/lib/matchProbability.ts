import { camelotDistance, resolveTrackCamelot } from './camelot';
import { genreAffinityScore, isDowntempoLane } from './genreAffinity';
import { classifyTrackMixability, mixabilityAdjustment } from './mixability';
import {
  classifyRhythmSource,
  isGridRhythmSource,
  rhythmCompatibilityScore,
} from './rhythmSource';
import { formatBpmDelta, formatBpmGap, formatBpmValue } from './formatMix';
import { isBpmEstimatedForMatch } from './tracks';
import type { Track } from './types';

export type MatchTier = 'strong' | 'good' | 'stretch';

export type MatchFactor = {
  label: string;
  delta: number;
};

export type MatchProbabilityResult = {
  probability: number;
  tier: MatchTier;
  factors: MatchFactor[];
  confidence: 'high' | 'medium' | 'low';
};

export type MatchProbabilityInput = {
  anchor: Track;
  candidate: Track;
  anchorGenres: string[];
  candidateGenres: string[];
  anchorArtist?: string;
  candidateArtist?: string;
  /** Live tap BPM from DJ mixer — overrides anchor.bpm when set */
  anchorBpmOverride?: number;
  bpmUncertainty?: number;
};

/**
 * Research-backed blend patterns (Camelot wheel + Lexicon-style BPM/key rules):
 * - Grid↔grid electronic at ±1 Camelot, BPM within 2% — highest live success rate
 * - Downtempo lane (90–105): relative major/minor swaps, not house tempo jumps
 * - Deep house 120–126: adjacent wheel (e.g. 8A↔7A) with matched grid BPM
 */
export const RESEARCH_MATCH_HINTS = [
  'Grid + grid, ±1 on the wheel, BPM within 2% — safest electronic blend',
  'Downtempo lane: keep 90–105 BPM; relative keys beat big tempo lifts',
  'House 120–126: adjacent Camelot (8A↔7A) with matched beatgrid',
] as const;

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function tierFromProbability(probability: number): MatchTier {
  if (probability >= 68) return 'strong';
  if (probability >= 45) return 'good';
  return 'stretch';
}

function bpmDelta(a?: number, b?: number): number | null {
  if (a == null || b == null) return null;
  return b - a;
}

function bpmScore(
  anchorBpm: number | undefined,
  candidateBpm: number | undefined,
  anchorEstimated: boolean,
  candidateEstimated: boolean,
  uncertainty = 3
): { delta: number; factor?: MatchFactor } {
  if (anchorBpm == null || candidateBpm == null) {
    return { delta: -6 };
  }

  const delta = bpmDelta(anchorBpm, candidateBpm)!;
  const abs = Math.abs(delta);
  const pct =
    anchorBpm > 0 ? (abs / anchorBpm) * 100 : abs;

  let deltaScore = 0;
  let label = '';

  if (abs <= 2 || pct <= 2) {
    deltaScore = 14;
    label = `BPM lock (${formatBpmValue(candidateBpm)})`;
  } else if (abs <= 5 || pct <= 4) {
    deltaScore = 8;
    label = `${formatBpmDelta(delta)} BPM`;
  } else if (abs <= 8) {
    deltaScore = 2;
    label = `±${formatBpmGap(abs)} BPM — pitch ride`;
  } else {
    deltaScore = -12;
    label = `${formatBpmGap(abs)} BPM apart — short blend`;
  }

  if (anchorEstimated || candidateEstimated) {
    deltaScore -= 4;
    label = `~${label}`;
  }

  if (uncertainty > 0 && abs <= uncertainty + 2) {
    deltaScore += 2;
  }

  if (anchorBpm < 105 && candidateBpm > anchorBpm + 12) {
    deltaScore -= 10;
    label = 'Tempo jump out of downtempo lane';
  }

  return {
    delta: deltaScore,
    factor: { label, delta: deltaScore },
  };
}

function keyScore(anchor: Track, candidate: Track): { delta: number; factor?: MatchFactor } {
  const anchorKey = resolveTrackCamelot(anchor).code;
  const candKey = resolveTrackCamelot(candidate).code;
  if (!anchorKey || !candKey) return { delta: -8 };

  const dist = camelotDistance(anchorKey, candKey);
  let delta = 0;
  let label = '';

  const keyMark =
    anchor.keyEstimated || candidate.keyEstimated ? '~' : '';

  if (dist === 0) {
    delta = 18;
    label = `Same key (${keyMark}${candKey})`;
  } else if (dist === 1) {
    delta = 14;
    label = `Relative key (${keyMark}${candKey})`;
  } else if (dist === 2) {
    delta = 10;
    label = `Adjacent wheel (${keyMark}${candKey})`;
  } else if (dist === 4) {
    delta = 4;
    label = `Energy lift (${keyMark}${candKey})`;
  } else {
    delta = -20;
    label = `Key clash (${keyMark}${candKey})`;
  }

  return { delta, factor: { label, delta } };
}

/** Unified P(viable blend) scorer — 0–100 with explainable factors. */
export function computeMatchProbability(
  input: MatchProbabilityInput
): MatchProbabilityResult {
  const {
    anchor,
    candidate,
    anchorGenres,
    candidateGenres,
    anchorArtist,
    candidateArtist,
    anchorBpmOverride,
    bpmUncertainty = 3,
  } = input;

  const factors: MatchFactor[] = [];
  let raw = 42;

  const anchorBpm = anchorBpmOverride ?? anchor.bpm;
  const keyPart = keyScore(anchor, candidate);
  raw += keyPart.delta;
  if (keyPart.factor) factors.push(keyPart.factor);

  const anchorBpmEstimated =
    anchorBpmOverride == null && isBpmEstimatedForMatch(anchor);

  const bpmPart = bpmScore(
    anchorBpm,
    candidate.bpm,
    anchorBpmEstimated,
    isBpmEstimatedForMatch(candidate),
    anchorBpmOverride != null ? bpmUncertainty : 0
  );
  raw += bpmPart.delta;
  if (bpmPart.factor) factors.push(bpmPart.factor);

  const rhythmAdj = rhythmCompatibilityScore(
    anchorGenres,
    candidateGenres,
    anchorArtist,
    candidateArtist
  );
  if (rhythmAdj <= -999) {
    return {
      probability: 0,
      tier: 'stretch',
      factors: [{ label: 'Grid ↔ live drums — phase slip', delta: -100 }],
      confidence: 'low',
    };
  }

  if (rhythmAdj >= 14) {
    raw += 10;
    factors.push({ label: 'Grid beatgrid match', delta: 10 });
  } else if (rhythmAdj < 0) {
    raw += rhythmAdj;
    factors.push({ label: 'Rhythm source mismatch', delta: rhythmAdj });
  }

  const genreAdj = genreAffinityScore(anchorGenres, candidateGenres);
  if (genreAdj !== 0) {
    raw += genreAdj * 0.6;
    factors.push({
      label: genreAdj > 0 ? 'Same genre lane' : 'Genre lane clash',
      delta: Math.round(genreAdj * 0.6),
    });
  }

  if (isDowntempoLane(anchorGenres) && !isDowntempoLane(candidateGenres)) {
    raw -= 8;
    factors.push({ label: 'Left downtempo lane', delta: -8 });
  }

  const mixAdj = mixabilityAdjustment(candidate, candidateGenres, anchor);
  if (mixAdj <= -999) {
    return {
      probability: 0,
      tier: 'stretch',
      factors: [{ label: 'Intro / skit — not mixable', delta: -100 }],
      confidence: 'low',
    };
  }
  if (mixAdj !== 0) {
    raw += mixAdj * 0.35;
    if (mixAdj > 3) factors.push({ label: 'Full-length mix section', delta: Math.round(mixAdj * 0.35) });
  }

  const vibeOverlap = (anchor.vibeTags ?? []).filter((t) =>
    (candidate.vibeTags ?? []).some((v) => v.toLowerCase() === t.toLowerCase())
  ).length;
  if (vibeOverlap > 0) {
    const vibeDelta = vibeOverlap * 3;
    raw += vibeDelta;
    factors.push({ label: 'Shared vibe tags', delta: vibeDelta });
  }

  const anchorMix = classifyTrackMixability(anchor, anchorGenres).score;
  const candMix = classifyTrackMixability(candidate, candidateGenres).score;
  if (anchorMix >= 65 && candMix >= 65) {
    raw += 4;
    factors.push({ label: 'Both primary mix cuts', delta: 4 });
  }

  let confidence: MatchProbabilityResult['confidence'] = 'high';
  const estimated =
    anchorBpmEstimated ||
    isBpmEstimatedForMatch(candidate) ||
    anchor.keyEstimated ||
    candidate.keyEstimated;

  if (estimated) {
    raw *= 0.9;
    confidence = 'low';
  } else if (anchorBpmOverride != null) {
    confidence = 'medium';
  }

  if (
    anchorBpmOverride == null &&
    (anchor.bpm == null || candidate.bpm == null) &&
    (!resolveTrackCamelot(anchor).code || !resolveTrackCamelot(candidate).code)
  ) {
    confidence = 'low';
    raw *= 0.85;
  }

  const anchorRhythm = classifyRhythmSource(anchorGenres, anchorArtist);
  const candRhythm = classifyRhythmSource(candidateGenres, candidateArtist);
  if (anchorRhythm === 'grid' && candRhythm === 'grid' && keyPart.delta >= 10) {
    raw += 5;
    factors.push({ label: 'Research pattern: grid harmonic', delta: 5 });
  }

  const probability = clampPct(raw);
  let tier = tierFromProbability(probability);

  const verifiedKey =
    resolveTrackCamelot(anchor).code &&
    resolveTrackCamelot(candidate).code &&
    !anchor.keyEstimated &&
    !candidate.keyEstimated;
  const verifiedBpm =
    anchorBpm != null &&
    candidate.bpm != null &&
    !isBpmEstimatedForMatch(anchor) &&
    !isBpmEstimatedForMatch(candidate);

  if (tier === 'strong' && !(verifiedKey && (verifiedBpm || anchorBpmOverride != null))) {
    tier = 'good';
  }

  if (
    tier === 'strong' &&
    probability < 75 &&
    !isGridRhythmSource(anchorGenres, anchorArtist)
  ) {
    tier = 'good';
  }

  factors.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { probability, tier, factors, confidence };
}

export function probabilityTierLabel(tier: MatchTier): string {
  if (tier === 'strong') return 'Strong';
  if (tier === 'good') return 'Good';
  return 'Stretch';
}

export function matchTierToCompatibilityTier(
  tier: MatchTier
): 'perfect' | 'smooth' | 'stretch' {
  if (tier === 'strong') return 'perfect';
  if (tier === 'good') return 'smooth';
  return 'stretch';
}