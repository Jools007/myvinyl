import type { VercelRequest, VercelResponse } from '@vercel/node';

const DISCOGS_API = 'https://api.discogs.com';

function discogsHeaders(token: string): Record<string, string> {
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: `Discogs token=${token}`,
  };
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

async function handleDiscogsSearch(req: VercelRequest, res: VercelResponse) {
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
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = typeof req.query.q === 'string' ? req.query.q : undefined;
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode : undefined;
  if (q?.trim() || barcode?.trim()) {
    try {
      return await handleDiscogsSearch(req, res);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Discogs search failed';
      return res.status(502).json({ error: message });
    }
  }

  const artist = typeof req.query.artist === 'string' ? req.query.artist : '';
  const album = typeof req.query.album === 'string' ? req.query.album : '';
  if (!artist.trim() || !album.trim()) {
    return res.status(400).json({ error: 'artist and album required (or q for Discogs search)' });
  }

  return res.status(200).json({
    description: '',
    source: 'stub',
  });
}