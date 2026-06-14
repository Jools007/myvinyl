import { resolveDiscogsCoverUrl } from '../discogsCover';
import { normalizeGenre } from '../filterLabels';
import type { VinylRecord } from '../types';

export type ImageCache = Map<string, string | null>;

export const PDF_ASSETS = {
  coverTexture: '/images/pdf/cover-vinyl-macro.jpg',
  placeholderSleeve: '/images/pdf/placeholder-sleeve.jpg',
  sectionInsights: '/images/pdf/section-insights.jpg',
  sectionCatalog: '/images/pdf/section-catalog.jpg',
  sectionDj: '/images/pdf/section-dj.jpg',
} as const;

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

function drawSquareCover(img: HTMLImageElement, maxSize: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#1c1916';
  ctx.fillRect(0, 0, maxSize, maxSize);
  const scale = Math.max(maxSize / img.width, maxSize / img.height);
  const w = img.width * scale;
  const h = img.height * scale;
  ctx.drawImage(img, (maxSize - w) / 2, (maxSize - h) / 2, w, h);
  try {
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch {
    return null;
  }
}

function loadCoverFromImageElement(url: string, maxSize = 160): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(drawSquareCover(img, maxSize));
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadStaticAssetDataUrl(path: string, maxSize = 160): Promise<string | null> {
  return loadCoverFromImageElement(new URL(path, window.location.origin).href, maxSize);
}

async function loadCoverDataUrl(sourceUrl: string): Promise<string | null> {
  const directUrl = resolveDiscogsCoverUrl(sourceUrl);
  if (!directUrl) return null;

  const fromBrowser = await loadCoverFromImageElement(directUrl);
  if (fromBrowser) return fromBrowser;

  try {
    const response = await fetch(imageProxyUrl(directUrl), { credentials: 'same-origin' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(drawSquareCover(img, 160));
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(null);
      };
      img.src = objectUrl;
    });
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

  const staticAssets = Object.values(PDF_ASSETS);
  await Promise.all(
    staticAssets.map(async (path) => {
      cache.set(path, await loadStaticAssetDataUrl(path, 480));
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
    await Promise.all(chunk.map(async (url) => cache.set(url, await loadCoverDataUrl(url))));
    onProgress?.(`Sleeves ${Math.min(i + chunk.length, coverUrls.length)} / ${coverUrls.length}`);
  }

  return cache;
}

export function coverForRecord(record: VinylRecord, cache: ImageCache): string | null {
  const url = resolveDiscogsCoverUrl(record.coverUrl);
  if (url) {
    const hit = cache.get(url);
    if (hit) return hit;
  }
  return cache.get(placeholderForRecord(record)) ?? cache.get(PDF_ASSETS.placeholderSleeve) ?? null;
}