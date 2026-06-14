/** YouTube preview playback — IFrame API for reliable play/pause/sound; simple embed as fallback. */

import { isIOSDevice } from './playbackDevice';

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

/** iOS WebKit: dumb embed + postMessage. Desktop (incl. localhost) uses IFrame API. */
function preferSimpleIframe(): boolean {
  return isIOSDevice();
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
  if (isIOSDevice()) el.classList.add('play-dj__yt-host--touch');
  el.setAttribute('aria-hidden', 'true');
  getHostParent().appendChild(el);
  return { id, el };
}

function buildEmbedSrc(
  videoId: string,
  autoplay: boolean,
  muted: boolean,
  startSec = 0,
  jsApi = false
): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
    iv_load_policy: '3',
  });
  if (jsApi) {
    params.set('enablejsapi', '1');
    params.set('origin', pageOrigin());
  }
  if (startSec > 0) params.set('start', String(Math.floor(startSec)));
  return `${YT_EMBED_HOST}/embed/${videoId}?${params}`;
}

const YT_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; compute-pressure *';

const YT_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

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
  private iframePlaying = false;
  private messageListener: ((e: MessageEvent) => void) | null = null;

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

  private postCommand(func: string, args = ''): void {
    this.iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
  }

  private handleIframeStateChange(state: number): void {
    if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) {
      if (!this.iframePlaying) {
        this.iframePlaying = true;
        this.iframePlayStartedAt = Date.now();
        this.handlers.onPlaying?.();
        this.notifyMuted();
      }
      return;
    }

    if (state === YT_STATE.PAUSED) {
      if (this.iframePlaying) {
        this.iframePlaying = false;
        this.handlers.onPaused?.();
      }
      return;
    }

    if (state === YT_STATE.ENDED) {
      this.iframePlaying = false;
      this.handlers.onEnded?.();
    }
  }

  private parseIframeMessage(data: unknown): void {
    if (!data || typeof data !== 'object') return;
    const evt = data as Record<string, unknown>;

    if (evt.event === 'onReady') {
      this.markReady();
      this.notifyMuted();
      return;
    }

    if (evt.event === 'onStateChange') {
      this.handleIframeStateChange(Number(evt.info));
      return;
    }

    if (evt.event === 'infoDelivery' && evt.info && typeof evt.info === 'object') {
      const info = evt.info as Record<string, unknown>;
      if (typeof info.playerState === 'number') {
        this.handleIframeStateChange(info.playerState);
      }
    }
  }

  private setupIframeMessaging(): void {
    this.teardownIframeMessaging();
    this.messageListener = (e: MessageEvent) => {
      if (e.source !== this.iframe?.contentWindow) return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        this.parseIframeMessage(data);
      } catch {
        /* ignore non-JSON messages */
      }
    };
    window.addEventListener('message', this.messageListener);
  }

  private teardownIframeMessaging(): void {
    if (this.messageListener) {
      window.removeEventListener('message', this.messageListener);
      this.messageListener = null;
    }
  }

  private mountIframeFallback(autoplay: boolean): void {
    this.abandoned = false;
    this.mode = 'iframe';
    this.player = null;
    this.iframePlaying = false;
    this.iframePlayStartedAt = 0;

    const { el } = createHostElement();
    this.hostEl = el;
    const iframe = document.createElement('iframe');
    iframe.className = 'play-dj__yt-frame';
    iframe.title = 'Track audio preview';
    iframe.allow = YT_IFRAME_ALLOW;
    iframe.allowFullscreen = true;
    const muted = !this.soundEnabled;
    iframe.src = buildEmbedSrc(this.videoId, autoplay, muted, 0, true);
    el.appendChild(iframe);
    this.iframe = iframe;
    this.setupIframeMessaging();
  }

  private startIframePlayback(startSec = this.iframeStartSec): void {
    if (!this.iframe || !this.readyFired) return;
    this.iframeStartSec = Math.max(0, startSec);
    if (startSec > 0) {
      this.postCommand('seekTo', `[${Math.floor(startSec)},true]`);
    }
    if (!this.soundEnabled) this.postCommand('mute');
    else this.postCommand('unMute');
    this.postCommand('playVideo');
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
    this.teardownIframeMessaging();
    try {
      this.player?.stopVideo?.();
      this.player?.destroy?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    this.iframe = null;
    this.iframePlaying = false;
    this.iframePlayStartedAt = 0;
    if (this.hostEl?.parentNode) {
      this.hostEl.parentNode.removeChild(this.hostEl);
    }
    this.hostEl = null;
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  isActivelyPlaying(): boolean {
    if (this.mode === 'iframe') return this.iframePlaying;
    return this.isApiPlaying();
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
      this.postCommand('pauseVideo');
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
      this.iframeStartSec = t;
      if (this.iframePlaying) this.iframePlayStartedAt = Date.now();
      this.postCommand('seekTo', `[${Math.floor(t)},true]`);
      return;
    }
    try {
      this.player?.seekTo(t, true);
    } catch {
      /* ignore */
    }
  }

  getCurrentTime(): number {
    if (this.mode === 'iframe') {
      if (!this.iframePlaying || this.iframePlayStartedAt <= 0) return this.iframeStartSec;
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