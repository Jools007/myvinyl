/** Dev playback event log — inspect via Copy debug info or `window.__MYVINYL_PLAYBACK__.report()` */

export type PlaybackDiagEvent = {
  t: number;
  event: string;
  detail?: Record<string, unknown>;
};

const MAX_EVENTS = 150;
const events: PlaybackDiagEvent[] = [];

export type PlaybackDiagSnapshot = {
  status: string | null;
  source: string | null;
  activeKey: string | null;
  attachedVideoId: string | null;
  lastApiVideoId: string | null;
  lastApiTitle: string | null;
  lastLoadArtist: string | null;
  lastLoadTrack: string | null;
  lastLoadSource: string | null;
  failedVideoIds: string[];
  youtubeMode: string | null;
  playerState: number | null;
  activelyPlaying: boolean;
  elapsed: number;
  duration: number;
  diagHint: string | null;
  pageHidden: boolean;
};

let snapshot: PlaybackDiagSnapshot = {
  status: null,
  source: null,
  activeKey: null,
  attachedVideoId: null,
  lastApiVideoId: null,
  lastApiTitle: null,
  lastLoadArtist: null,
  lastLoadTrack: null,
  lastLoadSource: null,
  failedVideoIds: [],
  youtubeMode: null,
  playerState: null,
  activelyPlaying: false,
  elapsed: 0,
  duration: 0,
  diagHint: null,
  pageHidden: false,
};

export function playbackDiag(event: string, detail?: Record<string, unknown>): void {
  const entry: PlaybackDiagEvent = { t: Date.now(), event, detail };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  if (import.meta.env.DEV) {
    console.log(`[playback] ${event}`, detail ?? '');
  }
}

export function updatePlaybackDiagSnapshot(patch: Partial<PlaybackDiagSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
}

export function playbackDiagHosts(): Record<string, unknown>[] {
  return [...document.querySelectorAll('.play-dj__yt-host')].map((host) => {
    const rect = host.getBoundingClientRect();
    const iframe = host.querySelector('iframe');
    const src = iframe?.src ?? '';
    return {
      id: host.id,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      iframeSrc: src.length > 200 ? `${src.slice(0, 200)}…` : src,
      autoplay: src.includes('autoplay=1'),
      mute: src.includes('mute=1'),
    };
  });
}

function playbackDiagSummary(): Record<string, unknown> {
  const { attachedVideoId, lastApiVideoId, failedVideoIds } = snapshot;
  const videoMismatch =
    attachedVideoId != null &&
    lastApiVideoId != null &&
    attachedVideoId !== lastApiVideoId;

  const hints: string[] = [];
  if (videoMismatch) {
    hints.push(
      `Attached ${attachedVideoId} but API returned ${lastApiVideoId} — stale player`
    );
  }
  if (failedVideoIds.includes(attachedVideoId ?? '')) {
    hints.push(`Attached video ${attachedVideoId} is in failed list`);
  }
  if (snapshot.pageHidden) {
    hints.push('Page hidden — browser may pause embed audio');
  }
  if (snapshot.status === 'playing' && !snapshot.activelyPlaying) {
    hints.push('UI playing but YouTube state is not PLAYING/BUFFERING — silent embed');
  }


  return {
    videoMismatch,
    hints,
    attachedVideoId,
    lastApiVideoId,
    failedVideoIds,
  };
}

export function getPlaybackDiagReport(): Record<string, unknown> {
  const root = document.getElementById('play-yt-root');
  const rootRect = root?.getBoundingClientRect();
  return {
    at: new Date().toISOString(),
    href: typeof window !== 'undefined' ? window.location.href : '',
    snapshot: {
      ...snapshot,
      pageHidden:
        typeof document !== 'undefined' ? document.hidden : snapshot.pageHidden,
    },
    summary: playbackDiagSummary(),
    events: [...events],
    ytRoot: rootRect
      ? {
          w: Math.round(rootRect.width),
          h: Math.round(rootRect.height),
          x: Math.round(rootRect.x),
          y: Math.round(rootRect.y),
        }
      : null,
    ytHosts: playbackDiagHosts(),
  };
}

export function installPlaybackDiagGlobal(): void {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;
  const w = window as Window & {
    __MYVINYL_PLAYBACK__?: {
      report: () => unknown;
      events: () => PlaybackDiagEvent[];
      snapshot: () => PlaybackDiagSnapshot;
    };
  };
  w.__MYVINYL_PLAYBACK__ = {
    report: getPlaybackDiagReport,
    events: () => [...events],
    snapshot: () => ({ ...snapshot }),
  };

  document.addEventListener('visibilitychange', () => {
    updatePlaybackDiagSnapshot({ pageHidden: document.hidden });
    playbackDiag('page_visibility', { hidden: document.hidden });
  });
}

installPlaybackDiagGlobal();