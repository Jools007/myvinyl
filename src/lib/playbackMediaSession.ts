export type PlaybackMediaSessionMeta = {
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
};

export type PlaybackMediaSessionHandlers = {
  onPlay?: () => void;
  onPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
};

function absoluteArtworkUrl(url: string | undefined): string | undefined {
  const trimmed = url?.trim();
  if (!trimmed) return undefined;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (typeof window === 'undefined') return trimmed;
  try {
    return new URL(trimmed, window.location.origin).href;
  } catch {
    return undefined;
  }
}

export function isPlaybackMediaSessionSupported(): boolean {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator;
}

const MYVINYL_ALBUM_SUFFIX = ' · MyVinyl';

export function formatMyVinylAlbumLabel(album: string): string {
  const trimmed = album.trim();
  if (!trimmed) return 'MyVinyl';
  return trimmed.endsWith(MYVINYL_ALBUM_SUFFIX) ? trimmed : `${trimmed}${MYVINYL_ALBUM_SUFFIX}`;
}

export function updatePlaybackMediaSession(
  meta: PlaybackMediaSessionMeta | null,
  playbackState: MediaSessionPlaybackState = 'none'
): void {
  if (!isPlaybackMediaSessionSupported()) return;
  const session = navigator.mediaSession;

  if (!meta) {
    session.metadata = null;
    session.playbackState = 'none';
    clearPlaybackPositionState();
    return;
  }

  const artwork = absoluteArtworkUrl(meta.artworkUrl);
  session.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: formatMyVinylAlbumLabel(meta.album),
    artwork: artwork
      ? [
          { src: artwork, sizes: '512x512', type: 'image/jpeg' },
          { src: artwork, sizes: '256x256', type: 'image/jpeg' },
        ]
      : undefined,
  });
  session.playbackState = playbackState;
}

export function updatePlaybackPositionState(
  duration: number,
  position: number,
  playbackRate = 1
): void {
  if (!isPlaybackMediaSessionSupported()) return;
  if (!Number.isFinite(duration) || duration <= 0) return;
  try {
    navigator.mediaSession.setPositionState({
      duration,
      playbackRate,
      position: Math.max(0, Math.min(position, duration)),
    });
  } catch {
    /* setPositionState unsupported on this browser */
  }
}

export function clearPlaybackPositionState(): void {
  if (!isPlaybackMediaSessionSupported()) return;
  if (!('setPositionState' in navigator.mediaSession)) return;
  try {
    navigator.mediaSession.setPositionState({
      duration: 0,
      playbackRate: 1,
      position: 0,
    });
  } catch {
    /* ignore */
  }
}

export function bindPlaybackMediaSessionHandlers(
  handlers: PlaybackMediaSessionHandlers
): () => void {
  if (!isPlaybackMediaSessionSupported()) return () => {};

  const session = navigator.mediaSession;
  const actionHandlers: Array<[MediaSessionAction, (() => void) | null]> = [
    ['play', handlers.onPlay ?? null],
    ['pause', handlers.onPause ?? null],
    ['seekbackward', handlers.onSeekBackward ?? null],
    ['seekforward', handlers.onSeekForward ?? null],
  ];

  for (const [action, handler] of actionHandlers) {
    try {
      session.setActionHandler(action, handler);
    } catch {
      /* action not supported on this platform */
    }
  }

  return () => {
    for (const [action] of actionHandlers) {
      try {
        session.setActionHandler(action, null);
      } catch {
        /* ignore */
      }
    }
  };
}