import { resolveDiscogsCoverUrl } from './cover';

const DISCOGS_API = 'https://api.discogs.com';
const COLLECTION_FOLDER_ALL = 0;

function headers(token: string): Record<string, string> {
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.app',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: `Discogs token=${token}`,
  };
}

export async function searchDiscogs(
  token: string,
  q: string,
  page = 1,
  perPage = 24
) {
  const params = new URLSearchParams({
    q,
    type: 'release',
    page: String(page),
    per_page: String(perPage),
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs search failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ results?: Record<string, unknown>[]; pagination?: unknown }>;
}

export async function searchDiscogsByBarcode(
  token: string,
  barcode: string,
  perPage = 5
) {
  const params = new URLSearchParams({
    barcode,
    type: 'release',
    per_page: String(perPage),
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs barcode search failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ results?: Record<string, unknown>[]; pagination?: unknown }>;
}

export type DiscogsCollectionBasicInfo = {
  id: number;
  title: string;
  artists?: { name: string }[];
  year?: number;
  formats?: { name?: string; descriptions?: string[] }[];
  genres?: string[];
  styles?: string[];
  thumb?: string;
  cover_image?: string;
};

export type DiscogsCollectionItem = {
  id: number;
  instance_id: number;
  basic_information: DiscogsCollectionBasicInfo;
};

export type DiscogsCollectionPage = {
  releases: DiscogsCollectionItem[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
};

function formatStringsFromDiscogs(
  formats?: { name?: string; descriptions?: string[] }[]
): string[] {
  if (!formats?.length) return [];
  return formats.map((f) =>
    [f.name, ...(f.descriptions ?? [])].filter(Boolean).join(' ').trim()
  );
}

export function isCdOnlyDiscogsFormats(
  formats?: { name?: string; descriptions?: string[] }[]
): boolean {
  const strings = formatStringsFromDiscogs(formats);
  if (!strings.length) return false;
  return strings.every((s) => /\bCD\b/i.test(s));
}

export function pickVinylFormatLabel(
  formats?: { name?: string; descriptions?: string[] }[]
): string {
  const strings = formatStringsFromDiscogs(formats);
  const vinylish = strings.find((s) => !/\bCD\b/i.test(s));
  const primary = vinylish ?? strings[0] ?? 'LP';
  const upper = primary.toUpperCase();
  if (upper.includes('12') && upper.includes('SINGLE')) return '12" Single';
  if (upper.includes('7') && upper.includes('SINGLE')) return '7" Single';
  if (upper.includes('10"')) return '10"';
  if (upper.includes('EP')) return 'EP';
  if (upper.includes('COMP')) return 'Compilation';
  if (upper.includes('LP') || upper.includes('VINYL')) return 'LP';
  return primary.split(',')[0]?.trim() || 'LP';
}

export function parseCollectionRelease(item: DiscogsCollectionItem) {
  const info = item.basic_information;
  const artist =
    info.artists?.map((a) => a.name).join(', ') ||
    info.title?.split(' - ')[0]?.trim() ||
    'Unknown';

  return {
    discogsId: info.id,
    artist,
    title: info.title?.trim() || 'Untitled',
    year: info.year ? String(info.year) : undefined,
    format: pickVinylFormatLabel(info.formats),
    isCdOnly: isCdOnlyDiscogsFormats(info.formats),
    coverUrl:
      resolveDiscogsCoverUrl(info.cover_image) ?? resolveDiscogsCoverUrl(info.thumb),
    genres: [...new Set([...(info.genres ?? []), ...(info.styles ?? [])])].slice(0, 12),
  };
}

export async function getUserCollectionPage(
  token: string,
  username: string,
  page = 1,
  perPage = 100
): Promise<DiscogsCollectionPage> {
  const user = encodeURIComponent(username.trim());
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(Math.min(100, Math.max(1, perPage))),
  });
  const res = await fetch(
    `${DISCOGS_API}/users/${user}/collection/folders/${COLLECTION_FOLDER_ALL}/releases?${params}`,
    { headers: headers(token) }
  );
  if (res.status === 404) {
    throw new Error('Discogs user not found. Check the username and try again.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs collection failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as DiscogsCollectionPage;
  return {
    releases: data.releases ?? [],
    pagination: data.pagination ?? { page: 1, pages: 1, per_page: perPage, items: 0 },
  };
}

export async function getRelease(token: string, id: number) {
  const res = await fetch(`${DISCOGS_API}/releases/${id}`, {
    headers: headers(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs release failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<DiscogsRelease>;
}

export function parseSearchResult(item: Record<string, unknown>) {
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
    thumb: resolveDiscogsCoverUrl(String(item.thumb || item.cover_image || '')) ?? '',
    cover: resolveDiscogsCoverUrl(
      item.cover_image ? String(item.cover_image) : item.thumb ? String(item.thumb) : undefined
    ),
    format: Array.isArray(item.format) ? (item.format as string[]) : undefined,
    genre: Array.isArray(item.genre) ? (item.genre as string[]) : undefined,
    style: Array.isArray(item.style) ? (item.style as string[]) : undefined,
    label: Array.isArray(item.label) ? (item.label as string[]) : undefined,
    country: item.country ? String(item.country) : undefined,
    resource_url: String(item.resource_url || `https://www.discogs.com/release/${item.id}`),
  };
}

export function extractBpmKey(
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

export function bestCoverImage(images?: { uri: string; type: string }[]): string | undefined {
  if (!images?.length) return undefined;
  const primary = images.find((i) => i.type === 'primary');
  return resolveDiscogsCoverUrl(primary?.uri || images[0]?.uri);
}

interface DiscogsRelease {
  id: number;
  title: string;
  artists?: { name: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  notes?: string;
  images?: { uri: string; type: string }[];
  tracklist?: {
    title: string;
    position?: string;
    duration?: string;
    type_?: string;
    type?: string;
    sub_tracks?: DiscogsRelease['tracklist'];
  }[];
  uri?: string;
}