import { withTimeout } from '../enrich-timeout';

const USER_AGENT =
  'MyVinyl/1.0 (https://myvinyl-nine.vercel.app; album-character; contact@myvinyl.local)';

let lastRequestAt = 0;

async function mbFetch(path: string): Promise<unknown | null> {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();

  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

type MbReleaseGroupHit = {
  id?: string;
  title?: string;
  score?: number;
  'artist-credit'?: { name?: string; artist?: { name?: string } }[];
  tags?: { name: string; count: number }[];
  genres?: { name: string; count: number }[];
};

export type MusicBrainzAlbumMatch = {
  releaseGroupMbid: string;
  tags: string[];
};

function tagNamesFromGroup(group: MbReleaseGroupHit): string[] {
  const fromTags = (group.tags ?? []).map((t) => t.name.trim()).filter(Boolean);
  const fromGenres = (group.genres ?? []).map((g) => g.name.trim()).filter(Boolean);
  return [...new Set([...fromTags, ...fromGenres])];
}

function artistMatches(credit: MbReleaseGroupHit['artist-credit'], artist: string): boolean {
  const needle = artist.trim().toLowerCase();
  if (!needle || !credit?.length) return true;
  return credit.some((c) => {
    const name = (c.name ?? c.artist?.name ?? '').toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
}

/** Resolve release-group MBID + community tags (1–2 MB requests, rate-limited). */
export async function lookupMusicBrainzAlbum(
  artist: string,
  album: string
): Promise<MusicBrainzAlbumMatch | null> {
  const q = encodeURIComponent(`artist:"${artist}" AND releasegroup:"${album}"`);
  const search = (await withTimeout(
    mbFetch(`release-group/?query=${q}&fmt=json&limit=5`),
    6000,
    null
  )) as { 'release-groups'?: MbReleaseGroupHit[] } | null;

  const hits = search?.['release-groups'] ?? [];
  const best =
    hits.find((h) => h.score != null && h.score >= 95 && artistMatches(h['artist-credit'], artist)) ??
    hits.find((h) => artistMatches(h['artist-credit'], artist)) ??
    hits[0];

  if (!best?.id) return null;

  const detail = (await withTimeout(
    mbFetch(`release-group/${best.id}?inc=tags+genres&fmt=json`),
    6000,
    null
  )) as MbReleaseGroupHit | null;

  const tags = tagNamesFromGroup(detail ?? best);
  return { releaseGroupMbid: best.id, tags };
}