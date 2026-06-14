/** YouTube preview — IFrame API on desktop (incl. localhost); enablejsapi embed on iOS. */

import { playbackDiag } from './playbackDiagnostics';
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

const YT_STATE = {
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

const YT_IFRAME_ALLOW =
  'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';

let apiReady: Promise<void> | null = null;
let hostCounter = 0;

function pageOrigin(): string {
  return window.location.origin || `${window.location.protocol}//${window.location.host}`;
}

function useIframeEmbed(): boolean {
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

/** Guaranteed in-viewport render surface — inline styles survive CSS regressions. */
function applyDesktopHostStyles(el: HTMLElement): void {
  Object.assign(el.style, {
    position: 'fixed',
    right: '0px',
    bottom: '0px',
    width: '320px',
    height: '180px',
    opacity: '0.01',
    pointerEvents: 'none',
    overflow: 'hidden',
    border: '0',
    zIndex: '0',
  });
}

function mountHostElement(): { id: string; el: HTMLElement } {
  const id = `play-yt-host-${++hostCounter}`;
  const el = document.createElement('div');
  el.id = id;
  el.setAttribute('aria-hidden', 'true');

  if (isIOSDevice()) {
    el.className = 'play-dj__yt-host play-dj__yt-host--touch';
    let root = document.getElementById('play-yt-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'play-yt-root';
      root.className = 'play-dj__yt-root';
      document.body.appendChild(root);
    }
    root.appendChild(el);
  } else {
    el.className = 'play-dj__yt-host';
    applyDesktopHostStyles(el);
    document.body.appendChild(el);
  }

  playbackDiag('yt_host_mounted', {
    id,
    ios: isIOSDevice(),
    rect: el.getBoundingClientRect(),
  });

  return { id, el };
}

function buildEmbedSrc(
  videoId: string,
  autoplay: boolean,
  muted: boolean,
  startSec = 0
): string {
  const params = new URLSearchParams({
    enablejsapi: '1',
    origin: pageOrigin(),
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

export type YouTubePlayerHandlers = {
  onReady?: () => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnded?: () => void;
  onError?: (code?: number) => void;
  onMutedChange?: (muted: boolean) => void;
  onStall?: (reason: string) => void;
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
  private stallTimer: ReturnType<typeof setInterval> | null = null;
  private readonly videoId: string;
  private readonly handlers: YouTubePlayerHandlers;
  private soundEnabled = false;
  private iframePlaying = false;
  private iframeStartSec = 0;
  private iframePlayStartedAt = 0;
  private lastObservedTime = -1;
  private lastObservedAt = 0;
  private messageListener: ((e: MessageEvent) => void) | null = null;

  constructor(videoId: string, handlers: YouTubePlayerHandlers, opts?: YouTubePlayerOptions) {
    this.videoId = videoId;
    this.handlers = handlers;
    this.soundEnabled = opts?.enableSound === true;
    playbackDiag('yt_player_create', { videoId, sound: this.soundEnabled, ios: isIOSDevice() });
    void this.init();
  }

  private clearInitTimeout(): void {
    if (this.initTimeout != null) {
      clearTimeout(this.initTimeout);
      this.initTimeout = null;
    }
  }

  private clearStallTimer(): void {
    if (this.stallTimer != null) {
      clearInterval(this.stallTimer);
      this.stallTimer = null;
    }
  }

  private markReady(): void {
    if (this.readyFired) return;
    this.readyFired = true;
    this.clearInitTimeout();
    playbackDiag('yt_ready', { videoId: this.videoId, mode: this.mode });
    this.handlers.onReady?.();
  }

  private notifyMuted(): void {
    this.handlers.onMutedChange?.(!this.soundEnabled);
  }

  private readPlayerState(): number | null {
    if (this.mode === 'iframe') {
      return this.iframePlaying ? YT_STATE.PLAYING : YT_STATE.PAUSED;
    }
    try {
      const state = this.player?.getPlayerState?.();
      return typeof state === 'number' ? state : null;
    } catch {
      return null;
    }
  }

  private handleStateChange(state: number): void {
    playbackDiag('yt_state', { videoId: this.videoId, state, mode: this.mode });

    if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) {
      if (this.mode === 'iframe' && !this.iframePlaying) {
        this.iframePlaying = true;
        this.iframePlayStartedAt = Date.now();
      }
      this.lastObservedTime = this.getCurrentTime();
      this.lastObservedAt = Date.now();
      this.startStallWatch();
      this.handlers.onPlaying?.();
      this.notifyMuted();
      return;
    }

    if (state === YT_STATE.PAUSED) {
      this.iframePlaying = false;
      this.clearStallTimer();
      this.handlers.onPaused?.();
      return;
    }

    if (state === YT_STATE.ENDED) {
      this.iframePlaying = false;
      this.clearStallTimer();
      this.handlers.onEnded?.();
    }
  }

  private startStallWatch(): void {
    this.clearStallTimer();
    this.stallTimer = setInterval(() => {
      if (this.abandoned) return;
      const state = this.readPlayerState();
      const activelyPlaying =
        state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING || this.iframePlaying;

      if (!activelyPlaying) {
        this.clearStallTimer();
        return;
      }

      const now = Date.now();
      const t = this.getCurrentTime();

      if (this.mode === 'api' && this.player && state === YT_STATE.PLAYING) {
        const real = this.player.getCurrentTime();
        if (Math.abs(real - this.lastObservedTime) < 0.05 && now - this.lastObservedAt > 3500) {
          playbackDiag('yt_stall', {
            videoId: this.videoId,
            reason: 'api_time_frozen',
            t: real,
            state,
          });
          this.handlers.onStall?.('api_time_frozen');
          this.handlers.onPaused?.();
          this.clearStallTimer();
        } else if (Math.abs(real - this.lastObservedTime) >= 0.05) {
          this.lastObservedTime = real;
          this.lastObservedAt = now;
        }
        return;
      }

      if (this.mode === 'iframe' && this.iframePlaying) {
        if (t - this.lastObservedTime < 0.2 && now - this.lastObservedAt > 2500) {
          playbackDiag('yt_stall', {
            videoId: this.videoId,
            reason: 'iframe_time_frozen',
            t,
          });
          this.iframePlaying = false;
          this.handlers.onStall?.('iframe_time_frozen');
          this.handlers.onPaused?.();
          this.clearStallTimer();
        } else {
          this.lastObservedTime = t;
          this.lastObservedAt = now;
        }
      }
    }, 1000);
  }

  private postCommand(func: string, args = ''): void {
    this.iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      '*'
    );
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
      this.handleStateChange(Number(evt.info));
      return;
    }

    if (evt.event === 'infoDelivery' && evt.info && typeof evt.info === 'object') {
      const info = evt.info as Record<string, unknown>;
      if (typeof info.playerState === 'number') {
        this.handleStateChange(info.playerState);
      }
      if (typeof info.currentTime === 'number') {
        this.lastObservedTime = info.currentTime;
        this.lastObservedAt = Date.now();
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
        /* ignore */
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

  private mountIframeEmbed(autoplay: boolean): void {
    this.mode = 'iframe';
    this.player = null;
    this.iframePlaying = false;

    const { el } = mountHostElement();
    this.hostEl = el;
    const iframe = document.createElement('iframe');
    iframe.className = 'play-dj__yt-frame';
    iframe.title = 'Track audio preview';
    iframe.allow = YT_IFRAME_ALLOW;
    iframe.allowFullscreen = true;
    iframe.src = buildEmbedSrc(this.videoId, autoplay, !this.soundEnabled);
    el.appendChild(iframe);
    this.iframe = iframe;
    this.setupIframeMessaging();

    iframe.addEventListener('load', () => {
      playbackDiag('yt_iframe_load', { videoId: this.videoId });
      if (!this.readyFired) this.markReady();
    });
  }

  private async initApiPlayer(): Promise<void> {
    this.initTimeout = setTimeout(() => {
      if (!this.readyFired && !this.abandoned) {
        playbackDiag('yt_api_timeout', { videoId: this.videoId });
        this.abandoned = true;
        this.destroyHostOnly();
        this.abandoned = false;
        this.mountIframeEmbed(false);
      }
    }, 10_000);

    await loadYouTubeIframeApi();
    const YT = window.YT;
    if (!YT?.Player) {
      this.clearInitTimeout();
      playbackDiag('yt_api_unavailable', { videoId: this.videoId });
      this.mountIframeEmbed(false);
      return;
    }

    const { id, el } = mountHostElement();
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
            this.handleStateChange(e.data);
          },
          onError: (e) => {
            playbackDiag('yt_error', { videoId: this.videoId, code: e.data });
            if (e.data === 101 || e.data === 150 || e.data === 2 || e.data === 100) {
              this.clearInitTimeout();
              this.destroyHostOnly();
              this.mountIframeEmbed(false);
              return;
            }
            this.handlers.onError?.(e.data);
          },
        },
      });
      this.player = instance;
      this.mode = 'api';
    } catch (err) {
      this.clearInitTimeout();
      playbackDiag('yt_api_throw', { videoId: this.videoId, err: String(err) });
      this.mountIframeEmbed(false);
    }
  }

  private async init(): Promise<void> {
    if (useIframeEmbed()) {
      this.mountIframeEmbed(false);
      return;
    }
    await this.initApiPlayer();
  }

  private destroyHostOnly(): void {
    this.teardownIframeMessaging();
    this.clearStallTimer();
    try {
      this.player?.stopVideo?.();
      this.player?.destroy?.();
    } catch {
      /* ignore */
    }
    this.player = null;
    if (this.iframe) this.iframe.src = 'about:blank';
    this.iframe = null;
    this.iframePlaying = false;
    if (this.hostEl?.parentNode) {
      this.hostEl.parentNode.removeChild(this.hostEl);
    }
    this.hostEl = null;
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  isActivelyPlaying(): boolean {
    const state = this.readPlayerState();
    return state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING;
  }

  getPlayerMode(): 'api' | 'iframe' {
    return this.mode;
  }

  armPlay(enableSound = true): void {
    if (enableSound) this.soundEnabled = true;
    if (this.readyFired) this.play(enableSound);
  }

  enableSound(): void {
    this.soundEnabled = true;
    this.play(true);
  }

  play(enableSound = false): void {
    if (enableSound) this.soundEnabled = true;
    if (!this.readyFired) {
      playbackDiag('yt_play_skipped', { videoId: this.videoId, reason: 'not_ready' });
      return;
    }

    playbackDiag('yt_play', {
      videoId: this.videoId,
      mode: this.mode,
      sound: this.soundEnabled,
    });

    if (this.mode === 'iframe') {
      if (!this.soundEnabled) this.postCommand('mute');
      else this.postCommand('unMute');
      this.postCommand('playVideo');
      this.notifyMuted();
      return;
    }

    try {
      if (!this.soundEnabled) this.player?.mute();
      else this.player?.unMute();
      this.player?.playVideo();
      this.notifyMuted();
    } catch (err) {
      playbackDiag('yt_play_error', { videoId: this.videoId, err: String(err) });
    }
  }

  pause(): void {
    playbackDiag('yt_pause', { videoId: this.videoId, mode: this.mode });
    if (this.mode === 'iframe') {
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
      const time = this.player?.getCurrentTime?.();
      return typeof time === 'number' && Number.isFinite(time) ? time : 0;
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
    playbackDiag('yt_destroy', { videoId: this.videoId });
    this.abandoned = true;
    this.clearInitTimeout();
    this.destroyHostOnly();
    this.readyFired = false;
  }
}