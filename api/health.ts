import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  EnrichValidationError,
  handleEnrich,
  parseEnrichBody,
  parseEnrichQuery,
} from './_lib/enrich/handler';
import { InvalidJsonBodyError, parseJsonBody, queryRecord } from './_lib/request';

const DISCOGS_API = 'https://api.discogs.com';

type DiscogsTrackRow = {
  title?: string;
  position?: string;
  duration?: string;
  type_?: string;
  type?: string;
  sub_tracks?: DiscogsTrackRow[];
};

function discogsHeaders(token: string): Record<string, string> {
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: `Discogs token=${token}`,
  };
}

function flattenDiscogsTracklist(tracklist: DiscogsTrackRow[] | undefined): DiscogsTrackRow[] {
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

function extractBpmKey(
  notes?: string,
  tracklist?: { title: string }[]
): { bpm?: number; key?: string } {
  const text = [notes, ...(tracklist || []).map((t) => t.title)].filter(Boolean).join(' ');
  const bpmMatch = text.match(/\b(\d{2,3})\s*BPM\b/i);
  const keyMatch =
    text.match(/\b(\d{1,2}[AB])\b/i) ||
    text.match(/\b([A-G][#b]?(?:\s*(?:major|minor|maj|min|m))?)\b/i);
  return {
    bpm: bpmMatch ? parseInt(bpmMatch[1], 10) : undefined,
    key: keyMatch ? keyMatch[1].toUpperCase().replace(/\s+/g, '') : undefined,
  };
}

function bestCoverImage(images?: { uri: string; type: string }[]): string | undefined {
  if (!images?.length) return undefined;
  const primary = images.find((i) => i.type === 'primary');
  const uri = primary?.uri || images[0]?.uri;
  return uri?.startsWith('https://') ? uri : undefined;
}

function parseSearchResult(item: Record<string, unknown>) {
  const title = String(item.title || '');
  const parts = title.split(' - ');
  const artist = parts.length > 1 ? parts[0] : String(item.artist || 'Unknown');
  const albumTitle = parts.length > 1 ? parts.slice(1).join(' - ') : title;

  return {
    id: Number(item.id),
    type: String(item.type),
    title: albumTitle,
    artist,
    year: item.year ? String(item.year) : undefined,
    thumb: String(item.thumb || item.cover_image || ''),
    cover: item.cover_image ? String(item.cover_image) : item.thumb ? String(item.thumb) : undefined,
    format: Array.isArray(item.format) ? (item.format as string[]) : undefined,
    genre: Array.isArray(item.genre) ? (item.genre as string[]) : undefined,
    style: Array.isArray(item.style) ? (item.style as string[]) : undefined,
    label: Array.isArray(item.label) ? (item.label as string[]) : undefined,
    country: item.country ? String(item.country) : undefined,
    resource_url: String(item.resource_url || `https://www.discogs.com/release/${item.id}`),
  };
}

function mapDiscogsReleaseDetail(data: {
  id: number;
  title: string;
  artists?: { name: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  notes?: string;
  images?: { uri: string; type: string }[];
  tracklist?: DiscogsTrackRow[];
}) {
  const tracklist = flattenDiscogsTracklist(data.tracklist).filter((row) => Boolean(row.title?.trim()));
  const meta = extractBpmKey(
    data.notes,
    tracklist.map((row) => ({ title: row.title!.trim() }))
  );
  const artist =
    data.artists?.map((entry) => entry.name).join(', ') ||
    data.title?.split(' - ')[0] ||
    'Unknown';

  return {
    id: data.id,
    title: data.title,
    artist,
    year: data.year ? String(data.year) : undefined,
    genres: [...(data.genres || []), ...(data.styles || [])],
    coverUrl: bestCoverImage(data.images),
    bpm: meta.bpm,
    camelotKey: meta.key?.match(/^\d{1,2}[AB]$/i) ? meta.key.toUpperCase() : undefined,
    musicalKey: meta.key,
    notes: data.notes,
    tracklist: tracklist.map((row) => ({
      title: row.title!.trim(),
      position: row.position,
      duration: row.duration,
      type_: row.type_,
      type: row.type,
    })),
  };
}

async function discogsRelease(id: number, res: VercelResponse) {
  const token = process.env.DISCOGS_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: 'DISCOGS_TOKEN not configured' });
  }

  const discogsRes = await fetch(`${DISCOGS_API}/releases/${id}`, {
    headers: discogsHeaders(token),
  });

  if (!discogsRes.ok) {
    const text = await discogsRes.text();
    const status = discogsRes.status === 429 ? 429 : 502;
    return res.status(status).json({ error: `Discogs release failed: ${discogsRes.status} ${text}` });
  }

  const raw = (await discogsRes.json()) as Parameters<typeof mapDiscogsReleaseDetail>[0];
  return res.status(200).json(mapDiscogsReleaseDetail(raw));
}

async function discogsSearch(req: VercelRequest, res: VercelResponse) {
  const token = process.env.DISCOGS_TOKEN?.trim();
  if (!token) {
    return res.status(503).json({ error: 'DISCOGS_TOKEN not configured' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode : undefined;
  const perPageRaw = typeof req.query.per_page === 'string' ? req.query.per_page : undefined;
  const perPage = Math.min(50, Math.max(1, parseInt(perPageRaw ?? '16', 10) || 16));

  if (!q?.trim() && !barcode?.trim()) {
    return res.status(400).json({ error: 'q or barcode required' });
  }

  const params = new URLSearchParams({
    type: 'release',
    per_page: String(perPage),
    page: '1',
  });
  if (barcode?.trim()) params.set('barcode', barcode.trim());
  else params.set('q', q!.trim());

  const discogsRes = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: discogsHeaders(token),
  });

  if (!discogsRes.ok) {
    const text = await discogsRes.text();
    const status = discogsRes.status === 429 ? 429 : 502;
    return res.status(status).json({ error: `Discogs search failed: ${discogsRes.status} ${text}` });
  }

  const data = (await discogsRes.json()) as { results?: Record<string, unknown>[] };
  return res.status(200).json({ results: (data.results ?? []).map(parseSearchResult) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'POST') {
    try {
      const input = parseEnrichBody(parseJsonBody(req));
      const result = await handleEnrich(input, {
        spotifyId: process.env.SPOTIFY_CLIENT_ID?.trim(),
        spotifySecret: process.env.SPOTIFY_CLIENT_SECRET?.trim(),
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EnrichValidationError || error instanceof InvalidJsonBodyError) {
        return res.status(400).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Enrichment failed';
      return res.status(502).json({ error: message });
    }
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const enrichFlag = typeof req.query.enrich === 'string' ? req.query.enrich : undefined;
  if (enrichFlag === '1' || enrichFlag === 'true') {
    try {
      const input = parseEnrichQuery(queryRecord(req.query));
      const result = await handleEnrich(input, {
        spotifyId: process.env.SPOTIFY_CLIENT_ID?.trim(),
        spotifySecret: process.env.SPOTIFY_CLIENT_SECRET?.trim(),
      });
      return res.status(200).json(result);
    } catch (error) {
      if (error instanceof EnrichValidationError) {
        return res.status(400).json({ error: error.message });
      }
      const message = error instanceof Error ? error.message : 'Enrichment failed';
      return res.status(502).json({ error: message });
    }
  }

  const releaseIdRaw = typeof req.query.releaseId === 'string' ? req.query.releaseId : undefined;
  if (releaseIdRaw) {
    const id = Number(releaseIdRaw);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: 'Valid release id required' });
    }
    try {
      return await discogsRelease(id, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discogs release failed';
      return res.status(502).json({ error: message });
    }
  }

  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode : undefined;
  if (q?.trim() || barcode?.trim()) {
    try {
      return await discogsSearch(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discogs search failed';
      return res.status(502).json({ error: message });
    }
  }

  return res.status(200).json({
    status: 'ok',
    environment: 'production',
  });
}