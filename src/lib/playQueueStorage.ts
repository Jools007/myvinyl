import type { PlaySelection } from './playSession';

const PLAY_QUEUE_KEY = 'myvinyl:play-queue';
const NOW_PLAYING_KEY = 'myvinyl:now-playing';

function isValidPlaySelection(item: unknown): item is PlaySelection {
  return (
    !!item &&
    typeof item === 'object' &&
    typeof (item as PlaySelection).recordId === 'string' &&
    typeof (item as PlaySelection).trackId === 'string'
  );
}

export function loadPlayQueue(): PlaySelection[] {
  if (typeof sessionStorage === 'undefined') return [];
  try {
    const raw = sessionStorage.getItem(PLAY_QUEUE_KEY);
    if (!raw) return [];
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

export function savePlayQueue(queue: PlaySelection[]): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (queue.length === 0) {
      sessionStorage.removeItem(PLAY_QUEUE_KEY);
      return;
    }
    sessionStorage.setItem(PLAY_QUEUE_KEY, JSON.stringify(queue));
  } catch {
    /* quota or private mode */
  }
}

export function clearPlayQueueStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PLAY_QUEUE_KEY);
  } catch {
    /* ignore */
  }
}

export function loadNowPlaying(): PlaySelection | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(NOW_PLAYING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return isValidPlaySelection(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveNowPlaying(ref: PlaySelection | null): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (!ref) {
      sessionStorage.removeItem(NOW_PLAYING_KEY);
      return;
    }
    sessionStorage.setItem(NOW_PLAYING_KEY, JSON.stringify(ref));
  } catch {
    /* quota or private mode */
  }
}

export function clearNowPlayingStorage(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(NOW_PLAYING_KEY);
  } catch {
    /* ignore */
  }
}