import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchTrackPlayback,
  type PlaybackSource,
  type TrackPlayback,
} from '../lib/api';
import { playSelectionKey, type PlaySelection } from '../lib/playSession';
import { YouTubePreviewPlayer } from '../lib/youtubePlayer';
import type { Track, VinylRecord } from '../lib/types';

const SPOTIFY_PREVIEW_SECONDS = 30;
const LOAD_TIMEOUT_MS = 22_000;
const DEFAULT_YOUTUBE_SECONDS = 240;
const PLAYBACK_CACHE_MAX = 64;

const playbackCache = new Map<string, TrackPlayback>();

function rememberPlayback(key: string, data: TrackPlayback): void {
  playbackCache.set(key, data);
  if (playbackCache.size > PLAYBACK_CACHE_MAX) {
    const oldest = playbackCache.keys().next().value;
    if (oldest) playbackCache.delete(oldest);
  }
}

export type PreviewStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'ended'
  | 'unavailable'
  | 'rate_limited'
  | 'error';

export function useTrackPreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeRef = useRef<YouTubePreviewPlayer | null>(null);
  const activeKeyRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const sourceRef = useRef<PlaybackSource | null>(null);

  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(SPOTIFY_PREVIEW_SECONDS);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [youtubeMuted, setYoutubeMuted] = useState(false);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const detachYouTube = useCallback(() => {
    youtubeRef.current?.destroy();
    youtubeRef.current = null;
  }, []);

  const detachAudio = useCallback(() => {
    stopRaf();
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    audioRef.current = null;
  }, [stopRaf]);

  const reset = useCallback(() => {
    detachAudio();
    detachYouTube();
    activeKeyRef.current = null;
    sourceRef.current = null;
    setActiveKey(null);
    setSource(null);
    setYoutubeMuted(false);
    setStatus('idle');
    setProgress(0);
    setElapsed(0);
    setDuration(SPOTIFY_PREVIEW_SECONDS);
  }, [detachAudio, detachYouTube]);

  const tick = useCallback(() => {
    const key = activeKeyRef.current;
    if (!key) return;

    let dur = duration;
    let t = 0;

    if (sourceRef.current === 'spotify') {
      const audio = audioRef.current;
      if (!audio || audio.paused || audio.ended) return;
      dur =
        audio.duration && Number.isFinite(audio.duration)
          ? audio.duration
          : SPOTIFY_PREVIEW_SECONDS;
      t = Math.min(audio.currentTime, dur);
    } else if (sourceRef.current === 'youtube') {
      const yt = youtubeRef.current;
      if (!yt || !yt.isActivelyPlaying()) return;
      dur = yt.getDuration() || DEFAULT_YOUTUBE_SECONDS;
      t = Math.min(yt.getCurrentTime(), dur);
    } else {
      return;
    }

    setDuration(dur);
    setElapsed(t);
    setProgress(dur > 0 ? Math.min(1, t / dur) : 0);
    rafRef.current = requestAnimationFrame(tick);
  }, [duration]);

  const startProgress = useCallback(() => {
    stopRaf();
    rafRef.current = requestAnimationFrame(tick);
  }, [stopRaf, tick]);

  const playCurrent = useCallback((opts?: { enableSound?: boolean }) => {
    if (sourceRef.current === 'spotify') {
      const audio = audioRef.current;
      if (!audio) return;
      const playPromise = audio.play();
      if (playPromise) {
        playPromise.catch(() => {
          if (audioRef.current === audio) setStatus('error');
        });
      }
      return;
    }

    if (sourceRef.current === 'youtube') {
      const enableSound = opts?.enableSound ?? false;
      try {
        youtubeRef.current?.play(enableSound);
        if (enableSound) setYoutubeMuted(false);
      } catch {
        setStatus('error');
      }
    }
  }, []);

  const attachSpotify = useCallback(
    (
      previewUrl: string,
      key: string,
      opts?: { autoplay?: boolean; enableSound?: boolean }
    ) => {
      detachAudio();
      detachYouTube();
      activeKeyRef.current = key;
      setActiveKey(key);
      sourceRef.current = 'spotify';
      setSource('spotify');
      setDuration(SPOTIFY_PREVIEW_SECONDS);

      const audio = new Audio(previewUrl);
      audioRef.current = audio;

      audio.addEventListener('play', () => {
        if (activeKeyRef.current !== key) return;
        setStatus('playing');
        startProgress();
      });

      audio.addEventListener('ended', () => {
        stopRaf();
        setStatus('ended');
        setProgress(1);
        setElapsed(SPOTIFY_PREVIEW_SECONDS);
      });

      audio.addEventListener('pause', () => {
        if (!audio.ended && activeKeyRef.current === key) {
          stopRaf();
          setStatus('paused');
        }
      });

      audio.addEventListener('error', () => {
        if (activeKeyRef.current === key) setStatus('error');
      });

      setStatus('ready');
      if (opts?.autoplay) {
        playCurrent({ enableSound: opts.enableSound === true });
      }
    },
    [detachAudio, detachYouTube, playCurrent, startProgress, stopRaf]
  );

  const attachYouTube = useCallback(
    (
      videoId: string,
      key: string,
      opts?: { autoplay?: boolean; enableSound?: boolean }
    ) => {
      detachAudio();
      detachYouTube();
      activeKeyRef.current = key;
      setActiveKey(key);
      sourceRef.current = 'youtube';
      setSource('youtube');
      setDuration(DEFAULT_YOUTUBE_SECONDS);

      const autoplay = opts?.autoplay === true;
      const enableSound = opts?.enableSound === true;
      setYoutubeMuted(!enableSound);

      youtubeRef.current = new YouTubePreviewPlayer(
        videoId,
        {
        onReady: () => {
          if (activeKeyRef.current !== key) return;
          const d = youtubeRef.current?.getDuration();
          if (d && d > 0) setDuration(d);
          setStatus('ready');
          if (autoplay) {
            playCurrent({ enableSound: enableSound });
          }
        },
        onMutedChange: (muted) => {
          if (activeKeyRef.current !== key) return;
          setYoutubeMuted(muted);
        },
        onPlaying: () => {
          if (activeKeyRef.current !== key) return;
          setStatus('playing');
          startProgress();
        },
        onPaused: () => {
          if (activeKeyRef.current !== key) return;
          stopRaf();
          setStatus('paused');
        },
        onEnded: () => {
          if (activeKeyRef.current !== key) return;
          stopRaf();
          setStatus('ended');
          setProgress(1);
          setElapsed(youtubeRef.current?.getDuration() || duration);
        },
        onError: (code) => {
          console.warn('[play-audio] YouTube player error', code, videoId);
          if (activeKeyRef.current === key) setStatus('error');
        },
      },
        { autoplay, enableSound }
      );
    },
    [detachAudio, detachYouTube, duration, playCurrent, startProgress, stopRaf]
  );

  const applyPlayback = useCallback(
    (
      data: TrackPlayback,
      key: string,
      autoplay: boolean,
      enableSoundOnAutoplay: boolean
    ) => {
      if (data.source === 'spotify') {
        const previewUrl = data.previewUrl?.trim();
        if (!previewUrl) {
          setStatus('unavailable');
          return;
        }
        attachSpotify(previewUrl, key, {
          autoplay,
          enableSound: enableSoundOnAutoplay,
        });
        return;
      }
      attachYouTube(data.videoId, key, {
        autoplay,
        enableSound: autoplay && enableSoundOnAutoplay,
      });
    },
    [attachSpotify, attachYouTube]
  );

  const load = useCallback(
    async (
      record: VinylRecord,
      track: Track,
      autoplay = false,
      enableSoundOnAutoplay = false
    ) => {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });

      const alreadyAttached =
        activeKeyRef.current === key &&
        sourceRef.current != null &&
        (audioRef.current != null || youtubeRef.current != null);

      if (alreadyAttached) {
        setActiveKey(key);
        if (autoplay) {
          playCurrent({ enableSound: enableSoundOnAutoplay });
        }
        return;
      }

      activeKeyRef.current = key;
      setActiveKey(key);
      setStatus('loading');
      setProgress(0);
      setElapsed(0);

      const failIfStillLoading = () => {
        if (activeKeyRef.current === key) setStatus('unavailable');
      };
      const loadTimeout = window.setTimeout(failIfStillLoading, LOAD_TIMEOUT_MS);

      const artist = track.artist?.trim() || record.artist;
      const albumTitle = record.title.trim();
      const albumIndex = record.tracks?.findIndex((t) => t.id === track.id);

      const cached = playbackCache.get(key);
      if (cached) {
        window.clearTimeout(loadTimeout);
        applyPlayback(cached, key, autoplay, enableSoundOnAutoplay);
        return;
      }

      const cachedPreview = track.spotifyPreviewUrl?.trim();
      if (cachedPreview) {
        window.clearTimeout(loadTimeout);
        const data: TrackPlayback = {
          source: 'spotify',
          previewUrl: cachedPreview,
          spotifyTrackId: track.spotifyTrackId,
          durationSec: SPOTIFY_PREVIEW_SECONDS,
        };
        rememberPlayback(key, data);
        applyPlayback(data, key, autoplay, enableSoundOnAutoplay);
        return;
      }

      try {
        const result = await fetchTrackPlayback(artist, track.title, albumTitle || undefined, {
          albumIndex: albumIndex != null && albumIndex >= 0 ? albumIndex + 1 : undefined,
          spotifyTrackId: track.spotifyTrackId,
        });
        window.clearTimeout(loadTimeout);
        if (activeKeyRef.current !== key) return;

        if (!result.ok) {
          setStatus(result.reason === 'rate_limited' ? 'rate_limited' : 'unavailable');
          return;
        }

        rememberPlayback(key, result.data);
        applyPlayback(result.data, key, autoplay, enableSoundOnAutoplay);
      } catch {
        window.clearTimeout(loadTimeout);
        if (activeKeyRef.current === key) setStatus('error');
      }
    },
    [applyPlayback, playCurrent]
  );

  const seekTo = useCallback(
    (seconds: number) => {
      if (sourceRef.current === 'spotify') {
        const audio = audioRef.current;
        if (!audio) return;
        const dur =
          audio.duration && Number.isFinite(audio.duration)
            ? audio.duration
            : SPOTIFY_PREVIEW_SECONDS;
        const t = Math.max(0, Math.min(seconds, dur));
        audio.currentTime = t;
        setDuration(dur);
        setElapsed(t);
        setProgress(dur > 0 ? t / dur : 0);
        if (status === 'ended' && t < dur) setStatus('paused');
        return;
      }

      if (sourceRef.current === 'youtube') {
        const yt = youtubeRef.current;
        if (!yt) return;
        const dur = yt.getDuration() || duration;
        const t = Math.max(0, Math.min(seconds, dur > 0 ? dur : seconds));
        yt.seekTo(t);
        setDuration(dur > 0 ? dur : duration);
        setElapsed(t);
        setProgress(dur > 0 ? t / dur : 0);
        if (status === 'ended' && dur > 0 && t < dur) setStatus('paused');
      }
    },
    [duration, status]
  );

  const skipBy = useCallback(
    (deltaSeconds: number) => {
      let current = elapsed;
      if (sourceRef.current === 'spotify') {
        const audio = audioRef.current;
        if (audio && Number.isFinite(audio.currentTime)) current = audio.currentTime;
      } else if (sourceRef.current === 'youtube') {
        current = youtubeRef.current?.getCurrentTime() ?? elapsed;
      }
      seekTo(current + deltaSeconds);
    },
    [elapsed, seekTo]
  );

  const toggle = useCallback(() => {
    if (
      status === 'playing' &&
      sourceRef.current === 'youtube' &&
      youtubeRef.current &&
      !youtubeRef.current.isSoundEnabled()
    ) {
      youtubeRef.current.enableSound();
      setYoutubeMuted(false);
      return;
    }

    if (status === 'playing') {
      if (sourceRef.current === 'spotify') {
        audioRef.current?.pause();
        stopRaf();
        setStatus('paused');
      } else {
        youtubeRef.current?.pause();
      }
      return;
    }

    if (status === 'ended') {
      if (sourceRef.current === 'spotify') {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          setProgress(0);
          setElapsed(0);
        }
      } else {
        youtubeRef.current?.seekStart();
        setProgress(0);
        setElapsed(0);
      }
    }

    const enableSound =
      sourceRef.current === 'spotify' || sourceRef.current === 'youtube';
    playCurrent({ enableSound });
  }, [playCurrent, status, stopRaf]);

  const matchesSelection = useCallback(
    (ref: PlaySelection | null) => {
      if (!ref) return activeKey == null;
      return activeKey === playSelectionKey(ref);
    },
    [activeKey]
  );

  useEffect(() => () => reset(), [reset]);

  return {
    status,
    progress,
    elapsed,
    duration,
    activeKey,
    source,
    youtubeMuted,
    load,
    toggle,
    seekTo,
    skipBy,
    reset,
    matchesSelection,
    /** @deprecated use duration */
    previewDuration: duration,
  };
}

/** @deprecated Use useTrackPreview */
export const useSpotifyPreview = useTrackPreview;