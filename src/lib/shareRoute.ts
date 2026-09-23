const SHARE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/;

export function isShareToken(value: string): boolean {
  return SHARE_TOKEN.test(value);
}

/** `/s/:token` — token is the URL-safe share_links.token value. */
export function parseShareToken(pathname: string): string | null {
  const trimmed = pathname.trim() || '/';
  const path = trimmed.length > 1 && trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
  const match = path.match(/^\/s\/([^/]+)$/);
  if (!match) return null;
  let token = match[1];
  try {
    token = decodeURIComponent(token);
  } catch {
    return null;
  }
  return isShareToken(token) ? token : null;
}

export function sharePath(token: string): string {
  return `/s/${encodeURIComponent(token)}`;
}

export function shareAbsoluteUrl(token: string, origin?: string): string {
  const base =
    origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}${sharePath(token)}`;
}

/** 18 random bytes, base64url, no padding (24 chars). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
