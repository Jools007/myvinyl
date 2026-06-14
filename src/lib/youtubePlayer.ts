/** YouTube preview playback — IFrame API for reliable play/pause/sound; simple embed as fallback. */

const YT_SCRIPT = 'https://www.youtube.com/iframe_api';
const YT_EMBED_HOST = 'https://www.youtube.com';

type YTPlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
};

type YTNamespace = {
  Player: new (
    elementId: string,
    options: {
      height: string | number;
      width: string | number;
      videoId: string;
      playerVars?: Record<string, number | string>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { data: number; target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    }
  ) => YTPlayer;
  PlayerState: {
    ENDED: number;
    PLAYING: number;
    PAUSED: number;
    BUFFERING: number;
    CUED: number;
    UNSTARTED: number;
  };
};

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiReady: Promise<void> | null = null;
let hostCounter = 0;
let hostParent: HTMLElement | null = null;

function pageOrigin(): string {
  return window.location.origin || `${window.location.protocol}//${window.location.host}`;
}

/** IFrame API postMessage requires an exact origin match — skip on local dev hosts. */
function preferSimpleIframe(): boolean {
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

function loadYouTubeIframeApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiReady) return apiReady;

  apiReady = new Promise((resolve) => {
    const done = () => resolve();
    if (window.YT?.Player) {
      done();
      return;
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      done();
    };
    if (!document.querySelector(`script[src="${YT_SCRIPT}"]`)) {
      const tag = document.createElement('script');
      tag.src = YT_SCRIPT;
      tag.async = true;
      document.head.appendChild(tag);
    }
  });

  return apiReady;
}

function getHostParent(): HTMLElement {
  if (!hostParent) {
    hostParent = document.getElementById('play-yt-root');
    if (!hostParent) {
      hostParent = document.createElement('div');
      hostParent.id = 'play-yt-root';
      hostParent.className = 'play-dj__yt-root';
      document.body.appendChild(hostParent);
    }
  }
  return hostParent;
}

function createHostElement(): { id: string; el: HTMLElement } {
  const id = `play-yt-host-${++hostCounter}`;
  const el = document.createElement('div');
  el.id = id;
  el.className = 'play-dj__yt-host';
  el.setAttribute('aria-hidden', 'true');
  getHostParent().appendChild(el);
  return { id, el };
}

function buildEmbedSrc(
  videoId: string,
  autoplay: boolean,
  muted: boolean,
  startSec = 0
): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
    iv_load_policy: '3',
  });
  if (startSec > 0) params.set('start', String(Math.floor(startSec)));
  return `${YT_EMBED_HOST}/embed/${videoId}?${params}`;
}

const YT_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure *';

export type YouTubePlayerHandlers = {
  onReady?: () => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnded?: () => void;
  onError?: (code?: number) => void;
  onMutedChange?: (muted: boolean) => void;
};

export type YouTubePlayerOptions = {
  autoplay?: boolean;
  enableSound?: boolean;
};

export class YouTubePreviewPlayer {
  private player: YTPlayer | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private hostEl: HTMLElement | null = null;
  private mode: 'api' | 'iframe' = 'api';
  private readyFired = false;
  private abandoned = false;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly videoId: string;
  private readonly handlers: YouTubePlayerHandlers;
  private soundEnabled = false;
  private iframeStartSec = 0;
  private iframePlayStartedAt = 0;

  constructor(videoId: string, handlers: YouTubePlayerHandlers, opts?: YouTubePlayerOptions) {
    this.videoId = videoId;
    this.handlers = handlers;
    this.soundEnabled = opts?.enableSound === true;
    void this.initApi();
  }

  private clearInitTimeout(): void {
    if (this.initTimeout != null) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
  }

  private markReady(): void {
    if (this.readyFired) return;
    this.readyFired = true;
    this.clearInitTimeout();
    this.handlers.onReady?.();
  }

  private notifyMuted(): void {
    this.handlers.onMutedChange?.(!this.soundEnabled);
  }

  private mountIframeFallback(autoplay: boolean): void {
    this.abandoned = false;
    this.mode = 'iframe';
    this.player = null;

    const { el } = createHostElement();
    this.hostEl = el;
    const iframe = document.createElement('iframe');
    iframe.className = 'play-dj__yt-frame';
    iframe.title = 'Track audio preview';
    iframe.allow = YT_IFRAME_ALLOW;
    iframe.allowFullscreen = true;
    const muted = !this.soundEnabled;
    iframe.src = buildEmbedSrc(this.videoId, autoplay, muted);
    el.appendChild(iframe);
    this.iframe = iframe;

    iframe.addEventListener('load', () => {
      this.markReady();
    });
  }

  private startIframePlayback(startSec = this.iframeStartSec): void {
    if (!this.iframe) return;
    const muted = !this.soundEnabled;
    this.iframeStartSec = Math.max(0, startSec);
    this.iframePlayStartedAt = Date.now();
    const next = buildEmbedSrc(this.videoId, true, muted, this.iframeStartSec);
    if (this.iframe.src !== next) this.iframe.src = next;
    this.handlers.onPlaying?.();
    this.notifyMuted();
  }

  private async initApi(): Promise<void> {
    if (preferSimpleIframe()) {
      this.mountIframeFallback(false);
      return;
    }

    this.initTimeout = setTimeout(() => {
      if (!this.readyFired) {
        this.abandoned = true;
        this.destroyHostOnly();
        this.mountIframeFallback(false);
      }
    }, 8_000);

    await loadYouTubeIframeApi();
    const YT = window.YT;
    if (!YT?.Player) {
      this.clearInitTimeout();
      this.mountIframeFallback(false);
      return;
    }

    const { id, el } = createHostElement();
    this.hostEl = el;

    try {
      const instance = new YT.Player(id, {
        height: 180,
        width: 320,
        videoId: this.videoId,
        playerVars: {
          autoplay: 0,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          playsinline: 1,
          rel: 0,
          enablejsapi: 1,
          origin: pageOrigin(),
          mute: this.soundEnabled ? 0 : 1,
        },
        events: {
          onReady: (e) => {
            if (this.abandoned) return;
            this.player = e.target;
            if (!this.soundEnabled) {
              try {
                e.target.mute();
              } catch {
                /* ignore */
              }
            }
            this.markReady();
            this.notifyMuted();
          },
          onStateChange: (e) => {
            if (this.abandoned) return;
            const { ENDED, PLAYING, PAUSED, BUFFERING } = YT.PlayerState;
            if (e.data === PLAYING || e.data === BUFFERING) {
              this.handlers.onPlaying?.();
              this.notifyMuted();
            } else if (e.data === PAUSED) {
              this.handlers.onPaused?.();
            } else if (e.data === ENDED) {
              this.handlers.onEnded?.();
            }
          },
          onError: (e) => {
            if (e.data === 101 || e.data === 150 || e.data === 2 || e.data === 100) {
              this.clearInitTimeout();
              this.destroyHostOnly();
              this.mountIframeFallback(false);
              return;
            }
            this.handlers.onError?.(e.data);
          },
        },
      });
      this.player = instance;
    } catch {
      this.clearInitTimeout();
      this.mountIframeFallback(false);
    }
  }

  private destroyHostOnly(): void {
    try {
      this.player?.stopVideo?.();
      this.player?.destroy?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.iframe = null;
    if (this.hostEl?.parentNode) {
      this.hostEl.parentNode.removeChild(this.hostEl);
    }
    this.hostEl = null;
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  /** Prime play from a user-gesture handler (iOS / loading state). */
  armPlay(enableSound = true): void {
    if (enableSound) this.soundEnabled = true;
    if (this.readyFired) this.play(enableSound);
  }

  private isApiPlaying(): boolean {
    try {
      const YT = window.YT;
      if (!YT || !this.player) return false;
      const state = this.player.getPlayerState();
      return state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
    } catch {
      return false;
    }
  }

  /** Sync — call directly from a click handler for unmuted playback. */
  enableSound(): void {
    this.soundEnabled = true;
    if (this.mode === 'iframe') {
      this.startIframePlayback();
      return;
    }
    try {
      this.player?.unMute();
      if (!this.isApiPlaying()) this.player?.playVideo();
    } catch {
      /* ignore */
    }
    this.notifyMuted();
  }

  /** Sync — call directly from a click handler. */
  play(enableSound = false): void {
    if (enableSound) this.soundEnabled = true;
    if (!this.readyFired) return;

    if (this.mode === 'iframe') {
      this.startIframePlayback();
      return;
    }

    try {
      if (!this.soundEnabled) this.player?.mute();
      else this.player?.unMute();
      this.player?.playVideo();
      this.notifyMuted();
    } catch {
      /* ignore */
    }
  }

  pause(): void {
    if (this.mode === 'iframe' && this.iframe) {
      const muted = !this.soundEnabled;
      this.iframe.src = buildEmbedSrc(this.videoId, false, muted);
      this.handlers.onPaused?.();
      return;
    }
    try {
      this.player?.pauseVideo();
    } catch {
      /* ignore */
    }
  }

  seekStart(): void {
    this.seekTo(0);
  }

  seekTo(seconds: number): void {
    const t = Math.max(0, seconds);
    if (this.mode === 'iframe') {
      this.startIframePlayback(t);
      return;
    }
    try {
      this.player?.seekTo(t, true);
    } catch {
      /* ignore */
    }
  }

  getCurrentTime(): number {
    if (this.mode === 'iframe' && this.iframePlayStartedAt > 0) {
      return this.iframeStartSec + (Date.now() - this.iframePlayStartedAt) / 1000;
    }
    try {
      const t = this.player?.getCurrentTime?.();
      return typeof t === 'number' && Number.isFinite(t) ? t : 0;
    } catch {
      return 0;
    }
  }

  getDuration(): number {
    try {
      const d = this.player?.getDuration?.();
      return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0;
    } catch {
      return 0;
    }
  }

  destroy(): void {
    this.abandoned = true;
    this.clearInitTimeout();
    if (this.iframe) {
      this.iframe.src = 'about:blank';
    }
    this.destroyHostOnly();
    this.readyFired = false;
  }
}