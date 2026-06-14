import { resolveDiscogsCoverUrl } from '../discogsCover';
import { normalizeGenre } from '../filterLabels';
import type { VinylRecord } from '../types';
import { BANNER } from './theme';

export type CachedImage = {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
};

export type ImageCache = Map<string, CachedImage | null>;

export const PDF_ASSETS = {
  coverTexture: '/images/pdf/cover-vinyl-macro.jpg',
  placeholderSleeve: '/images/pdf/placeholder-sleeve.jpg',
  sectionInsights: '/images/pdf/section-insights.jpg',
  sectionCatalog: '/images/pdf/section-catalog.jpg',
  sectionDj: '/images/pdf/section-dj.jpg',
} as const;

const BANNER_SIZES: Partial<Record<string, { w: number; h: number }>> = {
  [PDF_ASSETS.coverTexture]: BANNER.cover,
  [PDF_ASSETS.sectionInsights]: BANNER.insights,
  [PDF_ASSETS.sectionCatalog]: BANNER.catalog,
  [PDF_ASSETS.sectionDj]: BANNER.dj,
};

const GENRE_PLACEHOLDER: Record<string, string> = {
  house: PDF_ASSETS.sectionDj,
  techno: PDF_ASSETS.sectionDj,
  'hip-hop': PDF_ASSETS.sectionCatalog,
  jazz: PDF_ASSETS.sectionInsights,
  soul: PDF_ASSETS.sectionInsights,
  funk: PDF_ASSETS.sectionCatalog,
  disco: PDF_ASSETS.sectionDj,
};

function imageProxyUrl(sourceUrl: string): string {
  return `/api/image?url=${encodeURIComponent(sourceUrl)}`;
}

function dataUrlFormat(dataUrl: string): 'JPEG' | 'PNG' {
  return dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
}

/** object-fit: cover into a fixed box — never squash. */
function rasterizeCoverFit(
  img: HTMLImageElement,
  width: number,
  height: number,
  bg = '#1c1916',
  quality = 0.9
): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);

  const scale = Math.max(width / img.width, height / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (width - w) / 2, (height - h) / 2, w, h);

  try {
    return canvas.toDataURL('image/jpeg', quality);
  } catch {
    return null;
  }
}

function rasterizeSquareCover(img: HTMLImageElement, size: number): string | null {
  return rasterizeCoverFit(img, size, size, '#1c1916', 0.88);
}

function loadImageElement(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadRasterizedAsset(
  path: string,
  width: number,
  height: number
): Promise<CachedImage | null> {
  const img = await loadImageElement(new URL(path, window.location.origin).href);
  if (!img) return null;
  const dataUrl = rasterizeCoverFit(img, width, height, '#201c18', 0.92);
  if (!dataUrl) return null;
  return { dataUrl, format: dataUrlFormat(dataUrl) };
}

async function loadSquareAsset(path: string, size: number): Promise<CachedImage | null> {
  const img = await loadImageElement(new URL(path, window.location.origin).href);
  if (!img) return null;
  const dataUrl = rasterizeSquareCover(img, size);
  if (!dataUrl) return null;
  return { dataUrl, format: dataUrlFormat(dataUrl) };
}

async function loadCoverDataUrl(sourceUrl: string): Promise<CachedImage | null> {
  const directUrl = resolveDiscogsCoverUrl(sourceUrl);
  if (!directUrl) return null;

  const img = await loadImageElement(directUrl);
  if (img) {
    const dataUrl = rasterizeSquareCover(img, 160);
    if (dataUrl) return { dataUrl, format: 'JPEG' };
  }

  try {
    const response = await fetch(imageProxyUrl(directUrl), { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    const objectUrl = URL.createObjectURL(blob);
    const proxied = await loadImageElement(objectUrl);
    URL.revokeObjectURL(objectUrl);
    if (!proxied) return null;
    const dataUrl = rasterizeSquareCover(proxied, 160);
    if (!dataUrl) return null;
    return { dataUrl, format: 'JPEG' };
  } catch {
    return null;
  }
}

export function placeholderForRecord(record: VinylRecord): string {
  const genre = normalizeGenre(record.genres[0] ?? '').toLowerCase();
  for (const [key, asset] of Object.entries(GENRE_PLACEHOLDER)) {
    if (genre.includes(key)) return asset;
  }
  return PDF_ASSETS.placeholderSleeve;
}

export async function preloadPdfImages(
  records: VinylRecord[],
  onProgress?: (message: string) => void
): Promise<ImageCache> {
  const cache: ImageCache = new Map();

  onProgress?.('Loading PDF artwork…');

  await Promise.all(
    Object.values(PDF_ASSETS).map(async (path) => {
      const banner = BANNER_SIZES[path];
      const loaded = banner
        ? await loadRasterizedAsset(path, banner.w, banner.h)
        : await loadSquareAsset(path, 480);
      cache.set(path, loaded);
    })
  );

  const coverUrls = [
    ...new Set(
      records
        .map((r) => resolveDiscogsCoverUrl(r.coverUrl))
        .filter((url): url is string => Boolean(url))
    ),
  ];

  onProgress?.(`Sleeves ${coverUrls.length > 0 ? '0' : '—'} / ${coverUrls.length}`);

  for (let i = 0; i < coverUrls.length; i += 6) {
    const chunk = coverUrls.slice(i, i + 6);
    await Promise.all(
      chunk.map(async (url) => cache.set(url, await loadCoverDataUrl(url)))
    );
    onProgress?.(`Sleeves ${Math.min(i + chunk.length, coverUrls.length)} / ${coverUrls.length}`);
  }

  return cache;
}

export function coverForRecord(record: VinylRecord, cache: ImageCache): CachedImage | null {
  const url = resolveDiscogsCoverUrl(record.coverUrl);
  if (url) {
    const hit = cache.get(url);
    if (hit) return hit;
  }
  return (
    cache.get(placeholderForRecord(record)) ??
    cache.get(PDF_ASSETS.placeholderSleeve) ??
    null
  );
}

export function assetFromCache(cache: ImageCache, path: string): CachedImage | null {
  return cache.get(path) ?? null;
}