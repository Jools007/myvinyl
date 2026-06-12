import { resolveDiscogsCoverUrl } from '../discogs-cover';

export type ImageProxyResult = {
  buffer: Buffer;
  contentType: string;
};

export function parseImageProxyUrl(urlParam: string | null | undefined): string | undefined {
  if (!urlParam?.trim()) return undefined;
  try {
    return resolveDiscogsCoverUrl(decodeURIComponent(urlParam.trim()));
  } catch {
    return resolveDiscogsCoverUrl(urlParam.trim());
  }
}

export async function fetchProxiedImage(
  url: string,
  opts?: { discogsToken?: string }
): Promise<ImageProxyResult | null> {
  const headers: Record<string, string> = {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    Referer: 'https://www.discogs.com/',
  };
  if (opts?.discogsToken) {
    headers.Authorization = `Discogs token=${opts.discogsToken}`;
  }

  const response = await fetch(url, {
    headers,
    redirect: 'follow',
  });

  if (!response.ok) return null;

  const contentType = response.headers.get('content-type') ?? 'image/jpeg';
  if (!contentType.startsWith('image/')) return null;

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;

  return { buffer, contentType };
}