import { playSelectionKey, type PlaySelection } from './playSession';
import type { Track, VinylRecord } from './types';

export type RecentlyAddedPick = {
  record: VinylRecord;
  track: Track;
  addedAt: string;
};

const DEFAULT_LIMIT = 16;

/** Human-readable label for when a record entered the crate. */
export function formatAddedAtLabel(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return 'Recently added';

  const days = Math.floor((Date.now() - ms) / 86_400_000);
  if (days <= 0) return 'Added today';
  if (days === 1) return 'Added yesterday';
  if (days < 7) return `Added ${days} days ago`;
  if (days < 30) return `Added ${Math.floor(days / 7)} wk ago`;

  return `Added ${new Date(ms).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })}`;
}

function trackForRecentPlay(record: VinylRecord): Track | null {
  if (!record.tracks.length) return null;
  return (
    record.tracks.find((t) => t.isPrimary) ??
    record.tracks.find((t) => t.bpm != null) ??
    record.tracks[0] ??
    null
  );
}

/** Newest releases in the crate, one lead cut each, for quick play from the deck. */
export function listRecentlyAdded(
  collection: VinylRecord[],
  exclude: PlaySelection[] = [],
  limit = DEFAULT_LIMIT
): RecentlyAddedPick[] {
  const excludeKeys = new Set(exclude.map(playSelectionKey));
  const picks: RecentlyAddedPick[] = [];

  const sorted = [...collection].sort((a, b) =>
    (b.addedAt ?? '').localeCompare(a.addedAt ?? '')
  );

  for (const record of sorted) {
    if (picks.length >= limit) break;

    const track = trackForRecentPlay(record);
    if (!track) continue;

    const key = playSelectionKey({ recordId: record.id, trackId: track.id });
    if (excludeKeys.has(key)) continue;

    picks.push({
      record,
      track,
      addedAt: record.addedAt,
    });
  }

  return picks;
}