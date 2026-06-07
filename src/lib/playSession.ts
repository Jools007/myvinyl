import { getPrimaryTrack } from './tracks';
import type { Track, VinylRecord } from './types';

/** A specific track on a release in the DJ play flow */
export interface PlaySelection {
  recordId: string;
  trackId: string;
}

export interface ResolvedPlaySelection {
  record: VinylRecord;
  track: Track;
}

export function playSelectionKey(ref: PlaySelection): string {
  return `${ref.recordId}:${ref.trackId}`;
}

export function isSamePlaySelection(a: PlaySelection, b: PlaySelection): boolean {
  return a.recordId === b.recordId && a.trackId === b.trackId;
}

export function resolvePlaySelection(
  collection: VinylRecord[],
  ref: PlaySelection | null | undefined
): ResolvedPlaySelection | null {
  if (!ref) return null;
  const record = collection.find((r) => r.id === ref.recordId);
  if (!record) return null;
  const track =
    record.tracks.find((t) => t.id === ref.trackId) ?? getPrimaryTrack(record);
  if (!track) return null;
  return { record, track };
}

export function resolvePlayQueue(
  collection: VinylRecord[],
  queue: PlaySelection[]
): ResolvedPlaySelection[] {
  const out: ResolvedPlaySelection[] = [];
  const seen = new Set<string>();
  for (const ref of queue) {
    const key = playSelectionKey(ref);
    if (seen.has(key)) continue;
    const resolved = resolvePlaySelection(collection, ref);
    if (!resolved) continue;
    seen.add(key);
    out.push(resolved);
  }
  return out;
}

export function trackPositionLabel(track: Track, index: number): string {
  if (track.position?.trim()) return track.position.trim();
  return String(index + 1).padStart(2, '0');
}