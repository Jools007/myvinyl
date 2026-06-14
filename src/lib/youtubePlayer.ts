/**
 * YouTube preview playback
 * - Production desktop: IFrame API (YT.Player)
 * - Localhost: simple embed + src reload (no YT.Player — widgetapi postMessage breaks)
 * - iOS: enablejsapi embed + postMessage
 */

import { playbackDiag } from './playbackDiagnostics';
import { isIOSDevice, isLocalDevHost } from './playbackDevice';

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
let hostParent: HTMLElement | null = null;

function pageOrigin(): string {
  return window.location.origin || `${window.location.protocol}//${window.location.host}`;
}

/** iOS only — enablejsapi + postMessage (with listening handshake). */
function useJsApiIframe(): boolean {
  return isIOSDevice();
}

function useSrcReloadEmbed(): boolean {
  return isLocalDevHost();
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

function mountHostElement(): { id: string; el: HTMLElement } {
  const id = `play-yt-host-${++hostCounter}`;
  const el = document.createElement('div');
  el.id = id;
  el.className = isIOSDevice()
    ? 'play-dj__yt-host play-dj__yt-host--touch'
    : 'play-dj__yt-host';
  el.setAttribute('aria-hidden', 'true');
  getHostParent().appendChild(el);

  playbackDiag('yt_host_mounted', {
    id,
    local: isLocalDevHost(),
    ios: isIOSDevice(),
    rect: el.getBoundingClientRect(),
  });

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
  /** api = YT.Player · jsapi = enablejsapi postMessage · src = localhost src reload */
  private mode: 'api' | 'jsapi' | 'src' = 'api';
  private readyFired = false;
  private abandoned = false;
  private initTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly videoId: string;
  private readonly handlers: YouTubePlayerHandlers;
  private soundEnabled = false;
  private iframePlaying = false;
  private iframeStartSec = 0;
  private iframePlayStartedAt = 0;
  private messageListener: ((e: MessageEvent) => void) | null = null;

  constructor(videoId: string, handlers: YouTubePlayerHandlers, opts?: YouTubePlayerOptions) {
    this.videoId = videoId;
    this.handlers = handlers;
    this.soundEnabled = opts?.enableSound === true;
    playbackDiag('yt_player_create', {
      videoId,
      sound: this.soundEnabled,
      local: isLocalDevHost(),
      ios: isIOSDevice(),
    });
    void this.init();
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
    playbackDiag('yt_ready', { videoId: this.videoId, mode: this.mode });
    this.handlers.onReady?.();
  }

  private notifyMuted(): void {
    this.handlers.onMutedChange?.(!this.soundEnabled);
  }

  private handleStateChange(state: number): void {
    playbackDiag('yt_state', { videoId: this.videoId, state, mode: this.mode });

    if (state === YT_STATE.PLAYING || state === YT_STATE.BUFFERING) {
      if (!this.iframePlaying) {
        this.iframePlaying = true;
        this.iframePlayStartedAt = Date.now();
      }
      this.handlers.onPlaying?.();
      this.notifyMuted();
      return;
    }

    if (state === YT_STATE.PAUSED) {
      this.iframePlaying = false;
      this.handlers.onPaused?.();
      return;
    }

    if (state === YT_STATE.ENDED) {
      this.iframePlaying = false;
      this.handlers.onEnded?.();
    }
  }

  private sendListeningHandshake(): void {
    this.iframe?.contentWindow?.postMessage(
      JSON.stringify({ event: 'listening', id: '', channel: 'widget' }),
      '*'
    );
  }

  private postCommand(func: string, args: string | unknown[] = ''): void {
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

    if (evt.event === 'onError') {
      const code = Number(evt.info);
      playbackDiag('yt_error', { videoId: this.videoId, code, mode: this.mode });
      this.handlers.onError?.(Number.isFinite(code) ? code : undefined);
      return;
    }

    if (evt.event === 'infoDelivery' && evt.info && typeof evt.info === 'object') {
      const info = evt.info as Record<string, unknown>;
      if (typeof info.playerState === 'number') {
        this.handleStateChange(info.playerState);
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

  private startSrcPlayback(startSec = this.iframeStartSec): void {
    if (!this.iframe) return;
    const muted = !this.soundEnabled;
    this.iframeStartSec = Math.max(0, startSec);
    this.iframePlayStartedAt = Date.now();
    this.iframePlaying = true;
    const next = buildEmbedSrc(this.videoId, true, muted, this.iframeStartSec, false);
    if (this.iframe.src !== next) this.iframe.src = next;
    this.handlers.onPlaying?.();
    this.notifyMuted();
  }

  private mountIframeEmbed(autoplay: boolean): void {
    const jsApi = useJsApiIframe();
    this.mode = jsApi ? 'jsapi' : 'src';
    this.player = null;
    this.iframePlaying = false;

    const { el } = mountHostElement();
    this.hostEl = el;
    const iframe = document.createElement('iframe');
    iframe.className = 'play-dj__yt-frame';
    iframe.title = 'Track audio preview';
    iframe.allow = YT_IFRAME_ALLOW;
    iframe.allowFullscreen = true;
    iframe.src = buildEmbedSrc(this.videoId, autoplay, !this.soundEnabled, 0, jsApi);
    el.appendChild(iframe);
    this.iframe = iframe;

    if (jsApi) {
      this.setupIframeMessaging();
    }

    iframe.addEventListener('load', () => {
      playbackDiag('yt_iframe_load', { videoId: this.videoId, mode: this.mode });
      if (jsApi) this.sendListeningHandshake();
      if (!this.readyFired) this.markReady();
    });
  }

  private mountSimpleFallback(autoplay: boolean): void {
    this.mountIframeEmbed(autoplay);
  }

  private async initApiPlayer(): Promise<void> {
    this.initTimeout = setTimeout(() => {
      if (!this.readyFired && !this.abandoned) {
        playbackDiag('yt_api_timeout', { videoId: this.videoId });
        this.abandoned = true;
        this.destroyHostOnly();
        this.abandoned = false;
        this.mountSimpleFallback(false);
      }
    }, 10_000);

    await loadYouTubeIframeApi();
    const YT = window.YT;
    if (!YT?.Player) {
      this.clearInitTimeout();
      playbackDiag('yt_api_unavailable', { videoId: this.videoId });
      this.mountSimpleFallback(false);
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
            if (e.data === 101 || e.data === 150) {
              this.clearInitTimeout();
              this.handlers.onError?.(e.data);
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
      this.mountSimpleFallback(false);
    }
  }

  private async init(): Promise<void> {
    if (useJsApiIframe() || useSrcReloadEmbed()) {
      this.mountIframeEmbed(false);
      return;
    }
    await this.initApiPlayer();
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
    if (this.mode === 'api') {
      try {
        const YT = window.YT;
        if (!YT || !this.player) return false;
        const state = this.player.getPlayerState();
        return state === YT.PlayerState.PLAYING || state === YT.PlayerState.BUFFERING;
      } catch {
        return false;
      }
    }
    return this.iframePlaying;
  }

  getPlayerMode(): string {
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

    if (this.mode === 'src') {
      this.startSrcPlayback();
      return;
    }

    if (this.mode === 'jsapi') {
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

    if (this.mode === 'src' && this.iframe) {
      const muted = !this.soundEnabled;
      this.iframePlaying = false;
      this.iframe.src = buildEmbedSrc(this.videoId, false, muted, this.iframeStartSec, false);
      this.handlers.onPaused?.();
      return;
    }

    if (this.mode === 'jsapi') {
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
    if (this.mode === 'src') {
      this.startSrcPlayback(t);
      return;
    }
    if (this.mode === 'jsapi') {
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
    if (this.mode === 'src' || this.mode === 'jsapi') {
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