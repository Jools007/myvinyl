import { camelotDistance, resolveTrackCamelot } from './camelot';
import { genreAffinityScore, isDowntempoLane } from './genreAffinity';
import {
  isMixPartnerCandidate,
  mixabilityAdjustment,
  mixabilityLabel,
} from './mixability';
import { playSelectionKey, type PlaySelection, type ResolvedPlaySelection } from './playSession';
import type { Track, VinylRecord } from './types';

export type CompatibilityTier = 'perfect' | 'smooth' | 'stretch';

export type CompatibilityPick = {
  record: VinylRecord;
  track: Track;
  tier: CompatibilityTier;
  score: number;
  reason: string;
  bpmDelta: number | null;
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
  return b - a;
}

function keyRelationship(anchorCode: string, candidateCode: string): string {
  const dist = camelotDistance(anchorCode, candidateCode);
  if (dist === 0) return `Same key · ${candidateCode}`;
  if (dist === 1) return `Relative major/minor · ${candidateCode}`;
  if (dist === 2) return `Adjacent on wheel · ${candidateCode}`;
  if (dist === 4) return `Energy lift · ${candidateCode}`;
  return `Key blend · ${candidateCode}`;
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

function scoreCandidate(
  anchor: Track,
  candidate: Track,
  tier: CompatibilityTier,
  anchorGenres: string[],
  candidateGenres: string[]
): number {
  const anchorKey = resolveTrackCamelot(anchor).code;
  const candKey = resolveTrackCamelot(candidate).code;
  let score = TIER_ORDER[tier] * -10;

  if (anchorKey && candKey) {
    score += 10 - camelotDistance(anchorKey, candKey);
  }

  const delta = bpmDelta(anchor.bpm, candidate.bpm);
  if (delta != null) {
    const abs = Math.abs(delta);
    if (abs <= 2) score += 8;
    else if (abs <= 5) score += 5;
    else if (abs <= 8) score += 2;
    if (anchor.bpm != null && candidate.bpm != null) {
      if (anchor.bpm < 105 && candidate.bpm > anchor.bpm + 12) score -= 8;
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

  if (anchor.bpmEstimated || candidate.bpmEstimated) score *= 0.9;
  if (anchor.keyEstimated || candidate.keyEstimated) score *= 0.85;

  const mixAdj = mixabilityAdjustment(candidate, candidateGenres, anchor);
  if (mixAdj <= -999) return -999;
  score += mixAdj;

  if (
    tier === 'perfect' &&
    (anchor.bpmEstimated || candidate.bpmEstimated || anchor.keyEstimated || candidate.keyEstimated) &&
    mixAdj < 5
  ) {
    score -= 12;
  }

  return score;
}

function buildPickReason(anchor: Track, candidate: Track, tier: CompatibilityTier): string {
  const anchorKey = resolveTrackCamelot(anchor).code;
  const candKey = resolveTrackCamelot(candidate).code;
  const parts: string[] = [];

  if (anchorKey && candKey) {
    parts.push(keyRelationship(anchorKey, candKey));
  }

  const delta = bpmDelta(anchor.bpm, candidate.bpm);
  if (delta != null) {
    if (Math.abs(delta) <= 2) parts.push(`BPM ${candidate.bpm}`);
    else if (delta > 0) parts.push(`+${delta} BPM`);
    else parts.push(`${delta} BPM`);
  }

  if (tier === 'stretch' && parts.length === 0) {
    parts.push('Wider mix — use your ears');
  }

  const mixNote = mixabilityLabel(candidate);
  if (mixNote) parts.push(mixNote);

  return parts.join(' · ') || 'Compatible energy';
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

      picks.push({
        record,
        track,
        tier: 'smooth',
        score: (track.bpm != null ? 2 : 0) + (code ? 2 : 0),
        reason,
        bpmDelta: null,
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

export function recommendTieredCompatibility(
  collection: VinylRecord[],
  anchor: ResolvedPlaySelection | null,
  exclude: PlaySelection[] = [],
  perTier = 5
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

      const tier = classifyCompatibilityTier(anchorTrack, track);
      if (!tier) continue;

      const score = scoreCandidate(anchorTrack, track, tier, anchor.record.genres, record.genres);
      if (score <= -999) continue;

      const pick: CompatibilityPick = {
        record,
        track,
        tier,
        score,
        reason: buildPickReason(anchorTrack, track, tier),
        bpmDelta: bpmDelta(anchorTrack.bpm, track.bpm),
      };

      if (!bestPick) {
        bestPick = pick;
        continue;
      }

      const tierDiff = TIER_ORDER[pick.tier] - TIER_ORDER[bestPick.tier];
      if (tierDiff < 0 || (tierDiff === 0 && pick.score > bestPick.score)) {
        bestPick = pick;
      }
    }

    if (bestPick) candidates.push(bestPick);
  }

  candidates.sort((a, b) => {
    const tierDiff = TIER_ORDER[a.tier] - TIER_ORDER[b.tier];
    if (tierDiff !== 0) return tierDiff;
    return b.score - a.score;
  });

  for (const pick of candidates) {
    const bucket = empty[pick.tier];
    if (bucket.length >= perTier) continue;
    bucket.push(pick);
  }

  return empty;
}

export const TIER_LABELS: Record<CompatibilityTier, string> = {
  perfect: 'Perfect match',
  smooth: 'Smooth blend',
  stretch: 'Stretch mix',
};

export const TIER_HINTS: Record<CompatibilityTier, string> = {
  perfect: 'Same Camelot code — safest harmonic match',
  smooth: 'Relative or ±1 on the wheel',
  stretch: 'Energy lift — shorter blends',
};