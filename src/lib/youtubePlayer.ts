/** YouTube playback for preview fallback (IFrame API + simple embed fallback). */

const YT_SCRIPT = 'https://www.youtube.com/iframe_api';

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
      host?: string;
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

export function loadYouTubeIframeApi(): Promise<void> {
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

function buildEmbedSrc(videoId: string, autoplay: boolean, muted: boolean): string {
  const params = new URLSearchParams({
    autoplay: autoplay ? '1' : '0',
    mute: muted ? '1' : '0',
    enablejsapi: '1',
    origin: pageOrigin(),
    rel: '0',
    playsinline: '1',
    modestbranding: '1',
    iv_load_policy: '3',
  });
  return `https://www.youtube-nocookie.com/embed/${videoId}?${params}`;
}

export type YouTubePlayerHandlers = {
  onReady?: () => void;
  onPlaying?: () => void;
  onPaused?: () => void;
  onEnded?: () => void;
  onError?: (code?: number) => void;
  onMutedChange?: (muted: boolean) => void;
};

export class YouTubePreviewPlayer {
  private player: YTPlayer | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private hostEl: HTMLElement | null = null;

  private readyResolve: (() => void) | null = null;
  private readyPromise: Promise<void> | null = null;
  private mode: 'api' | 'iframe' = 'api';
  private readonly videoId: string;
  private readonly handlers: YouTubePlayerHandlers;
  private playPending = false;
  private startMuted = true;
  private soundEnabled = false;

  constructor(videoId: string, handlers: YouTubePlayerHandlers) {
    this.videoId = videoId;
    this.handlers = handlers;
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
    void this.initApi();
  }

  private markReady(): void {
    this.readyResolve?.();
    this.readyResolve = null;
    this.handlers.onReady?.();
  }

  private notifyMuted(): void {
    this.handlers.onMutedChange?.(!this.soundEnabled);
  }

  private mountIframeFallback(autoplay: boolean): void {
    this.mode = 'iframe';
    this.player = null;

    const { el } = createHostElement();
    this.hostEl = el;
    const iframe = document.createElement('iframe');
    iframe.className = 'play-dj__yt-frame';
    iframe.title = 'Track audio preview';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    const muted = !this.soundEnabled;
    iframe.src = buildEmbedSrc(this.videoId, autoplay, muted);
    el.appendChild(iframe);
    this.iframe = iframe;

    iframe.addEventListener('load', () => {
      this.markReady();
      if (autoplay) {
        this.handlers.onPlaying?.();
        this.notifyMuted();
      }
    });

    console.info('[yt-player] iframe fallback', this.videoId);
  }

  private async initApi(): Promise<void> {
    await loadYouTubeIframeApi();
    const YT = window.YT;
    if (!YT?.Player) {
      this.mountIframeFallback(this.playPending);
      return;
    }

    const { id, el } = createHostElement();
    this.hostEl = el;

    try {
      const instance = new YT.Player(id, {
        height: 180,
        width: 320,
        host: 'https://www.youtube-nocookie.com',
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
          mute: this.startMuted ? 1 : 0,
        },
        events: {
          onReady: (e) => {
            this.player = e.target;
            if (this.startMuted) {
              try {
                e.target.mute();
              } catch {
                /* ignore */
              }
            }
            this.markReady();
            this.notifyMuted();
            if (this.playPending) {
              this.playPending = false;
              void this.playInternal();
            }
          },
          onStateChange: (e) => {
            const { ENDED, PLAYING, PAUSED, BUFFERING } = YT.PlayerState;
            if (e.data === PLAYING || e.data === BUFFERING) {
              this.handlers.onPlaying?.();
            } else if (e.data === PAUSED) {
              this.handlers.onPaused?.();
            } else if (e.data === ENDED) {
              this.handlers.onEnded?.();
            }
          },
          onError: (e) => {
            console.warn('[yt-player] error', e.data, this.videoId);
            if (e.data === 101 || e.data === 150 || e.data === 2 || e.data === 100) {
              this.destroyHostOnly();
              this.mountIframeFallback(this.playPending);
              return;
            }
            this.handlers.onError?.(e.data);
          },
        },
      });
      this.player = instance;
    } catch (err) {
      console.warn('[yt-player] init failed', err);
      this.mountIframeFallback(this.playPending);
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

  private async awaitReady(): Promise<void> {
    if (this.readyPromise) await this.readyPromise;
  }

  getPlayerState(): number | null {
    try {
      const state = this.player?.getPlayerState?.();
      return typeof state === 'number' ? state : null;
    } catch {
      return null;
    }
  }

  isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  enableSound(): void {
    this.soundEnabled = true;
    if (this.mode === 'iframe' && this.iframe) {
      const playing = this.iframe.src.includes('autoplay=1');
      this.iframe.src = buildEmbedSrc(this.videoId, playing, false);
      this.notifyMuted();
      return;
    }
    try {
      this.player?.unMute();
    } catch {
      /* ignore */
    }
    this.notifyMuted();
  }

  private async playInternal(): Promise<void> {
    if (this.mode === 'iframe' && this.iframe) {
      const muted = !this.soundEnabled;
      this.iframe.src = buildEmbedSrc(this.videoId, true, muted);
      this.handlers.onPlaying?.();
      this.notifyMuted();
      return;
    }

    try {
      if (!this.soundEnabled) {
        this.player?.mute?.();
      }
      this.player?.playVideo();
    } catch (err) {
      console.warn('[yt-player] playVideo failed', err);
      this.mountIframeFallback(true);
      await this.awaitReady();
    }
  }

  async play(enableSound = false): Promise<void> {
    if (enableSound) this.soundEnabled = true;
    this.playPending = true;
    await this.awaitReady();
    this.playPending = false;
    await this.playInternal();
  }

  pause(): void {
    if (this.mode === 'iframe' && this.iframe) {
      const muted = !this.soundEnabled;
      this.iframe.src = buildEmbedSrc(this.videoId, false, muted);
      this.handlers.onPaused?.();
      return;
    }
    this.player?.pauseVideo();
  }

  seekStart(): void {
    if (this.mode === 'iframe' && this.iframe) {
      const muted = !this.soundEnabled;
      this.iframe.src = buildEmbedSrc(this.videoId, true, muted);
      return;
    }
    this.player?.seekTo(0, true);
  }

  getCurrentTime(): number {
    const t = this.player?.getCurrentTime?.();
    return typeof t === 'number' && Number.isFinite(t) ? t : 0;
  }

  getDuration(): number {
    const d = this.player?.getDuration?.();
    return typeof d === 'number' && Number.isFinite(d) && d > 0 ? d : 0;
  }

  destroy(): void {
    this.destroyHostOnly();
    this.readyResolve = null;
    this.readyPromise = null;
  }
}