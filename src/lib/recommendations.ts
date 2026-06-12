import { camelotDistance, isCompatibleKey, resolveTrackCamelot } from './camelot';
import { genreAffinityScore, isDowntempoLane } from './genreAffinity';
import { mixabilityAdjustment, isMixPartnerCandidate } from './mixability';
import {
  isGridRhythmSource,
  isRhythmMixPartner,
  rhythmCompatibilityScore,
} from './rhythmSource';
import { playSelectionKey, type PlaySelection, type ResolvedPlaySelection } from './playSession';
import { getPrimaryTrack } from './tracks';
import type { Track, VinylRecord } from './types';

function bpmDistance(a?: number, b?: number): number {
  if (a == null || b == null) return 15;
  return Math.abs(a - b);
}

function vibeOverlapTracks(a: Track, b: Track): number {
  const setB = new Set((b.vibeTags ?? []).map((t) => t.toLowerCase()));
  return (a.vibeTags ?? []).filter((t) => setB.has(t.toLowerCase())).length;
}

function genreOverlap(a: VinylRecord, b: VinylRecord): number {
  const setB = new Set(b.genres.map((g) => g.toLowerCase()));
  return a.genres.filter((g) => setB.has(g.toLowerCase())).length;
}

function estimatedConfidencePenalty(anchor: Track, candidate: Track): number {
  let factor = 1;
  if (anchor.bpmEstimated || candidate.bpmEstimated) factor *= 0.88;
  if (anchor.keyEstimated || candidate.keyEstimated) factor *= 0.78;
  return factor;
}

export function scoreNextPlay(
  last: ResolvedPlaySelection,
  candidate: VinylRecord,
  candidateTrack: Track
): number {
  if (last.record.id === candidate.id && last.track.id === candidateTrack.id) return -1;

  const lastTrack = last.track;
  const anchorKey = resolveTrackCamelot(lastTrack).code;
  const candidateKey = resolveTrackCamelot(candidateTrack).code;

  let score = 0;
  const keyDist =
    anchorKey && candidateKey ? camelotDistance(anchorKey, candidateKey) : 99;

  if (keyDist === 0) score += 40;
  else if (keyDist === 1) score += 35;
  else if (keyDist === 2) score += 25;
  else if (keyDist <= 4) score += 10;
  else if (keyDist === 99) score += 2;

  const bpm = bpmDistance(lastTrack?.bpm, candidateTrack?.bpm);
  if (bpm <= 2) score += 25;
  else if (bpm <= 5) score += 18;
  else if (bpm <= 8) score += 10;
  else if (bpm <= 12) score += 4;

  const anchorBpm = lastTrack?.bpm;
  const candBpm = candidateTrack?.bpm;
  if (anchorBpm != null && candBpm != null) {
    if (anchorBpm < 105 && candBpm > anchorBpm + 12) score -= 22;
    if (anchorBpm >= 118 && candBpm < anchorBpm - 15) score -= 12;
  }

  score += vibeOverlapTracks(lastTrack, candidateTrack) * 12;
  score += genreOverlap(last.record, candidate) * 6;
  score += genreAffinityScore(last.record.genres, candidate.genres);

  const rhythmScore = rhythmCompatibilityScore(
    last.record.genres,
    candidate.genres,
    last.record.artist,
    candidate.artist
  );
  if (rhythmScore <= -999) return -1;
  score += rhythmScore;

  if (isDowntempoLane(last.record.genres) && !isDowntempoLane(candidate.genres)) {
    score -= 10;
  }

  if (!candidate.lastPlayedAt) score += 4;
  else {
    const days = (Date.now() - new Date(candidate.lastPlayedAt).getTime()) / 86400000;
    if (days > 14) score += 3;
    if (days > 30) score += 2;
  }

  if (keyDist > 2) {
    if (!candidate.lastPlayedAt) score += 2;
  }

  score *= estimatedConfidencePenalty(lastTrack, candidateTrack);

  const mixAdj = mixabilityAdjustment(candidateTrack, candidate.genres, lastTrack);
  if (mixAdj <= -999) return -1;
  score += mixAdj;

  const anchorMixable = isMixPartnerCandidate(lastTrack, last.record.genres);
  const harmonicOnly =
    keyDist <= 2 &&
    bpm <= 5 &&
    vibeOverlapTracks(lastTrack, candidateTrack) === 0 &&
    genreAffinityScore(last.record.genres, candidate.genres) <= 0;
  if (
    anchorMixable &&
    harmonicOnly &&
    (lastTrack.bpmEstimated ||
      candidateTrack.bpmEstimated ||
      lastTrack.keyEstimated ||
      candidateTrack.keyEstimated)
  ) {
    score -= 15;
  }

  if (score < 12 && keyDist > 2 && bpm > 12) return -1;
  if (anchorMixable && score < 18) return -1;

  return Math.round(score);
}

export type UpNextSuggestion = {
  record: VinylRecord;
  track: Track;
  score: number;
  reasons: string[];
};

function coldStartReasons(record: VinylRecord, track: Track): string[] {
  const key = resolveTrackCamelot(track).code;
  if (track.bpm != null && key) return [`Ready to mix · ${track.bpm} BPM · ${key}`];
  if (track.bpm != null) return [`BPM ${track.bpm}`];
  if (key) return [`Key ${key}`];
  if (track.vibeTags?.length) return [`Vibe: ${track.vibeTags[0]}`];
  if (record.genres[0]) return [record.genres[0]];
  return ['From your crate'];
}

function coldStartScore(record: VinylRecord, track: Track): number {
  let score = 0;
  const key = resolveTrackCamelot(track).code;
  if (track.bpm != null) score += 12;
  if (key) score += 12;
  if (track.vibeTags?.length) score += 6;
  if (record.genres.length) score += 2;
  const addedMs = Date.parse(record.addedAt);
  if (!Number.isNaN(addedMs)) {
    const days = (Date.now() - addedMs) / 86400000;
    if (days <= 7) score += 8;
    else if (days <= 30) score += 4;
  }
  return score;
}

/** Suggestions when nothing is playing and no play history exists yet. */
function recommendColdStart(
  collection: VinylRecord[],
  limit: number,
  excludeKeys: Set<string>
): UpNextSuggestion[] {
  const candidates: UpNextSuggestion[] = [];

  for (const record of [...collection].sort((a, b) =>
    (b.addedAt ?? '').localeCompare(a.addedAt ?? '')
  )) {
    const track =
      record.tracks.find((t) => isMixPartnerCandidate(t, record.genres) && t.isPrimary) ??
      record.tracks.find((t) => isMixPartnerCandidate(t, record.genres)) ??
      getPrimaryTrack(record);
    if (!track || !isMixPartnerCandidate(track, record.genres)) continue;
    const key = playSelectionKey({ recordId: record.id, trackId: track.id });
    if (excludeKeys.has(key)) continue;

    candidates.push({
      record,
      track,
      score: coldStartScore(record, track),
      reasons: coldStartReasons(record, track),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

function bestTrackForRecord(
  anchor: ResolvedPlaySelection,
  record: VinylRecord
): { track: Track; score: number } | null {
  let best: { track: Track; score: number } | null = null;
  const rhythmOk = (r: VinylRecord) =>
    isRhythmMixPartner(anchor.record.genres, r.genres, anchor.record.artist, r.artist);
  const mixable = record.tracks.filter(
    (t) => isMixPartnerCandidate(t, record.genres) && rhythmOk(record)
  );
  const pool =
    mixable.length > 0
      ? mixable
      : rhythmOk(record)
        ? record.tracks.filter((t) => t.isPrimary)
        : [];

  for (const track of pool) {
    const score = scoreNextPlay(anchor, record, track);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { track, score };
  }
  return best;
}

export function recommendNext(
  collection: VinylRecord[],
  anchor: ResolvedPlaySelection | null,
  limit = 6,
  exclude: PlaySelection[] = []
): UpNextSuggestion[] {
  const excludeKeys = new Set(exclude.map(playSelectionKey));

  if (!anchor) {
    const recent = getLastPlayed(collection);
    if (recent) {
      const recentTrack = getPrimaryTrack(recent);
      if (recentTrack) {
        return recommendNext(
          collection,
          { record: recent, track: recentTrack },
          limit,
          exclude
        );
      }
    }
    return recommendColdStart(collection, limit, excludeKeys);
  }

  const candidates: UpNextSuggestion[] = [];
  for (const record of collection) {
    const best = bestTrackForRecord(anchor, record);
    if (!best) continue;
    const key = playSelectionKey({ recordId: record.id, trackId: best.track.id });
    if (excludeKeys.has(key)) continue;

    candidates.push({
      record,
      track: best.track,
      score: best.score,
      reasons: buildReasons(anchor, record, best.track),
    });
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
}

function buildReasons(
  last: ResolvedPlaySelection,
  next: VinylRecord,
  nextTrack: Track
): string[] {
  const lastTrack = last.track;
  const reasons: string[] = [];
  const lastKey = resolveTrackCamelot(lastTrack).code;
  const nextKey = resolveTrackCamelot(nextTrack).code;

  if (isCompatibleKey(lastKey, nextKey) && lastKey && nextKey) {
    const est =
      lastTrack.keyEstimated || nextTrack.keyEstimated ? ' (~estimated)' : '';
    reasons.push(`Harmonic match (${nextKey})${est}`);
  }
  if (
    lastTrack?.bpm != null &&
    nextTrack?.bpm != null &&
    Math.abs(lastTrack.bpm - nextTrack.bpm) <= 5
  ) {
    const est = lastTrack.bpmEstimated || nextTrack.bpmEstimated ? ' (~estimated)' : '';
    reasons.push(`BPM flow (${nextTrack.bpm})${est}`);
  }
  const vibes = (lastTrack?.vibeTags ?? []).filter((t) =>
    (nextTrack?.vibeTags ?? []).some((v) => v.toLowerCase() === t.toLowerCase())
  );
  if (vibes.length) reasons.push(`Shared vibe: ${vibes[0]}`);
  const genres = last.record.genres.filter((g) =>
    next.genres.some((x) => x.toLowerCase() === g.toLowerCase())
  );
  if (genres.length) reasons.push(genres[0]);
  if (
    isGridRhythmSource(last.record.genres, last.record.artist) &&
    isGridRhythmSource(next.genres, next.artist)
  ) {
    reasons.push('Grid tempo — beatmatch safe');
  }
  if (!reasons.length) reasons.push('Complementary energy');
  return reasons.slice(0, 3);
}

export function getLastPlayed(collection: VinylRecord[]): VinylRecord | null {
  const played = collection.filter((r) => r.lastPlayedAt);
  if (!played.length) return null;
  return played.sort((a, b) =>
    (b.lastPlayedAt ?? '').localeCompare(a.lastPlayedAt ?? '')
  )[0];
}