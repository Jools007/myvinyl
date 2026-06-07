/** Discogs image CDN hosts (direct <img src> on static hosting). */
const DISCOGS_IMAGE_HOSTS = new Set(['i.discogs.com', 'img.discogs.com']);

const PROXY_IMAGE_PATH = /\/api\/image\b/i;

function decodeUrlSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function extractNestedUrl(value: string): string | undefined {
  const queryMatch = value.match(/[?&]url=([^&]+)/i);
  if (!queryMatch?.[1]) return undefined;
  const nested = decodeUrlSafe(queryMatch[1]).trim();
  return nested && nested !== value ? nested : undefined;
}

/** Unwrap legacy `/api/image?url=` proxy URLs (stored in DB or nested). */
function unwrapNestedImageUrl(value: string): string {
  let current = value.trim();

  for (let i = 0; i < 5; i += 1) {
    if (PROXY_IMAGE_PATH.test(current)) {
      const nested = extractNestedUrl(current);
      if (nested) {
        current = nested;
        continue;
      }
    }

    if (current.startsWith('/') && current.includes('url=')) {
      try {
        const parsed = new URL(current, 'https://myvinyl.app');
        const nested = parsed.searchParams.get('url');
        if (nested?.trim()) {
          current = decodeUrlSafe(nested.trim());
          continue;
        }
      } catch {
        break;
      }
    }

    const nested = extractNestedUrl(current);
    if (nested) {
      current = nested;
      continue;
    }

    break;
  }

  return current;
}

function normalizeProtocol(value: string): string {
  let normalized = value;
  if (normalized.startsWith('//')) normalized = `https:${normalized}`;
  if (normalized.startsWith('http://')) normalized = `https://${normalized.slice(7)}`;
  return normalized;
}

function isDiscogsImageCdnUrl(value: string): boolean {
  try {
    const { hostname, protocol } = new URL(value);
    return protocol === 'https:' && DISCOGS_IMAGE_HOSTS.has(hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Normalize Discogs CDN cover URLs for direct use in <img src> on static hosting. */
export function resolveDiscogsCoverUrl(url?: string | null): string | undefined {
  if (!url?.trim()) return undefined;

  const value = normalizeProtocol(unwrapNestedImageUrl(url.trim()));
  if (!value.startsWith('https://')) return undefined;

  // Drop non-image Discogs pages; covers must be CDN URLs (i.discogs.com).
  if (/discogs\.com/i.test(value) && !isDiscogsImageCdnUrl(value)) return undefined;

  return isDiscogsImageCdnUrl(value) ? value : undefined;
}