import { withTimeout } from '../enrich-timeout';

type LbTag = { tag: string; count: number };

/** Community tags for a MusicBrainz release-group MBID (free, no auth). */
export async function fetchListenBrainzReleaseGroupTags(
  releaseGroupMbid: string
): Promise<LbTag[]> {
  const url = `https://api.listenbrainz.org/1/metadata/release_group/?release_group_mbids=${encodeURIComponent(releaseGroupMbid)}&inc=tag`;
  const res = await withTimeout(fetch(url), 5000, null);
  if (!res?.ok) return [];

  const data = (await res.json()) as Record<
    string,
    { tag?: { release_group?: { tag: string; count: number }[] } }
  >;
  const bucket = data[releaseGroupMbid]?.tag?.release_group ?? [];
  return bucket
    .map((t) => ({ tag: t.tag.trim().toLowerCase(), count: t.count }))
    .filter((t) => t.tag.length > 0)
    .sort((a, b) => b.count - a.count);
}