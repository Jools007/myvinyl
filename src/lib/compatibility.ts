import { camelotDistance, resolveTrackCamelot } from './camelot';
import { genreAffinityScore, isDowntempoLane } from './genreAffinity';
import { isMixPartnerCandidate, mixabilityAdjustment } from './mixability';
import {
  isGridRhythmSource,
  isRhythmMixPartner,
  rhythmCompatibilityScore,
} from './rhythmSource';
import {
  computeMatchProbability,
  matchTierToCompatibilityTier,
  type MatchProbabilityResult,
} from './matchProbability';
import { formatBpmDelta, formatBpmGap, formatBpmValue, roundBpm } from './formatMix';
import { playSelectionKey, type PlaySelection, type ResolvedPlaySelection } from './playSession';
import { isBpmEstimatedForMatch } from './tracks';
import type { Track, VinylRecord } from './types';

export type CompatibilityTier = 'perfect' | 'smooth' | 'stretch';

export type CompatibilityPick = {
  record: VinylRecord;
  track: Track;
  tier: CompatibilityTier;
  score: number;
  reason: string;
  bpmDelta: number | null;
  probability: number;
  match: MatchProbabilityResult;
};

export type TieredCompatibility = {
  perfect: CompatibilityPick[];
  smooth: CompatibilityPick[];
  stretch: CompatibilityPick[];
};

const TIER_ORDER: Record<CompatibilityTier, number> = {
  perfect: 0,
  smooth: 1,
  stretch: 2,
};

function bpmDelta(a?: number, b?: number): number | null {
  if (a == null || b == null) return null;
  return roundBpm(b - a);
}

function effectiveAnchorBpm(anchor: Track, override?: number): number | undefined {
  return override ?? anchor.bpm ?? undefined;
}

/** Hard window for live tap — partners must land inside ±(uncertainty + slack). */
function withinTapBpmWindow(
  anchorBpm: number,
  candidateBpm: number | undefined,
  uncertainty: number,
  slack = 7
): boolean {
  if (candidateBpm == null) return false;
  return Math.abs(anchorBpm - candidateBpm) <= uncertainty + slack;
}

function keyRelationship(
  anchorCode: string,
  candidateCode: string,
  keyEstimated?: boolean
): string {
  const code = keyEstimated ? `~${candidateCode}` : candidateCode;
  const dist = camelotDistance(anchorCode, candidateCode);
  if (dist === 0) return `Same key (${code})`;
  if (dist === 1) return `Relative key (${code})`;
  if (dist === 2) return `Adjacent on wheel (${code})`;
  if (dist === 4) return `Energy lift (${code})`;
  return `Key blend (${code})`;
}

export function classifyCompatibilityTier(
  anchor: Track,
  candidate: Track
): CompatibilityTier | null {
  const anchorKey = resolveTrackCamelot(anchor).code;
  const candKey = resolveTrackCamelot(candidate).code;
  if (!anchorKey || !candKey) return null;

  const dist = camelotDistance(anchorKey, candKey);
  if (dist === 0) return 'perfect';
  if (dist <= 2) return 'smooth';
  if (dist <= 4) return 'stretch';
  return null;
}

/** When the anchor has no key yet, fall back to BPM proximity so partners still surface. */
function classifyCompatibilityTierWithBpmFallback(
  anchor: Track,
  candidate: Track,
  anchorBpm?: number
): CompatibilityTier | null {
  const harmonic = classifyCompatibilityTier(anchor, candidate);
  if (harmonic) return harmonic;

  if (resolveTrackCamelot(anchor).code) return null;

  const aBpm = anchorBpm ?? anchor.bpm;
  const cBpm = candidate.bpm;
  if (aBpm == null || cBpm == null) return null;

  const abs = Math.abs(aBpm - cBpm);
  if (abs <= 3) return 'smooth';
  if (abs <= 8) return 'stretch';
  return null;
}

function scoreCandidate(
  anchor: Track,
  candidate: Track,
  tier: CompatibilityTier,
  anchorGenres: string[],
  candidateGenres: string[],
  anchorArtist?: string,
  candidateArtist?: string,
  anchorBpmOverride?: number
): number {
  const anchorKey = resolveTrackCamelot(anchor).code;
  const candKey = resolveTrackCamelot(candidate).code;
  let score = TIER_ORDER[tier] * -10;

  if (anchorKey && candKey) {
    score += 10 - camelotDistance(anchorKey, candKey);
  }

  const anchorBpm = effectiveAnchorBpm(anchor, anchorBpmOverride);
  const delta = bpmDelta(anchorBpm, candidate.bpm);
  if (delta != null) {
    const abs = Math.abs(delta);
    if (abs <= 2) score += 8;
    else if (abs <= 5) score += 5;
    else if (abs <= 8) score += 2;
    if (anchorBpm != null && candidate.bpm != null) {
      if (anchorBpm < 105 && candidate.bpm > anchorBpm + 12) score -= 8;
    }
  }

  const vibeOverlap = (anchor.vibeTags ?? []).filter((t) =>
    (candidate.vibeTags ?? []).some((v) => v.toLowerCase() === t.toLowerCase())
  ).length;
  score += vibeOverlap * 3;
  score += genreAffinityScore(anchorGenres, candidateGenres) * 0.5;

  if (isDowntempoLane(anchorGenres) && !isDowntempoLane(candidateGenres)) {
    score -= 6;
  }

  if (
    (anchorBpmOverride == null && isBpmEstimatedForMatch(anchor)) ||
    isBpmEstimatedForMatch(candidate)
  ) {
    score *= 0.9;
  }
  if (anchor.keyEstimated || candidate.keyEstimated) score *= 0.85;

  const mixAdj = mixabilityAdjustment(candidate, candidateGenres, anchor);
  if (mixAdj <= -999) return -999;
  score += mixAdj;

  const rhythmAdj = rhythmCompatibilityScore(
    anchorGenres,
    candidateGenres,
    anchorArtist,
    candidateArtist
  );
  if (rhythmAdj <= -999) return -999;
  score += rhythmAdj;

  if (
    tier === 'perfect' &&
    ((anchorBpmOverride == null && isBpmEstimatedForMatch(anchor)) ||
      isBpmEstimatedForMatch(candidate) ||
      anchor.keyEstimated ||
      candidate.keyEstimated) &&
    mixAdj < 5
  ) {
    score -= 12;
  }

  return score;
}

function buildPickReason(
  anchor: Track,
  candidate: Track,
  tier: CompatibilityTier,
  anchorGenres: string[],
  candidateGenres: string[],
  anchorArtist?: string,
  candidateArtist?: string,
  anchorBpmOverride?: number
): string {
  const anchorKeyMeta = resolveTrackCamelot(anchor);
  const candKeyMeta = resolveTrackCamelot(candidate);
  const anchorKey = anchorKeyMeta.code;
  const candKey = candKeyMeta.code;
  const parts: string[] = [];

  if (anchorBpmOverride != null) {
    parts.push(`Matched to tap ${formatBpmValue(anchorBpmOverride)}`);
  }

  if (anchorKey && candKey) {
    const keyEstimated =
      anchor.keyEstimated ||
      candKeyMeta.estimated ||
      anchorKeyMeta.estimated;
    parts.push(keyRelationship(anchorKey, candKey, keyEstimated));
  }

  const anchorBpm = effectiveAnchorBpm(anchor, anchorBpmOverride);
  const delta = bpmDelta(anchorBpm, candidate.bpm);
  const bpmEstimated =
    (anchorBpmOverride == null && isBpmEstimatedForMatch(anchor)) ||
    isBpmEstimatedForMatch(candidate);

  if (delta != null && candidate.bpm != null) {
    const abs = Math.abs(delta);
    const bpmPrefix = bpmEstimated ? '~' : '';
    if (abs <= 2) {
      parts.push(`${bpmPrefix}${formatBpmValue(candidate.bpm)} BPM`);
    } else if (abs <= 8) {
      parts.push(`${formatBpmDelta(delta)} BPM`);
    } else if (tier === 'stretch') {
      parts.push(`${formatBpmGap(delta)} BPM apart — short blend`);
    } else {
      parts.push(`${formatBpmDelta(delta)} BPM`);
    }
  } else if (candidate.bpm != null) {
    parts.push(`${bpmEstimated ? '~' : ''}${formatBpmValue(candidate.bpm)} BPM`);
  }

  if (
    parts.length < 2 &&
    isGridRhythmSource(anchorGenres, anchorArtist) &&
    isGridRhythmSource(candidateGenres, candidateArtist)
  ) {
    parts.push('Grid tempo');
  }

  if (tier === 'stretch' && parts.length === 0) {
    parts.push('Wider mix — use your ears');
  }

  return parts.slice(0, 2).join(' · ') || 'Compatible energy';
}

function coldStartPicks(
  collection: VinylRecord[],
  excludeKeys: Set<string>,
  perTier: number
): TieredCompatibility {
  const picks: CompatibilityPick[] = [];

  for (const record of collection) {
    for (const track of record.tracks) {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });
      if (excludeKeys.has(key)) continue;
      if (!isMixPartnerCandidate(track, record.genres)) continue;
      if (track.bpm == null && !resolveTrackCamelot(track).code) continue;

      const code = resolveTrackCamelot(track).code;
      const reason = track.bpm != null && code
        ? `Ready to mix · ${track.bpm} BPM · ${code}`
        : track.bpm != null
          ? `BPM ${track.bpm}`
          : code
            ? `Key ${code}`
            : 'From your crate';

      const coldScore =
        (track.bpm != null ? 2 : 0) + (code ? 2 : 0) + (track.isPrimary ? 1 : 0);
      picks.push({
        record,
        track,
        tier: 'smooth',
        score: coldScore,
        reason,
        bpmDelta: null,
        probability: 50 + coldScore * 5,
        match: {
          probability: 50 + coldScore * 5,
          tier: 'good',
          factors: [],
          confidence: 'low',
        },
      });
    }
  }

  picks.sort((a, b) => b.score - a.score);
  const slice = picks.slice(0, perTier * 3);
  return {
    perfect: [],
    smooth: slice,
    stretch: [],
  };
}

export type CompatibilityOptions = {
  /** Live tap BPM from mixer — refines anchor tempo for matching */
  anchorBpmOverride?: number;
  bpmUncertainty?: number;
};

export function recommendTieredCompatibility(
  collection: VinylRecord[],
  anchor: ResolvedPlaySelection | null,
  exclude: PlaySelection[] = [],
  perTier = 5,
  options: CompatibilityOptions = {}
): TieredCompatibility {
  const excludeKeys = new Set(exclude.map(playSelectionKey));
  const empty: TieredCompatibility = { perfect: [], smooth: [], stretch: [] };

  if (!anchor) {
    return coldStartPicks(collection, excludeKeys, perTier);
  }

  const anchorTrack = anchor.track;
  const candidates: CompatibilityPick[] = [];

  for (const record of collection) {
    let bestPick: CompatibilityPick | null = null;

    for (const track of record.tracks) {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });
      if (excludeKeys.has(key)) continue;
      if (!isMixPartnerCandidate(track, record.genres)) continue;
      if (
        !isRhythmMixPartner(
          anchor.record.genres,
          record.genres,
          anchor.record.artist,
          record.artist
        )
      ) {
        continue;
      }

      const anchorBpm = effectiveAnchorBpm(anchorTrack, options.anchorBpmOverride);
      const tapUncertainty = options.bpmUncertainty ?? 3;

      if (options.anchorBpmOverride != null) {
        if (anchorBpm == null || !withinTapBpmWindow(anchorBpm, track.bpm, tapUncertainty)) {
          continue;
        }
      }

      const harmonicTier = classifyCompatibilityTierWithBpmFallback(
        anchorTrack,
        track,
        anchorBpm
      );
      if (!harmonicTier) continue;

      const match = computeMatchProbability({
        anchor: anchorTrack,
        candidate: track,
        anchorGenres: anchor.record.genres,
        candidateGenres: record.genres,
        anchorArtist: anchor.record.artist,
        candidateArtist: record.artist,
        anchorBpmOverride: options.anchorBpmOverride,
        bpmUncertainty: options.bpmUncertainty ?? 3,
      });

      if (match.probability < 28) continue;

      const tier = matchTierToCompatibilityTier(match.tier);

      const score = scoreCandidate(
        anchorTrack,
        track,
        tier,
        anchor.record.genres,
        record.genres,
        anchor.record.artist,
        record.artist,
        options.anchorBpmOverride
      );
      if (score <= -999) continue;

      const reason = buildPickReason(
        anchorTrack,
        track,
        tier,
        anchor.record.genres,
        record.genres,
        anchor.record.artist,
        record.artist,
        options.anchorBpmOverride
      );

      const pick: CompatibilityPick = {
        record,
        track,
        tier,
        score: match.probability,
        reason,
        bpmDelta: bpmDelta(
          options.anchorBpmOverride ?? anchorTrack.bpm,
          track.bpm
        ),
        probability: match.probability,
        match,
      };

      if (!bestPick) {
        bestPick = pick;
        continue;
      }

      const tierDiff = TIER_ORDER[pick.tier] - TIER_ORDER[bestPick.tier];
      if (
        tierDiff < 0 ||
        (tierDiff === 0 && pick.probability > bestPick.probability)
      ) {
        bestPick = pick;
      }
    }

    if (bestPick) candidates.push(bestPick);
  }

  const tapBpm = options.anchorBpmOverride;
  candidates.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;
    if (tapBpm != null) {
      const aGap = Math.abs(a.bpmDelta ?? 99);
      const bGap = Math.abs(b.bpmDelta ?? 99);
      if (aGap !== bGap) return aGap - bGap;
    }
    return b.probability - a.probability;
  });

  for (const pick of candidates) {
    const bucket = empty[pick.tier];
    if (bucket.length >= perTier) continue;
    bucket.push(pick);
  }

  return empty;
}

export const TIER_LABELS: Record<CompatibilityTier, string> = {
  perfect: 'Strong match',
  smooth: 'Good blend',
  stretch: 'Stretch mix',
};

export const TIER_HINTS: Record<CompatibilityTier, string> = {
  perfect: 'High probability — verified key/BPM or tight harmonic lock',
  smooth: 'Solid partners — relative or ±1 on the wheel',
  stretch: 'Wider moves — shorter blends, use your ears',
};