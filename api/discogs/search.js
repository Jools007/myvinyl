const DISCOGS_API = 'https://api.discogs.com';

function discogsHeaders(token) {
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: `Discogs token=${token}`,
  };
}

function parseSearchResult(item) {
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
    format: Array.isArray(item.format) ? item.format : undefined,
    genre: Array.isArray(item.genre) ? item.genre : undefined,
    style: Array.isArray(item.style) ? item.style : undefined,
    label: Array.isArray(item.label) ? item.label : undefined,
    country: item.country ? String(item.country) : undefined,
    resource_url: String(item.resource_url || `https://www.discogs.com/release/${item.id}`),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  try {
    const params = new URLSearchParams({
      type: 'release',
      per_page: String(perPage),
      page: '1',
    });
    if (barcode?.trim()) params.set('barcode', barcode.trim());
    else params.set('q', q.trim());

    const discogsRes = await fetch(`${DISCOGS_API}/database/search?${params}`, {
      headers: discogsHeaders(token),
    });

    if (!discogsRes.ok) {
      const text = await discogsRes.text();
      const status = discogsRes.status === 429 ? 429 : 502;
      return res.status(status).json({ error: `Discogs search failed: ${discogsRes.status} ${text}` });
    }

    const data = await discogsRes.json();
    return res.status(200).json({ results: (data.results ?? []).map(parseSearchResult) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discogs search failed';
    return res.status(502).json({ error: message });
  }
}