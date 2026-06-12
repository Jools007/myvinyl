import { resolveTrackCamelot } from './camelot';
import { isMixPartnerCandidate, classifyTrackMixability } from './mixability';
import { playSelectionKey, type PlaySelection } from './playSession';
import type { Track, VinylRecord } from './types';

export type PracticePick = {
  record: VinylRecord;
  track: Track;
  score: number;
};

function trackPracticeScore(track: Track, record: VinylRecord): number {
  if (!isMixPartnerCandidate(track, record.genres)) return -1;

  const mix = classifyTrackMixability(track, record.genres).score;
  let score = mix;

  if (track.bpm != null && !track.bpmEstimated) score += 12;
  if (resolveTrackCamelot(track).code && !track.keyEstimated) score += 10;
  if (track.isPrimary) score += 6;
  if ((track.vibeTags?.length ?? 0) > 0) score += 3;

  return score;
}

/** Pick a random enriched, mixable track from the crate for practice blends. */
export function pickRandomPracticeAnchor(
  collection: VinylRecord[],
  exclude: PlaySelection[] = []
): PracticePick | null {
  const excludeKeys = new Set(exclude.map(playSelectionKey));
  const pool: PracticePick[] = [];

  for (const record of collection) {
    for (const track of record.tracks) {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });
      if (excludeKeys.has(key)) continue;

      const score = trackPracticeScore(track, record);
      if (score < 50) continue;
      if (track.bpm == null && !resolveTrackCamelot(track).code) continue;

      pool.push({ record, track, score });
    }
  }

  if (pool.length === 0) return null;

  const maxScore = Math.max(...pool.map((p) => p.score));
  const weighted = pool.filter((p) => p.score >= maxScore - 15);
  const idx = Math.floor(Math.random() * weighted.length);
  return weighted[idx] ?? null;
}