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

export async function getArtistTopTags(apiKey: string, artist: string, limit = 8) {
  const params = new URLSearchParams({
    method: 'artist.gettoptags',
    artist,
    limit: String(limit),
  });
  const data = await lastFmFetch(apiKey, params);
  const tags = (data as { toptags?: { tag?: unknown } }).toptags?.tag;
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : [tags];
  return list
    .filter((t: { name?: string }) => t?.name)
    .map((t: { name: string; count?: number }) => ({
      name: t.name.toLowerCase(),
      count: t.count ?? 0,
    }));
}

type LastFmTrackHit = {
  name: string;
  artist: string;
  url?: string;
  album?: string;
};

function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/feat\.?.*$/i, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pickBestLastFmTrack(
  hits: LastFmTrackHit[],
  artist: string,
  trackTitle: string,
  albumTitle?: string
): LastFmTrackHit | undefined {
  let best: LastFmTrackHit | undefined;
  let bestScore = 0;
  const wantTitle = normalizeForMatch(trackTitle);
  const wantArtist = normalizeForMatch(artist);
  const wantAlbum = albumTitle ? normalizeForMatch(albumTitle) : '';

  for (const hit of hits) {
    const gotTitle = normalizeForMatch(hit.name);
    const gotArtist = normalizeForMatch(hit.artist);
    let score = 0;
    if (gotTitle === wantTitle) score += 0.5;
    else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)) score += 0.35;
    else continue;

    if (gotArtist === wantArtist) score += 0.35;
    else if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist)) score += 0.2;
    else continue;

    if (wantAlbum && hit.album) {
      const gotAlbum = normalizeForMatch(hit.album);
      if (gotAlbum === wantAlbum || gotAlbum.includes(wantAlbum) || wantAlbum.includes(gotAlbum)) {
        score += 0.15;
      }
    } else if (!wantAlbum) {
      score += 0.05;
    }

    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }

  return bestScore >= 0.7 ? best : undefined;
}

export async function searchTracks(apiKey: string, track: string, limit = 12): Promise<LastFmTrackHit[]> {
  const params = new URLSearchParams({
    method: 'track.search',
    track,
    limit: String(limit),
  });
  const data = await lastFmFetch(apiKey, params);
  const results = (data as { results?: { trackmatches?: { track?: unknown } } }).results?.trackmatches
    ?.track;
  if (!results) return [];
  const list = Array.isArray(results) ? results : [results];
  return list
    .filter((t: { name?: string; artist?: string }) => t?.name && t?.artist)
    .map(
      (t: {
        name: string;
        artist: string;
        url?: string;
        album?: string;
      }) => ({
        name: t.name,
        artist: t.artist,
        url: t.url,
        album: t.album,
      })
    );
}

export async function getTrackInfo(
  apiKey: string,
  artist: string,
  track: string,
  album?: string
) {
  const params = new URLSearchParams({
    method: 'track.getInfo',
    artist,
    track,
  });
  if (album?.trim()) params.set('album', album.trim());

  const data = await lastFmFetch(apiKey, params);
  const info = (data as { track?: Record<string, unknown> }).track;
  if (!info) return null;

  const tags = (info.toptags as { tag?: unknown })?.tag;
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const tagNames = tagList
    .filter((t: { name?: string }) => t?.name)
    .map((t: { name: string }) => t.name.toLowerCase());

  const wiki = info.wiki as { content?: string } | undefined;
  const wikiText = wiki?.content?.replace(/<[^>]+>/g, ' ') ?? '';

  return {
    tags: tagNames,
    wikiText,
    duration: typeof info.duration === 'string' ? parseInt(info.duration, 10) : undefined,
    name: typeof info.name === 'string' ? info.name : track,
    album:
      typeof (info.album as { title?: string } | undefined)?.title === 'string'
        ? (info.album as { title: string }).title
        : album,
  };
}

/** Resolve the best Last.fm track page (max 2 API calls). */
export async function resolveLastFmTrack(
  apiKey: string,
  artist: string,
  trackTitle: string,
  albumTitle?: string
) {
  const variant = trackTitle.replace(/\(.*?\)/g, '').trim() || trackTitle;

  const direct = await getTrackInfo(apiKey, artist, variant, albumTitle);
  if (direct && (direct.wikiText || direct.tags.length)) return direct;

  const hits = await searchTracks(apiKey, `${artist} ${variant}`, 8);
  const best = pickBestLastFmTrack(hits, artist, trackTitle, albumTitle);
  if (!best) return direct;

  const resolved = await getTrackInfo(apiKey, best.artist, best.name, best.album ?? albumTitle);
  return resolved ?? direct;
}

export async function getAlbumInfo(apiKey: string, artist: string, album: string) {
  const params = new URLSearchParams({
    method: 'album.getInfo',
    artist,
    album,
  });
  const data = await lastFmFetch(apiKey, params);
  const info = (data as { album?: Record<string, unknown> }).album;
  if (!info) return null;

  const wiki = info.wiki as { content?: string; summary?: string } | undefined;
  const wikiText =
    wiki?.summary?.replace(/<[^>]+>/g, ' ').trim() ||
    wiki?.content?.replace(/<[^>]+>/g, ' ').trim() ||
    '';

  const tags = (info.tags as { tag?: unknown })?.tag;
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const tagNames = tagList
    .filter((t: { name?: string }) => t?.name)
    .map((t: { name: string }) => t.name);

  return {
    name: typeof info.name === 'string' ? info.name : album,
    artist: typeof info.artist === 'string' ? info.artist : artist,
    wikiText,
    tags: tagNames,
    image: pickImage(info.image as { '#text': string; size?: string }[] | undefined),
  };
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