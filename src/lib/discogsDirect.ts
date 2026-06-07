import type { DiscogsSearchHit } from './types';

export type DirectDiscogsTracklistItem = {
  position?: string;
  title: string;
  duration?: string;
  type_?: string;
  type?: string;
};

export type DirectDiscogsReleaseDetail = {
  id: number;
  title: string;
  artist: string;
  year?: string;
  genres: string[];
  coverUrl?: string;
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  notes?: string;
  tracklist?: DirectDiscogsTracklistItem[];
};

export type DirectDiscogsCollectionRelease = {
  discogsId: number;
  artist: string;
  title: string;
  year?: string;
  format: string;
  isCdOnly: boolean;
  coverUrl?: string;
  genres: string[];
};

export type DirectDiscogsCollectionPageResult = {
  releases: DirectDiscogsCollectionRelease[];
  pagination: {
    page: number;
    pages: number;
    per_page: number;
    items: number;
  };
};

const DISCOGS_API = 'https://api.discogs.com';
const COLLECTION_FOLDER_ALL = 0;

type DiscogsImage = { uri: string; type: string };

type DiscogsTrackRow = {
  title: string;
  position?: string;
  duration?: string;
  type_?: string;
  type?: string;
};

type DiscogsReleaseRaw = {
  id: number;
  title: string;
  artists?: { name: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  notes?: string;
  images?: DiscogsImage[];
  tracklist?: DiscogsTrackRow[];
};

type DiscogsCollectionItemRaw = {
  basic_information: {
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
};

function discogsHeaders(token: string): HeadersInit {
  return {
    'User-Agent': 'MyVinyl/1.0 +https://myvinyl.local',
    Accept: 'application/vnd.discogs.v2.discogs+json',
    Authorization: `Discogs token=${token}`,
  };
}

export function hasClientDiscogsToken(): boolean {
  return Boolean(getClientDiscogsToken());
}

export function getClientDiscogsToken(): string | undefined {
  const token = import.meta.env.VITE_DISCOGS_TOKEN?.trim();
  return token || undefined;
}

function formatStringsFromDiscogs(
  formats?: { name?: string; descriptions?: string[] }[]
): string[] {
  if (!formats?.length) return [];
  return formats.map((format) =>
    [format.name, ...(format.descriptions ?? [])].filter(Boolean).join(' ').trim()
  );
}

function isCdOnlyDiscogsFormats(
  formats?: { name?: string; descriptions?: string[] }[]
): boolean {
  const strings = formatStringsFromDiscogs(formats);
  if (!strings.length) return false;
  return strings.every((value) => /\bCD\b/i.test(value));
}

function pickVinylFormatLabel(
  formats?: { name?: string; descriptions?: string[] }[]
): string {
  const strings = formatStringsFromDiscogs(formats);
  const vinylish = strings.find((value) => !/\bCD\b/i.test(value));
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

function parseSearchResult(item: Record<string, unknown>): DiscogsSearchHit {
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
    cover: item.cover_image ? String(item.cover_image) : undefined,
    format: Array.isArray(item.format) ? (item.format as string[]) : undefined,
    genre: Array.isArray(item.genre) ? (item.genre as string[]) : undefined,
    style: Array.isArray(item.style) ? (item.style as string[]) : undefined,
    label: Array.isArray(item.label) ? (item.label as string[]) : undefined,
    country: item.country ? String(item.country) : undefined,
    resource_url: String(item.resource_url || `https://www.discogs.com/release/${item.id}`),
  };
}

function extractBpmKey(
  notes?: string,
  tracklist?: { title: string }[]
): { bpm?: number; key?: string } {
  const text = [notes, ...(tracklist || []).map((track) => track.title)].filter(Boolean).join(' ');
  const bpmMatch = text.match(/\b(\d{2,3})\s*BPM\b/i);
  const keyMatch =
    text.match(/\b(\d{1,2}[AB])\b/i) ||
    text.match(/\b([A-G][#b]?(?:\s*(?:major|minor|maj|min|m))?)\b/i);
  return {
    bpm: bpmMatch ? parseInt(bpmMatch[1], 10) : undefined,
    key: keyMatch ? keyMatch[1].toUpperCase().replace(/\s+/g, '') : undefined,
  };
}

function bestCoverImage(images?: DiscogsImage[]): string | undefined {
  if (!images?.length) return undefined;
  const primary = images.find((image) => image.type === 'primary');
  return primary?.uri || images[0]?.uri;
}

function parseCollectionRelease(item: DiscogsCollectionItemRaw): DirectDiscogsCollectionRelease {
  const info = item.basic_information;
  const artist =
    info.artists?.map((entry) => entry.name).join(', ') ||
    info.title?.split(' - ')[0]?.trim() ||
    'Unknown';

  return {
    discogsId: info.id,
    artist,
    title: info.title?.trim() || 'Untitled',
    year: info.year ? String(info.year) : undefined,
    format: pickVinylFormatLabel(info.formats),
    isCdOnly: isCdOnlyDiscogsFormats(info.formats),
    coverUrl: info.cover_image || info.thumb || undefined,
    genres: [...new Set([...(info.genres ?? []), ...(info.styles ?? [])])].slice(0, 12),
  };
}

function mapReleaseDetail(data: DiscogsReleaseRaw): DirectDiscogsReleaseDetail {
  const meta = extractBpmKey(data.notes, data.tracklist);
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
    tracklist: data.tracklist,
  };
}

export async function directSearchDiscogs(
  token: string,
  query: string,
  perPage = 16
): Promise<DiscogsSearchHit[]> {
  const params = new URLSearchParams({
    q: query,
    type: 'release',
    page: '1',
    per_page: String(perPage),
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: discogsHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs search failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).map(parseSearchResult);
}

export async function directSearchDiscogsByBarcode(
  token: string,
  barcode: string,
  perPage = 5
): Promise<DiscogsSearchHit[]> {
  const params = new URLSearchParams({
    barcode,
    type: 'release',
    per_page: String(perPage),
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: discogsHeaders(token),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs barcode search failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).map(parseSearchResult);
}

export async function directFetchDiscogsRelease(
  token: string,
  id: number
): Promise<DirectDiscogsReleaseDetail> {
  const res = await fetch(`${DISCOGS_API}/releases/${id}`, {
    headers: discogsHeaders(token),
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 429) {
    throw new Error('Discogs rate limit reached — wait a moment and try again');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs release failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as DiscogsReleaseRaw;
  return mapReleaseDetail(data);
}

export async function directFetchDiscogsCollectionPage(
  token: string,
  username: string,
  page = 1,
  perPage = 100
): Promise<DirectDiscogsCollectionPageResult> {
  const user = encodeURIComponent(username.trim());
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(Math.min(100, Math.max(1, perPage))),
  });
  const res = await fetch(
    `${DISCOGS_API}/users/${user}/collection/folders/${COLLECTION_FOLDER_ALL}/releases?${params}`,
    { headers: discogsHeaders(token) }
  );
  if (res.status === 404) {
    throw new Error('Discogs user not found. Check the username and try again.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs collection failed: ${res.status} ${text}`);
  }
  const data = (await res.json()) as {
    releases?: DiscogsCollectionItemRaw[];
    pagination?: DirectDiscogsCollectionPageResult['pagination'];
  };

  return {
    releases: (data.releases ?? []).map(parseCollectionRelease),
    pagination: data.pagination ?? { page: 1, pages: 1, per_page: perPage, items: 0 },
  };
}