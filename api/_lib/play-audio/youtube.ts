import {
  albumSearchVariants,
  artistSearchVariants,
  titleSearchVariants,
} from './track-title';
import { playAudioLog } from './log';

export type YouTubeVideoMatch = {
  videoId: string;
  title: string;
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

const PREFER_TITLE =
  /\b(lyric\s+video|lyrics\s+video|album\s+version)\b/i;

/** Music videos often block or fight iframe playback — prefer audio uploads. */
const DISLIKE_OFFICIAL_VIDEO = /\bofficial\s+video\b/i;

const DISLIKE_TITLE =
  /\b(cover|tribute|mashup|8d\s+audio|nightcore|sped\s+up|slowed|reverb)\b/i;

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

function scoreYouTubeResult(
  artist: string,
  title: string,
  album: string | undefined,
  candidateTitle: string
): number {
  const t = candidateTitle.trim();
  if (!t || HARD_SKIP_TITLE.test(t)) return 0;
  if (SOFT_SKIP_TITLE.test(t)) return 0.08;

  const titleScore = tokenOverlap(title, t);
  const artistScore = tokenOverlap(artist.split(',')[0], t);
  const albumScore = album ? tokenOverlap(album, t) * 0.28 : 0;

  let score = titleScore * 0.5 + artistScore * 0.38 + albumScore;
  if (PREFER_OFFICIAL_AUDIO.test(t)) score += 0.38;
  else if (PREFER_TITLE.test(t)) score += 0.12;
  if (DISLIKE_OFFICIAL_VIDEO.test(t)) score -= 0.22;
  if (/\bvevo\b/i.test(t)) score -= 0.12;
  if (DISLIKE_TITLE.test(t)) score -= 0.22;
  if (titleScore >= 0.7 && artistScore >= 0.4) score += 0.15;
  if (titleScore >= 0.95 && artistScore >= 0.3) score += 0.1;

  return Math.max(0, score);
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

    if (videoId.length === 11 && title && !seen.has(videoId)) {
      seen.add(videoId);
      out.push({ videoId, title, score: 0 });
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
  const queries = new Set<string>();
  const add = (q: string) => {
    const t = q.replace(/\s+/g, ' ').trim();
    if (t.length > 3) queries.add(t);
  };

  for (const a of artistSearchVariants(artist)) {
    for (const t of titleSearchVariants(title)) {
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

  return [...queries];
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
    const score = scoreYouTubeResult(artist, title, album, row.title);
    if (score < minScore) continue;
    ranked.push({ ...row, score });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}

async function isYouTubeEmbeddable(videoId: string): Promise<boolean> {
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
  maxTry = 2
): Promise<YouTubeVideoMatch | null> {
  const slice = ranked.slice(0, maxTry);
  const checks = await Promise.all(
    slice.map(async (row) => ({
      row,
      ok: await isYouTubeEmbeddable(row.videoId),
    }))
  );
  const hit = checks.find((c) => c.ok);
  return hit?.row ?? slice[0] ?? null;
}

/**
 * Aggressive YouTube lookup — InnerTube search, many title/artist variants, scored ranking.
 */
export async function searchYouTubeForTrack(
  artist: string,
  title: string,
  album?: string,
  apiKey?: string
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

  const seenIds = new Set<string>();
  const all: YouTubeVideoMatch[] = [];

  const ingestBatch = (batch: YouTubeVideoMatch[]) => {
    for (const row of batch) {
      if (seenIds.has(row.videoId)) continue;
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
    const top = picks[0];
    if (!top || top.score < 0.45) return null;
    const pick =
      top.score >= 0.72 ? top : (await pickEmbeddable(picks)) ?? top;
    playAudioLog('youtube-hit', {
      videoId: pick.videoId,
      title: pick.title,
      score: pick.score,
      phase,
      query: query ?? null,
    });
    return pick;
  };

  const maxQueries = 10;
  const parallelCount = Math.min(3, queries.length);
  const initialBatches = await Promise.all(
    queries.slice(0, parallelCount).map((q) => fetchYouTubeBatch(q, apiKey))
  );
  for (let i = 0; i < initialBatches.length; i++) {
    ingestBatch(initialBatches[i]);
    const hit = await tryReturnHit(0.32, 'parallel', queries[i]);
    if (hit) return hit;
  }

  for (let i = parallelCount; i < Math.min(queries.length, maxQueries); i++) {
    const q = queries[i];
    ingestBatch(await fetchYouTubeBatch(q, apiKey));
    const hit = await tryReturnHit(0.32, 'sequential', q);
    if (hit) return hit;
  }

  const relaxedList = rankCandidates(a, t, al, all, 0.22);
  const relaxed = relaxedList[0];
  if (relaxed) {
    const pick = (await pickEmbeddable(relaxedList)) ?? relaxed;
    playAudioLog('youtube-hit-relaxed', {
      videoId: pick.videoId,
      title: pick.title,
      score: pick.score,
    });
    return pick;
  }

  playAudioLog('youtube-miss', { artist: a, title: t, album: al });
  return null;
}