import {
  bestCoverImage,
  extractBpmKey,
  getRelease,
  getUserCollectionPage,
  parseCollectionRelease,
  parseSearchResult,
  searchDiscogs,
  searchDiscogsByBarcode,
} from './client';
import { resolveDiscogsCoverUrl } from './cover';
import { flattenDiscogsTracklist } from './tracklist';

export function mapDiscogsReleaseDetail(data: {
  id: number;
  title: string;
  artists?: { name: string }[];
  year?: number;
  genres?: string[];
  styles?: string[];
  notes?: string;
  images?: { uri: string; type: string }[];
  tracklist?: Parameters<typeof flattenDiscogsTracklist>[0];
}) {
  const tracklist = flattenDiscogsTracklist(data.tracklist).filter((row) =>
    Boolean(row.title?.trim())
  );
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
    coverUrl: resolveDiscogsCoverUrl(bestCoverImage(data.images)),
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

export async function handleDiscogsRelease(token: string, id: number) {
  const raw = await getRelease(token, id);
  return mapDiscogsReleaseDetail(raw);
}

export async function handleDiscogsSearch(
  token: string,
  opts: { q?: string; barcode?: string; perPage?: number }
) {
  const perPage = opts.perPage ?? (opts.barcode ? 5 : 16);
  const data = opts.barcode?.trim()
    ? await searchDiscogsByBarcode(token, opts.barcode.trim(), perPage)
    : await searchDiscogs(token, opts.q?.trim() ?? '', 1, perPage);

  return (data.results ?? []).map(parseSearchResult);
}

export async function handleDiscogsCollectionPage(
  token: string,
  username: string,
  page: number,
  perPage: number
) {
  const data = await getUserCollectionPage(token, username, page, perPage);
  return {
    releases: (data.releases ?? []).map(parseCollectionRelease),
    pagination: data.pagination ?? { page: 1, pages: 1, per_page: perPage, items: 0 },
  };
}