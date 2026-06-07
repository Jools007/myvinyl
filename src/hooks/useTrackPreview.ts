import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchTrackPlayback, type PlaybackSource } from '../lib/api';
import { playSelectionKey, type PlaySelection } from '../lib/playSession';
import { YouTubePreviewPlayer } from '../lib/youtubePlayer';
import type { Track, VinylRecord } from '../lib/types';

const SPOTIFY_PREVIEW_SECONDS = 30;
const LOAD_TIMEOUT_MS = 22_000;
const DEFAULT_YOUTUBE_SECONDS = 240;

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
  const autoplayAfterReadyRef = useRef(false);
  const autoplaySoundRef = useRef(false);

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
      if (!yt) return;
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

  const playCurrent = useCallback(
    async (opts?: { enableSound?: boolean }) => {
      if (sourceRef.current === 'spotify') {
        const audio = audioRef.current;
        if (!audio) return;
        try {
          await audio.play();
          setStatus('playing');
          startProgress();
        } catch {
          setStatus('error');
        }
        return;
      }

      if (sourceRef.current === 'youtube') {
        const enableSound = opts?.enableSound ?? false;
        if (enableSound) {
          youtubeRef.current?.enableSound();
          setYoutubeMuted(false);
        }
        try {
          await youtubeRef.current?.play(enableSound);
        } catch {
          setStatus('error');
        }
      }
    },
    [startProgress]
  );

  const attachSpotify = useCallback(
    (previewUrl: string, key: string) => {
      detachAudio();
      detachYouTube();
      activeKeyRef.current = key;
      setActiveKey(key);
      sourceRef.current = 'spotify';
      setSource('spotify');
      setDuration(SPOTIFY_PREVIEW_SECONDS);

      const audio = new Audio(previewUrl);
      audioRef.current = audio;

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
      if (autoplayAfterReadyRef.current) {
        const withSound = autoplaySoundRef.current;
        autoplayAfterReadyRef.current = false;
        autoplaySoundRef.current = false;
        void playCurrent({ enableSound: withSound });
      }
    },
    [detachAudio, detachYouTube, playCurrent, stopRaf]
  );

  const attachYouTube = useCallback(
    (videoId: string, key: string) => {
      detachAudio();
      detachYouTube();
      activeKeyRef.current = key;
      setActiveKey(key);
      sourceRef.current = 'youtube';
      setSource('youtube');
      setDuration(DEFAULT_YOUTUBE_SECONDS);

      setYoutubeMuted(true);

      youtubeRef.current = new YouTubePreviewPlayer(videoId, {
        onReady: () => {
          if (activeKeyRef.current !== key) return;
          const d = youtubeRef.current?.getDuration();
          if (d && d > 0) setDuration(d);
          setStatus('ready');
          if (autoplayAfterReadyRef.current) {
            const withSound = autoplaySoundRef.current;
            autoplayAfterReadyRef.current = false;
            autoplaySoundRef.current = false;
            void playCurrent({ enableSound: withSound });
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
      });
    },
    [detachAudio, detachYouTube, duration, playCurrent, startProgress, stopRaf]
  );

  const load = useCallback(
    async (
      record: VinylRecord,
      track: Track,
      autoplay = false,
      enableSoundOnAutoplay = false
    ) => {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });
      activeKeyRef.current = key;
      setActiveKey(key);
      setStatus('loading');
      setProgress(0);
      setElapsed(0);
      setSource(null);
      sourceRef.current = null;

      const failIfStillLoading = () => {
        if (activeKeyRef.current === key) setStatus('unavailable');
      };
      const loadTimeout = window.setTimeout(failIfStillLoading, LOAD_TIMEOUT_MS);
      autoplayAfterReadyRef.current = autoplay;
      autoplaySoundRef.current = autoplay && enableSoundOnAutoplay;

      const artist = track.artist?.trim() || record.artist;
      const albumTitle = record.title.trim();
      const albumIndex = record.tracks?.findIndex((t) => t.id === track.id);

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

        if (result.data.source === 'spotify') {
          const previewUrl = result.data.previewUrl?.trim();
          if (!previewUrl) {
            setStatus('unavailable');
            return;
          }
          attachSpotify(previewUrl, key);
          if (autoplay) await playCurrent({ enableSound: enableSoundOnAutoplay });
          return;
        }

        attachYouTube(result.data.videoId, key);
      } catch {
        window.clearTimeout(loadTimeout);
        if (activeKeyRef.current === key) setStatus('error');
      }
    },
    [attachSpotify, attachYouTube, playCurrent]
  );

  const toggle = useCallback(async () => {
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
      } else {
        youtubeRef.current?.pause();
      }
      setStatus('paused');
      stopRaf();
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
    await playCurrent({ enableSound });
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
    reset,
    matchesSelection,
    /** @deprecated use duration */
    previewDuration: duration,
  };
}

/** @deprecated Use useTrackPreview */
export const useSpotifyPreview = useTrackPreview;