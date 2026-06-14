import {
  albumSearchVariants,
  artistSearchVariants,
  cleanTitleForSearch,
  titleSearchVariants,
} from './track-title';
import { isSoundtrackAlbum, isVariousArtist } from './studio';
import { playAudioLog } from './log';

export type YouTubeVideoMatch = {
  videoId: string;
  title: string;
  channel?: string;
  score: number;
};

/** Public InnerTube key used by youtube.com web client (playback search only). */
const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHL6lAD7tEDd8Ep_Rk';
const INNERTUBE_CLIENT_VERSION = '2.20240601.00.00';

const HARD_SKIP_TITLE =
  /\b(karaoke|instrumental\s+only|how\s+to\s+play|guitar\s+lesson|drum\s+cover|reaction|podcast|unboxing|teaser|trailer|vlog)\b/i;

const SOFT_SKIP_TITLE =
  /\b(live\s+at|live\s+from|festival)\b/i;

const PREFER_OFFICIAL_AUDIO =
  /\b(official\s+audio|audio\s+only|provided\s+to\s+youtube|topic\s*-\s*)/i;

const DISLIKE_LYRIC_VIDEO = /\b(lyric\s*video|lyrics\s*video)\b/i;

const DISLIKE_LYRICS_IN_TITLE = /\blyrics?\b/i;

/** Music videos often block or fight iframe playback — prefer audio uploads. */
const DISLIKE_OFFICIAL_VIDEO = /\bofficial\s+video\b/i;

const DISLIKE_TITLE =
  /\b(cover|tribute|mashup|8d\s+audio|nightcore|sped\s+up|slowed|reverb)\b/i;

/** Too generic to match on title alone (e.g. D-Train album track "Music"). */
const GENERIC_TRACK_TITLE =
  /^(music|intro|outro|interlude|theme|untitled|opening|closing)\b/i;

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenOverlap(want: string, got: string): number {
  const wantTokens = normalize(want).split(' ').filter((t) => t.length > 1);
  if (!wantTokens.length) return 0;
  const gotSet = new Set(normalize(got).split(' '));
  const hit = wantTokens.filter((t) => gotSet.has(t)).length;
  return hit / wantTokens.length;
}

function hasSoundtrackContext(album: string, candidateTitle: string): boolean {
  if (tokenOverlap(album, candidateTitle) >= 0.12) return true;
  if (/\bsoundtrack\b/i.test(candidateTitle)) return true;
  for (const al of albumSearchVariants(album)) {
    if (al.length > 4 && tokenOverlap(al, candidateTitle) >= 0.18) return true;
  }
  return false;
}

function isTopicStyleChannel(artist: string, channel?: string): boolean {
  if (!channel) return false;
  const a = normalize(artist.split(',')[0]);
  const c = normalize(channel);
  return c === a || c === `${a} topic` || c.endsWith(' topic');
}

function scoreYouTubeResult(
  artist: string,
  title: string,
  album: string | undefined,
  candidateTitle: string,
  channel?: string
): number {
  const t = candidateTitle.trim();
  if (!t || HARD_SKIP_TITLE.test(t)) return 0;
  if (SOFT_SKIP_TITLE.test(t)) return 0.08;

  const various = isVariousArtist(artist);
  const soundtrack = isSoundtrackAlbum(album);
  const titleScore = tokenOverlap(title, t);
  const artistScore = various ? 0 : tokenOverlap(artist.split(',')[0], t);
  const albumScore = album ? tokenOverlap(album, t) * (various || soundtrack ? 0.55 : 0.28) : 0;

  let score = titleScore * 0.5 + artistScore * 0.38 + albumScore;
  if (various || soundtrack) {
    if (albumScore >= 0.2) score += 0.25;
    if (/\bsoundtrack\b/i.test(t) && soundtrack) score += 0.15;
  }
  const coreTitle = cleanTitleForSearch(title);
  if (GENERIC_TRACK_TITLE.test(coreTitle) && artistScore < 0.45) score -= 0.6;
  if (PREFER_OFFICIAL_AUDIO.test(t)) {
    score += 0.38;
  } else if (
    !various &&
    !soundtrack &&
    isTopicStyleChannel(artist, channel) &&
    titleScore >= 0.5
  ) {
    score += 0.9;
  } else if (
    !various &&
    !soundtrack &&
    titleScore >= 0.55 &&
    artistScore < 0.3 &&
    !DISLIKE_LYRIC_VIDEO.test(t)
  ) {
    // Topic-style uploads: title is usually just the song name
    score += 0.65;
  }
  if ((various || soundtrack) && album && titleScore >= 0.65 && !hasSoundtrackContext(album, t)) {
    score -= 0.6;
  }
  const vevoChannel = (channel ?? '').toLowerCase();
  if (/\bvevo\b/i.test(t) || vevoChannel.includes('vevo')) score -= 0.8;
  if (isVevoStyleMusicVideo(artist, title, t)) score -= 0.55;
  if (DISLIKE_LYRIC_VIDEO.test(t)) score -= 0.45;
  else if (DISLIKE_LYRICS_IN_TITLE.test(t) && !/\bofficial\b/i.test(t)) score -= 0.18;
  if (DISLIKE_OFFICIAL_VIDEO.test(t)) score -= 0.22;
  if (DISLIKE_TITLE.test(t)) score -= 0.22;
  if (titleScore >= 0.7 && artistScore >= 0.4) score += 0.15;
  if (titleScore >= 0.95 && artistScore >= 0.3) score += 0.1;

  return Math.max(0, score);
}

function isVevoStyleMusicVideo(
  artist: string,
  trackTitle: string,
  candidateTitle: string
): boolean {
  const a = normalize(artist.split(',')[0]);
  const t = normalize(candidateTitle);
  const leadDash = normalize(`${artist.split(',')[0]} - ${trackTitle}`);
  const leadSpace = `${a} ${normalize(trackTitle)}`;
  if (PREFER_OFFICIAL_AUDIO.test(candidateTitle)) return false;
  return (
    t.startsWith(leadDash) ||
    (t.startsWith(leadSpace) && !/\b(remix|mix|live|version)\b/i.test(candidateTitle))
  );
}

function audioEmbedPriority(
  title: string,
  channel: string | undefined,
  artist: string,
  trackTitle: string
): number {
  let p = 0;
  if (PREFER_OFFICIAL_AUDIO.test(title)) p += 3;
  if (isTopicStyleChannel(artist, channel)) p += 3;
  if (isVevoStyleMusicVideo(artist, trackTitle, title)) p -= 8;
  if (DISLIKE_LYRIC_VIDEO.test(title)) p -= 4;
  if (DISLIKE_OFFICIAL_VIDEO.test(title)) p -= 2;
  if ((channel ?? '').toLowerCase().includes('vevo')) p -= 5;
  return p;
}

function parseInnerTubeVideos(body: unknown): YouTubeVideoMatch[] {
  const out: YouTubeVideoMatch[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 16) return;
    const obj = node as Record<string, unknown>;

    const videoId = typeof obj.videoId === 'string' ? obj.videoId.trim() : '';
    let title = '';
    const titleObj = obj.title;
    if (titleObj && typeof titleObj === 'object') {
      const t = titleObj as { simpleText?: string; runs?: { text?: string }[] };
      title = (t.simpleText ?? t.runs?.[0]?.text ?? '').trim();
    }

    let channel = '';
    const channelObj = obj.ownerText ?? obj.shortBylineText ?? obj.longBylineText;
    if (channelObj && typeof channelObj === 'object') {
      const c = channelObj as { simpleText?: string; runs?: { text?: string }[] };
      channel = (c.simpleText ?? c.runs?.[0]?.text ?? '').trim();
    }

    if (videoId.length === 11 && title && !seen.has(videoId)) {
      seen.add(videoId);
      out.push({ videoId, title, channel: channel || undefined, score: 0 });
    }

    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object') walk(value, depth + 1);
    }
  };

  walk(body);
  return out;
}

async function searchYouTubeInnerTube(
  query: string,
  timeoutMs = 9000
): Promise<YouTubeVideoMatch[]> {
  playAudioLog('youtube-innertube', { query });
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: INNERTUBE_CLIENT_VERSION,
              hl: 'en',
              gl: 'US',
            },
          },
          query,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      }
    );
    if (!res.ok) {
      playAudioLog('youtube-innertube-fail', { query, status: res.status });
      return [];
    }
    const data = (await res.json()) as unknown;
    const videos = parseInnerTubeVideos(data);
    playAudioLog('youtube-innertube-ok', { query, count: videos.length });
    return videos;
  } catch (err) {
    playAudioLog('youtube-innertube-fail', {
      query,
      error: err instanceof Error ? err.message : 'unknown',
    });
    return [];
  }
}

async function searchYouTubeDataApi(
  apiKey: string,
  query: string,
  timeoutMs = 9000
): Promise<YouTubeVideoMatch[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10',
    maxResults: '15',
    q: query,
    key: apiKey,
  });
  playAudioLog('youtube-data-api', { query });
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { signal: AbortSignal.timeout(timeoutMs) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as {
    items?: { id?: { videoId?: string }; snippet?: { title?: string } }[];
  };
  const out: YouTubeVideoMatch[] = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId?.trim();
    const title = item.snippet?.title?.trim();
    if (videoId && title) out.push({ videoId, title, score: 0 });
  }
  return out;
}

async function fetchYouTubeBatch(
  query: string,
  apiKey?: string
): Promise<YouTubeVideoMatch[]> {
  if (apiKey) {
    const api = await searchYouTubeDataApi(apiKey, query);
    if (api.length) return api;
  }
  const inner = await searchYouTubeInnerTube(query);
  if (inner.length) return inner;
  return [];
}

function buildYouTubeQueries(
  artist: string,
  title: string,
  album?: string
): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();
  const add = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t.length > 3 && !seen.has(t)) {
      seen.add(t);
      queries.push(t);
    }
  };

  const various = isVariousArtist(artist);
  const soundtrack = isSoundtrackAlbum(album);

  // VA / soundtrack: album + title first — "Various" as artist matches random uploads.
  if ((various || soundtrack) && album) {
    for (const t of titleSearchVariants(title)) {
      for (const al of albumSearchVariants(album)) {
        add(`${t} ${al} soundtrack`);
        add(`${al} ${t} soundtrack`);
        add(`${t} from ${al}`);
        add(`${al} ${t} official audio`);
        add(`${t} ${al}`);
      }
    }
  }

  if (!various) {
    for (const a of artistSearchVariants(artist)) {
      for (const t of titleSearchVariants(title)) {
        add(`${a} ${t} topic`);
        add(`${a} ${t} official audio`);
        add(`${a} ${t} lyrics`);
        add(`${a} - ${t}`);
        add(`${a} ${t} audio`);
        add(`${a} ${t}`);
        if (album) {
          for (const al of albumSearchVariants(album)) {
            add(`${a} ${t} ${al}`);
            add(`${a} ${al} ${t}`);
          }
        }
      }
    }
  }

  return queries;
}

function rankCandidates(
  artist: string,
  title: string,
  album: string | undefined,
  candidates: YouTubeVideoMatch[],
  minScore: number
): YouTubeVideoMatch[] {
  const seen = new Set<string>();
  const ranked: YouTubeVideoMatch[] = [];

  for (const row of candidates) {
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    const score = scoreYouTubeResult(artist, title, album, row.title, row.channel);
    if (score < minScore) continue;
    ranked.push({ ...row, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

async function isYouTubeEmbeddableViaDataApi(
  videoId: string,
  apiKey: string
): Promise<boolean | null> {
  try {
    const params = new URLSearchParams({
      part: 'status',
      id: videoId,
      key: apiKey,
    });
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?${params}`,
      { signal: AbortSignal.timeout(3500) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      items?: { status?: { embeddable?: boolean } }[];
    };
    const embeddable = data.items?.[0]?.status?.embeddable;
    return typeof embeddable === 'boolean' ? embeddable : null;
  } catch {
    return null;
  }
}

async function isYouTubeEmbeddable(
  videoId: string,
  apiKey?: string
): Promise<boolean> {
  if (apiKey) {
    const viaApi = await isYouTubeEmbeddableViaDataApi(videoId, apiKey);
    if (viaApi === false) return false;
    if (viaApi === true) return true;
  }

  // InnerTube player checks from server IPs false-negative most videos; browser may still play
  // until IFrame error 150 — client retries with excludeVideoIds when that happens.
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function pickEmbeddable(
  ranked: YouTubeVideoMatch[],
  apiKey?: string,
  excludeVideoIds: Set<string> = new Set(),
  maxTry = 10,
  artist = '',
  trackTitle = ''
): Promise<YouTubeVideoMatch | null> {
  const eligible = ranked.filter((row) => !excludeVideoIds.has(row.videoId));
  const nonVevo = eligible.filter(
    (row) => !isVevoStyleMusicVideo(artist, trackTitle, row.title)
  );
  const pool = nonVevo.length ? nonVevo : eligible;
  const slice = pool
    .slice(0, maxTry * 2)
    .sort(
      (a, b) =>
        audioEmbedPriority(b.title, b.channel, artist, trackTitle) +
        b.score -
        (audioEmbedPriority(a.title, a.channel, artist, trackTitle) + a.score)
    )
    .slice(0, maxTry);
  let fallback: YouTubeVideoMatch | null = null;
  for (const row of slice) {
    const ok = await isYouTubeEmbeddable(row.videoId, apiKey);
    if (ok) return row;
    if (!fallback) fallback = row;
  }
  // oEmbed can pass while IFrame still returns 150 — return a different candidate when possible
  if (slice.length > 1) {
    return slice.find((row) => row.videoId !== fallback?.videoId) ?? slice[1] ?? null;
  }
  return fallback;
}

/**
 * Aggressive YouTube lookup — InnerTube search, many title/artist variants, scored ranking.
 */
export async function searchYouTubeForTrack(
  artist: string,
  title: string,
  album?: string,
  apiKey?: string,
  excludeVideoIds: string[] = []
): Promise<YouTubeVideoMatch | null> {
  const a = artist.trim();
  const t = title.trim();
  const al = album?.trim();
  if (!a || !t) return null;

  const queries = buildYouTubeQueries(a, t, al);
  playAudioLog('youtube-start', {
    artist: a,
    title: t,
    album: al,
    queryCount: queries.length,
    queries: queries.slice(0, 10),
  });

  const excluded = new Set(excludeVideoIds.map((id) => id.trim()).filter(Boolean));
  const seenIds = new Set<string>();
  const all: YouTubeVideoMatch[] = [];

  const ingestBatch = (batch: YouTubeVideoMatch[]) => {
    for (const row of batch) {
      if (seenIds.has(row.videoId) || excluded.has(row.videoId)) continue;
      seenIds.add(row.videoId);
      all.push(row);
    }
  };

  const tryReturnHit = async (
    minScore: number,
    phase: string,
    query?: string
  ): Promise<YouTubeVideoMatch | null> => {
    const picks = rankCandidates(a, t, al, all, minScore);
    if (!picks.length || picks[0].score < 0.45) return null;
    const nonVevoPicks = picks.filter((row) => !isVevoStyleMusicVideo(a, t, row.title));
    let ranked = nonVevoPicks.length ? nonVevoPicks : picks;
    if ((isVariousArtist(a) || isSoundtrackAlbum(al)) && al) {
      const contextual = ranked.filter((row) => hasSoundtrackContext(al, row.title));
      if (contextual.length) ranked = contextual;
    }
    const coreTitle = cleanTitleForSearch(t);
    if (GENERIC_TRACK_TITLE.test(coreTitle) && !isVariousArtist(a)) {
      const withArtist = ranked.filter(
        (row) => tokenOverlap(a.split(',')[0], row.title) >= 0.35
      );
      if (withArtist.length) ranked = withArtist;
    }
    const pick = await pickEmbeddable(ranked, apiKey, excluded, carefulPick ? 8 : 4, a, t);
    if (!pick) return null;
    playAudioLog('youtube-hit', {
      videoId: pick.videoId,
      title: pick.title,
      score: pick.score,
      phase,
      query: query ?? null,
      excluded: excluded.size ? [...excluded] : undefined,
    });
    return pick;
  };

  const maxQueries = 10;
  const carefulPick = isVariousArtist(a) || isSoundtrackAlbum(al);

  // VA / soundtrack: sequential topic/soundtrack passes before parallel (accuracy over speed).
  if (carefulPick) {
    const priorityQueries = queries
      .filter((q) => /\b(topic|official audio|soundtrack)\b/i.test(q))
      .slice(0, 2);
    for (const q of priorityQueries) {
      ingestBatch(await fetchYouTubeBatch(q, apiKey));
      const hit = await tryReturnHit(0.28, 'topic-first', q);
      if (hit && !isVevoStyleMusicVideo(a, t, hit.title)) return hit;
    }
  }

  const parallelCount = Math.min(3, queries.length);
  const initialBatches = await Promise.all(
    queries.slice(0, parallelCount).map((q) => fetchYouTubeBatch(q, apiKey))
  );
  for (const batch of initialBatches) ingestBatch(batch);
  const parallelHit = await tryReturnHit(0.32, 'parallel');
  if (parallelHit && !isVevoStyleMusicVideo(a, t, parallelHit.title)) return parallelHit;

  for (let i = parallelCount; i < Math.min(queries.length, maxQueries); i++) {
    const q = queries[i];
    ingestBatch(await fetchYouTubeBatch(q, apiKey));
    const hit = await tryReturnHit(0.32, 'sequential', q);
    if (hit) return hit;
  }

  const relaxedList = rankCandidates(a, t, al, all, 0.22);
  if (relaxedList.length) {
    const pick = await pickEmbeddable(relaxedList, apiKey, excluded, 12, a, t);
    if (pick) {
      playAudioLog('youtube-hit-relaxed', {
        videoId: pick.videoId,
        title: pick.title,
        score: pick.score,
      });
      return pick;
    }
  }

  playAudioLog('youtube-miss', { artist: a, title: t, album: al });
  return null;
}