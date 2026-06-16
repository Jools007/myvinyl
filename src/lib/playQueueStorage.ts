import type { PlaySelection } from './playSession';

const PLAY_QUEUE_KEY = 'myvinyl:play-queue';
const NOW_PLAYING_KEY = 'myvinyl:now-playing';

function scopedKey(base: string, collectionId?: string | null): string {
  if (!collectionId) return base;
  return `${base}:${collectionId}`;
}

function isValidPlaySelection(item: unknown): item is PlaySelection {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as PlaySelection).recordId === 'string' &&
    typeof (item as PlaySelection).trackId === 'string'
  );
}

function parsePlayQueue(raw: string | null): PlaySelection[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as PlaySelection[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        item &&
        typeof item.recordId === 'string' &&
        typeof item.trackId === 'string'
    );
  } catch {
    return [];
  }
}

export function loadPlayQueue(collectionId?: string | null): PlaySelection[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const scoped = parsePlayQueue(
      sessionStorage.getItem(scopedKey(PLAY_QUEUE_KEY, collectionId))
    );
    if (scoped.length > 0 || collectionId) return scoped;
    return parsePlayQueue(sessionStorage.getItem(PLAY_QUEUE_KEY));
  } catch {
    return [];
  }
}

export function savePlayQueue(queue: PlaySelection[], collectionId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = scopedKey(PLAY_QUEUE_KEY, collectionId);
    if (queue.length === 0) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(queue));
  } catch {
    /* quota or private mode */
  }
}

export function clearPlayQueueStorage(collectionId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(scopedKey(PLAY_QUEUE_KEY, collectionId));
    if (!collectionId) sessionStorage.removeItem(PLAY_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadNowPlaying(collectionId?: string | null): PlaySelection | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const scopedRaw = sessionStorage.getItem(scopedKey(NOW_PLAYING_KEY, collectionId));
    if (scopedRaw) {
      const parsed = JSON.parse(scopedRaw) as unknown;
      return isValidPlaySelection(parsed) ? parsed : null;
    }
    if (collectionId) return null;
    const legacyRaw = sessionStorage.getItem(NOW_PLAYING_KEY);
    if (!legacyRaw) return null;
    const parsed = JSON.parse(legacyRaw) as unknown;
    return isValidPlaySelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNowPlaying(ref: PlaySelection | null, collectionId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const key = scopedKey(NOW_PLAYING_KEY, collectionId);
    if (!ref) {
      sessionStorage.removeItem(key);
      return;
    }
    sessionStorage.setItem(key, JSON.stringify(ref));
  } catch {
    /* quota or private mode */
  }
}

export function clearNowPlayingStorage(collectionId?: string | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(scopedKey(NOW_PLAYING_KEY, collectionId));
    if (!collectionId) sessionStorage.removeItem(NOW_PLAYING_KEY);
  } catch {
    /* ignore */
  }
}