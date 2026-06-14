import type { Track } from './types';

export interface IndexedTrack {
  track: Track;
  index: number;
}

export interface ReleaseTrackGroup {
  id: string;
  label: string;
  tracks: IndexedTrack[];
  /** Show a vinyl side header above this group */
  showHeader: boolean;
}

/** Leading letter run before track index (A1 → A, B2 → B, AA3 → AA). */
export function parseVinylSide(position?: string): string | null {
  const raw = position?.trim();
  if (!raw) return null;

  const indexed = raw.match(/^([A-Za-z]+)\d/);
  if (indexed) return indexed[1].toUpperCase();

  if (/^[A-Za-z]{1,2}$/.test(raw)) return raw.toUpperCase();

  return null;
}

export function vinylSideLabel(sideKey: string): string {
  return `Side ${sideKey}`;
}

export function groupReleaseTracks(tracks: Track[]): ReleaseTrackGroup[] {
  if (tracks.length === 0) return [];

  const entries = tracks.map((track, index) => ({
    track,
    index,
    side: parseVinylSide(track.position),
  }));

  const sideKeys = entries.map((e) => e.side).filter((s): s is string => Boolean(s));
  const uniqueSides = [...new Set(sideKeys)];
  const multipleSides = uniqueSides.length > 1;

  if (!multipleSides) {
    const loneSide = uniqueSides[0];
    return [
      {
        id: loneSide ?? 'tracks',
        label: loneSide ? vinylSideLabel(loneSide) : 'Tracks',
        tracks: entries.map(({ track, index }) => ({ track, index })),
        showHeader: Boolean(loneSide) && tracks.length > 1,
      },
    ];
  }

  const order: string[] = [];
  const bySide = new Map<string, IndexedTrack[]>();

  for (const { track, index, side } of entries) {
    const key = side ?? 'other';
    if (!bySide.has(key)) {
      bySide.set(key, []);
      order.push(key);
    }
    bySide.get(key)!.push({ track, index });
  }

  return order.map((key) => ({
    id: key,
    label: key === 'other' ? 'More tracks' : vinylSideLabel(key),
    tracks: bySide.get(key) ?? [],
    showHeader: true,
  }));
}

export function otherTracksOnRelease(
  tracks: Track[],
  activeTrackId: string | null | undefined
): IndexedTrack[] {
  return tracks
    .map((track, index) => ({ track, index }))
    .filter(({ track }) => track.id !== activeTrackId);
}

export function activeTrackSideLabel(track: Track | null | undefined): string | null {
  if (!track) return null;
  const side = parseVinylSide(track.position);
  return side ? vinylSideLabel(side) : null;
}