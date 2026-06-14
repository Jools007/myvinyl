/** Dev playback event log — inspect via `window.__MYVINYL_PLAYBACK__.report()` */

export type PlaybackDiagEvent = {
  t: number;
  event: string;
  detail?: Record<string, unknown>;
};

const MAX_EVENTS = 100;
const events: PlaybackDiagEvent[] = [];

export function playbackDiag(event: string, detail?: Record<string, unknown>): void {
  const entry: PlaybackDiagEvent = { t: Date.now(), event, detail };
  events.push(entry);
  if (events.length > MAX_EVENTS) events.shift();
  if (import.meta.env.DEV) {
    console.log(`[playback] ${event}`, detail ?? '');
  }
}

export function playbackDiagHosts(): Record<string, unknown>[] {
  return [...document.querySelectorAll('.play-dj__yt-host')].map((host) => {
    const rect = host.getBoundingClientRect();
    const iframe = host.querySelector('iframe');
    return {
      id: host.id,
      w: Math.round(rect.width),
      h: Math.round(rect.height),
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      iframeSrc: iframe?.src?.slice(0, 120) ?? null,
    };
  });
}

export function getPlaybackDiagReport(): Record<string, unknown> {
  const root = document.getElementById('play-yt-root');
  const rootRect = root?.getBoundingClientRect();
  return {
    at: new Date().toISOString(),
    href: typeof window !== 'undefined' ? window.location.href : '',
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
  const w = window as Window & { __MYVINYL_PLAYBACK__?: { report: () => unknown; events: () => PlaybackDiagEvent[] } };
  w.__MYVINYL_PLAYBACK__ = {
    report: getPlaybackDiagReport,
    events: () => [...events],
  };
}

installPlaybackDiagGlobal();