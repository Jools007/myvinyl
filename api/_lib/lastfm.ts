const LASTFM_API = 'https://ws.audioscrobbler.com/2.0/';

function pickImage(images?: { '#text': string; size?: string }[]): string | undefined {
  if (!images?.length) return undefined;
  const sorted = [...images].filter((i) => i['#text']?.trim());
  const large = sorted.find((i) => i.size === 'extralarge' || i.size === 'large');
  return (large || sorted[sorted.length - 1])?.['#text'];
}

async function lastFmFetch(apiKey: string, params: URLSearchParams) {
  params.set('api_key', apiKey);
  params.set('format', 'json');
  const res = await fetch(`${LASTFM_API}?${params}`);
  const data = (await res.json()) as { error?: number; message?: string };
  if (data.error) throw new Error(data.message || `Last.fm error ${data.error}`);
  if (!res.ok) throw new Error(`Last.fm request failed: ${res.status}`);
  return data;
}

export async function getSimilarArtists(apiKey: string, artist: string, limit = 10) {
  const params = new URLSearchParams({
    method: 'artist.getsimilar',
    artist,
    limit: String(limit),
  });
  const data = await lastFmFetch(apiKey, params);
  const similar = (data as { similarartists?: { artist?: unknown } }).similarartists?.artist;
  if (!similar) return [];
  const list = Array.isArray(similar) ? similar : [similar];
  return list
    .filter((a: { name?: string }) => a?.name)
    .map((a: { name: string; url: string; image?: { '#text': string; size?: string }[] }) => ({
      name: a.name,
      url: a.url,
      image: pickImage(a.image),
    }));
}

export async function getSimilarTracks(
  apiKey: string,
  artist: string,
  track: string,
  limit = 12
) {
  const params = new URLSearchParams({
    method: 'track.getsimilar',
    artist,
    track,
    limit: String(limit),
  });
  const data = await lastFmFetch(apiKey, params);
  const similar = (data as { similartracks?: { track?: unknown } }).similartracks?.track;
  if (!similar) return [];
  const list = Array.isArray(similar) ? similar : [similar];
  return list
    .filter((t: { name?: string }) => t?.name)
    .map(
      (t: {
        name: string;
        artist: { name: string } | string;
        url: string;
        image?: { '#text': string; size?: string }[];
      }) => ({
        name: t.name,
        artist: typeof t.artist === 'object' ? t.artist.name : String(t.artist),
        url: t.url,
        image: pickImage(t.image),
      })
    );
}

export async function getTopTracksByTag(apiKey: string, tag: string, limit = 15) {
  const params = new URLSearchParams({
    method: 'tag.gettoptracks',
    tag,
    limit: String(limit),
  });
  const data = await lastFmFetch(apiKey, params);
  const tracks = (data as { tracks?: { track?: unknown } }).tracks?.track;
  if (!tracks) return [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  return list
    .filter((t: { name?: string }) => t?.name)
    .map(
      (t: {
        name: string;
        artist: { name: string };
        url: string;
        image?: { '#text': string; size?: string }[];
      }) => ({
        name: t.name,
        artist: t.artist?.name ?? '',
        url: t.url,
        image: pickImage(t.image),
      })
    );
}