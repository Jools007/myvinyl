import { camelotDistance, isCompatibleKey, resolveTrackCamelot } from './camelot';
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

export function scoreNextPlay(
  last: ResolvedPlaySelection,
  candidate: VinylRecord,
  candidateTrack: Track
): number {
  if (last.record.id === candidate.id && last.track.id === candidateTrack.id) return -1;
  const lastTrack = last.track;
  let score = 0;
  const keyDist = camelotDistance(lastTrack?.camelotKey, candidateTrack?.camelotKey);
  if (keyDist === 0) score += 40;
  else if (keyDist === 1) score += 35;
  else if (keyDist === 2) score += 25;
  else if (keyDist <= 4) score += 10;

  const bpm = bpmDistance(lastTrack?.bpm, candidateTrack?.bpm);
  if (bpm <= 2) score += 25;
  else if (bpm <= 5) score += 18;
  else if (bpm <= 8) score += 10;
  else if (bpm <= 12) score += 4;

  score += vibeOverlapTracks(lastTrack, candidateTrack) * 12;
  score += genreOverlap(last.record, candidate) * 8;

  if (!candidate.lastPlayedAt) score += 6;
  else {
    const days = (Date.now() - new Date(candidate.lastPlayedAt).getTime()) / 86400000;
    if (days > 14) score += 5;
    if (days > 30) score += 4;
  }

  return score;
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
    const track = getPrimaryTrack(record);
    if (!track) continue;
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
    const track = getPrimaryTrack(record);
    if (!track) continue;
    const key = playSelectionKey({ recordId: record.id, trackId: track.id });
    if (excludeKeys.has(key)) continue;

    const score = scoreNextPlay(anchor, record, track);
    if (score <= 0) continue;
    candidates.push({
      record,
      track,
      score,
      reasons: buildReasons(anchor, record, track),
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
  if (
    isCompatibleKey(lastTrack?.camelotKey, nextTrack?.camelotKey) &&
    lastTrack?.camelotKey &&
    nextTrack?.camelotKey
  ) {
    reasons.push(`Harmonic match (${nextTrack.camelotKey})`);
  }
  if (
    lastTrack?.bpm != null &&
    nextTrack?.bpm != null &&
    Math.abs(lastTrack.bpm - nextTrack.bpm) <= 5
  ) {
    reasons.push(`BPM flow (${nextTrack.bpm})`);
  }
  const vibes = (lastTrack?.vibeTags ?? []).filter((t) =>
    (nextTrack?.vibeTags ?? []).some((v) => v.toLowerCase() === t.toLowerCase())
  );
  if (vibes.length) reasons.push(`Shared vibe: ${vibes[0]}`);
  const genres = last.record.genres.filter((g) =>
    next.genres.some((x) => x.toLowerCase() === g.toLowerCase())
  );
  if (genres.length) reasons.push(genres[0]);
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