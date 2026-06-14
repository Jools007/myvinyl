import type { VercelRequest, VercelResponse } from '@vercel/node';

const DISCOGS_API = 'https://api.discogs.com';

function barcodeLookupVariants(raw: string): string[] {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  const variants: string[] = [];
  const push = (value: string) => {
    const v = value.trim();
    if (v && !variants.includes(v)) variants.push(v);
  };

  if (trimmed) push(trimmed);
  if (digits) push(digits);

  if (digits.length === 12) {
    push(`0${digits}`);
    push(`${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`);
  }

  if (digits.length === 13 && digits.startsWith('0')) {
    push(digits.slice(1));
    const inner = digits.slice(1);
    if (inner.length === 12) {
      push(`${inner[0]} ${inner.slice(1, 6)} ${inner.slice(6, 11)} ${inner[11]}`);
    }
  }

  if (digits.length === 8) push(digits);
  return variants;
}

const WHEEL_NEIGHBORS: Record<string, string[]> = {
  '1A': ['12A', '2A', '1B'], '2A': ['1A', '3A', '2B'], '3A': ['2A', '4A', '3B'],
  '4A': ['3A', '5A', '4B'], '5A': ['4A', '6A', '5B'], '6A': ['5A', '7A', '6B'],
  '7A': ['6A', '8A', '7B'], '8A': ['7A', '9A', '8B'], '9A': ['8A', '10A', '9B'],
  '10A': ['9A', '11A', '10B'], '11A': ['10A', '12A', '11B'], '12A': ['11A', '1A', '12B'],
  '1B': ['12B', '2B', '1A'], '2B': ['1B', '3B', '2A'], '3B': ['2B', '4B', '3A'],
  '4B': ['3B', '5B', '4A'], '5B': ['4B', '6B', '5A'], '6B': ['5B', '7B', '6A'],
  '7B': ['6B', '8B', '7A'], '8B': ['7B', '9B', '8A'], '9B': ['8B', '10B', '9A'],
  '10B': ['9B', '11B', '10A'], '11B': ['10B', '12B', '11A'], '12B': ['11B', '1B', '12A'],
};

const GENRE_CAMELOT: [string, string][] = [
  ['trip-hop', '6A'], ['trip hop', '6A'], ['downtempo', '6A'], ['chillout', '6A'],
  ['nu jazz', '3B'], ['nu-jazz', '3B'], ['lounge', '3B'],
  ['deep house', '10A'], ['house', '8A'], ['techno', '8A'], ['soul', '8B'],
  ['r&b', '5B'], ['disco', '10B'], ['funk', '5B'], ['jazz', '3B'], ['pop', '9B'],
];

const CAMELOT: Record<string, string> = {
  '0-0': '5A', '0-1': '8B', '1-0': '12A', '1-1': '3B', '2-0': '7A', '2-1': '10B',
  '3-0': '2A', '3-1': '5B', '4-0': '9A', '4-1': '12B', '5-0': '4A', '5-1': '7B',
  '6-0': '11A', '6-1': '2B', '7-0': '6A', '7-1': '9B', '8-0': '1A', '8-1': '4B',
  '9-0': '8A', '9-1': '11B', '10-0': '3A', '10-1': '6B', '11-0': '10A', '11-1': '1B',
};

function hashTrackSeed(artist: string, title: string): number {
  const s = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function genreBpmProfile(genres: string[]) {
  const text = genres.join(' ').toLowerCase();
  if (text.includes('drum and bass') || text.includes('dnb')) return { center: 172, min: 160, max: 188 };
  if (text.includes('trip hop') || text.includes('trip-hop') || text.includes('downtempo') || text.includes('chillout') || text.includes('nu jazz') || text.includes('nu-jazz') || text.includes('lounge')) {
    return { center: 90, min: 72, max: 108 };
  }
  if (text.includes('techno')) return { center: 128, min: 118, max: 140 };
  if (text.includes('deep house')) return { center: 122, min: 112, max: 128 };
  if (text.includes('house')) return { center: 124, min: 115, max: 132 };
  if (text.includes('soul') || text.includes('r&b')) return { center: 98, min: 88, max: 108 };
  if (text.includes('disco') || text.includes('funk')) return { center: 118, min: 105, max: 126 };
  if (text.includes('pop')) return { center: 112, min: 95, max: 128 };
  return { center: 118, min: 95, max: 132 };
}

function pickEstimatedBpm(genres: string[], artist: string, title: string, position?: string): number {
  const profile = genreBpmProfile(genres);
  const steps = [profile.min, Math.round((profile.min + profile.center) / 2), profile.center,
    Math.round((profile.center + profile.max) / 2), profile.max];
  const seed = position?.trim() ? `${position.trim()}|${title}` : title;
  const bpm = steps[hashTrackSeed(artist, seed) % steps.length];
  return Math.min(profile.max, Math.max(profile.min, bpm));
}

function pickEstimatedCamelotKey(
  artist: string, title: string, genres: string[], usedKeys: string[] = [], position?: string
): string | undefined {
  if (!genres.length) return undefined;
  const text = genres.join(' ').toLowerCase();
  let base = '5A';
  for (const [key, camelot] of GENRE_CAMELOT) {
    if (text.includes(key)) { base = camelot; break; }
  }
  const pool = [base, ...(WHEEL_NEIGHBORS[base] ?? [])];
  const seed = position?.trim() ? `${position.trim()}|${title}` : title;
  const start = hashTrackSeed(artist, seed) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    if (!usedKeys.some((k) => k.toUpperCase() === key)) return key;
  }
  return pool[start];
}

function spotifyToCamelot(key: number, mode: number): string | undefined {
  return key >= 0 && key <= 11 ? CAMELOT[`${key}-${mode}`] : undefined;
}

function parseRequestBody(req: VercelRequest): Record<string, unknown> {
  const raw = req.body;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') return JSON.parse(raw) as Record<string, unknown>;
  if (typeof raw === 'object') return raw as Record<string, unknown>;
  return {};
}

async function runEnrich(opts: {
  artist: string;
  title: string;
  genres?: string[];
  position?: string;
  usedKeys?: string[];
  keyFallback?: boolean;
  coverUrl?: string;
}) {
  const genres = [...new Set(opts.genres ?? [])].slice(0, 12);
  const keyFallback = opts.keyFallback !== false;
  const usedKeys = opts.usedKeys ?? [];
  let bpm: number | undefined;
  let camelotKey: string | undefined;
  let bpmEstimated = false;
  let keyEstimated = false;
  let trackSpecific = false;
  let spotifyTrackId: string | undefined;

  const spotifyId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const spotifySecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (spotifyId && spotifySecret) {
    try {
      const auth = Buffer.from(`${spotifyId}:${spotifySecret}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${auth}` },
        body: 'grant_type=client_credentials',
      });
      if (tokenRes.ok) {
        const tokenData = (await tokenRes.json()) as { access_token?: string };
        if (tokenData.access_token) {
          const q = `track:${opts.title} artist:${opts.artist}`;
          const searchRes = await fetch(
            `https://api.spotify.com/v1/search?${new URLSearchParams({ q, type: 'track', limit: '3' })}`,
            { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
          );
          if (searchRes.ok) {
            const searchData = (await searchRes.json()) as {
              tracks?: { items?: { id: string }[] };
            };
            const trackId = searchData.tracks?.items?.[0]?.id;
            if (trackId) {
              spotifyTrackId = trackId;
              const featuresRes = await fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
                headers: { Authorization: `Bearer ${tokenData.access_token}` },
              });
              if (featuresRes.ok) {
                const f = (await featuresRes.json()) as { tempo?: number; key?: number; mode?: number };
                if (f.tempo) { bpm = Math.round(f.tempo); trackSpecific = true; }
                if (f.key != null && f.mode != null) {
                  camelotKey = spotifyToCamelot(f.key, f.mode);
                  trackSpecific = true;
                }
              }
            }
          }
        }
      }
    } catch { /* genre fallback */ }
  }

  if (bpm == null && genres.length) {
    bpm = pickEstimatedBpm(genres, opts.artist, opts.title, opts.position);
    bpmEstimated = true;
  }
  if (!camelotKey && keyFallback && genres.length) {
    camelotKey = pickEstimatedCamelotKey(opts.artist, opts.title, genres, usedKeys, opts.position);
    keyEstimated = Boolean(camelotKey);
  }

  return {
    coverUrl: opts.coverUrl,
    genres,
    bpm,
    camelotKey,
    vibeTags: [] as string[],
    bpmEstimated,
    keyEstimated,
    trackSpecific,
    spotifyTrackId,
  };
}

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

  const variants = barcode?.trim()
    ? barcodeLookupVariants(barcode.trim())
    : [q!.trim()];

  let lastResults: Record<string, unknown>[] = [];

  for (const variant of variants) {
    const params = new URLSearchParams({
      type: 'release',
      per_page: String(perPage),
      page: '1',
    });
    if (barcode?.trim()) params.set('barcode', variant);
    else params.set('q', variant);

    const discogsRes = await fetch(`${DISCOGS_API}/database/search?${params}`, {
      headers: discogsHeaders(token),
    });

    if (!discogsRes.ok) {
      const text = await discogsRes.text();
      const status = discogsRes.status === 429 ? 429 : 502;
      return res.status(status).json({ error: `Discogs search failed: ${discogsRes.status} ${text}` });
    }

    const data = (await discogsRes.json()) as { results?: Record<string, unknown>[] };
    lastResults = data.results ?? [];
    if (lastResults.length > 0) {
      return res.status(200).json({ results: lastResults.map(parseSearchResult) });
    }
  }

  return res.status(200).json({ results: lastResults.map(parseSearchResult) });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'POST') {
    try {
      const data = parseRequestBody(req);
      const artist = typeof data.artist === 'string' ? data.artist.trim() : '';
      const title = typeof data.title === 'string' ? data.title.trim() : '';
      if (!artist || !title) return res.status(400).json({ error: 'artist and title are required' });
      const genres = Array.isArray(data.genres)
        ? data.genres.map((g) => String(g).trim()).filter(Boolean)
        : undefined;
      const release = data.release && typeof data.release === 'object'
        ? (data.release as { genres?: string[]; coverUrl?: string })
        : undefined;
      const result = await runEnrich({
        artist,
        title,
        genres: [...new Set([...(genres ?? []), ...(release?.genres ?? [])])],
        position: typeof data.position === 'string' ? data.position.trim() : undefined,
        usedKeys: Array.isArray(data.usedKeys)
          ? data.usedKeys.map((k) => String(k).trim()).filter(Boolean)
          : undefined,
        keyFallback: data.keyFallback !== false,
        coverUrl: release?.coverUrl,
      });
      return res.status(200).json(result);
    } catch (error) {
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
      const artist = typeof req.query.artist === 'string' ? req.query.artist.trim() : '';
      const title = typeof req.query.title === 'string' ? req.query.title.trim() : '';
      if (!artist || !title) return res.status(400).json({ error: 'artist and title are required' });
      const genresRaw = typeof req.query.genres === 'string' ? req.query.genres : '';
      const genres = genresRaw ? genresRaw.split(',').map((g) => g.trim()).filter(Boolean) : undefined;
      const usedKeysRaw = typeof req.query.usedKeys === 'string' ? req.query.usedKeys : '';
      const result = await runEnrich({
        artist,
        title,
        genres,
        position: typeof req.query.position === 'string' ? req.query.position.trim() : undefined,
        usedKeys: usedKeysRaw ? usedKeysRaw.split(',').map((k) => k.trim()).filter(Boolean) : undefined,
        keyFallback: req.query.keyFallback !== '0',
      });
      return res.status(200).json(result);
    } catch (error) {
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