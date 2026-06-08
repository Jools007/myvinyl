export type DiscogsTrackRow = {
  title?: string;
  position?: string;
  duration?: string;
  type_?: string;
  type?: string;
  sub_tracks?: DiscogsTrackRow[];
};

/** Expand nested Discogs sub_tracks into a flat playable tracklist. */
export function flattenDiscogsTracklist(
  tracklist: DiscogsTrackRow[] | undefined
): DiscogsTrackRow[] {
  if (!tracklist?.length) return [];

  const out: DiscogsTrackRow[] = [];

  for (const row of tracklist) {
    const subs = (row.sub_tracks ?? []).filter((s) => s.title?.trim());
    if (subs.length > 0) {
      for (const sub of subs) {
        out.push({
          ...sub,
          position: sub.position?.trim() || row.position?.trim() || undefined,
          type_: sub.type_ ?? sub.type ?? 'track',
        });
      }
      continue;
    }
    out.push(row);
  }

  return out;
}