import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchTrackPlayback,
  type PlaybackSource,
  type TrackPlayback,
} from '../lib/api';
import { playbackDiag, updatePlaybackDiagSnapshot } from '../lib/playbackDiagnostics';
import {
  getPlaybackCached,
  invalidateYouTubePlayback,
  rememberPlayback,
} from '../lib/playbackCache';
import { mountAudioElement, unmountAudioElement } from '../lib/playMediaHost';
import { playSelectionKey, type PlaySelection } from '../lib/playSession';
import { YouTubePreviewPlayer } from '../lib/youtubePlayer';
import type { Track, VinylRecord } from '../lib/types';

const SPOTIFY_PREVIEW_SECONDS = 30;
const LOAD_TIMEOUT_MS = 22_000;
const DEFAULT_YOUTUBE_SECONDS = 240;
const MAX_VIDEO_ALTERNATES = 6;

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
  const currentVideoIdRef = useRef<string | null>(null);
  const failedVideoIdsRef = useRef<Set<string>>(new Set());
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playRequestedRef = useRef(false);
  const loadInFlightRef = useRef<string | null>(null);
  const loadGenByKeyRef = useRef<Map<string, number>>(new Map());
  const pendingAutoplayRef = useRef<{
    key: string;
    enableSound: boolean;
  } | null>(null);
  const tryAlternateRef = useRef<() => void>(() => {});
  const attachYouTubeRef = useRef<
    (
      videoId: string,
      key: string,
      opts?: { autoplay?: boolean; enableSound?: boolean }
    ) => void
  >(() => {});
  const loadCtxRef = useRef<{
    record: VinylRecord;
    track: Track;
    key: string;
    artist: string;
    albumTitle: string;
    albumIndex?: number;
  } | null>(null);

  const [status, setStatus] = useState<PreviewStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(SPOTIFY_PREVIEW_SECONDS);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [source, setSource] = useState<PlaybackSource | null>(null);
  const [youtubeMuted, setYoutubeMuted] = useState(false);
  const [diagHint, setDiagHint] = useState<string | null>(null);
  const [attachedVideoId, setAttachedVideoId] = useState<string | null>(null);
  const [lastApiVideoId, setLastApiVideoId] = useState<string | null>(null);
  const [lastApiTitle, setLastApiTitle] = useState<string | null>(null);
  const [playerState, setPlayerState] = useState<number | null>(null);
  const [activelyPlaying, setActivelyPlaying] = useState(false);

  const syncDiagSnapshot = useCallback(() => {
    updatePlaybackDiagSnapshot({
      status,
      source,
      activeKey,
      attachedVideoId: currentVideoIdRef.current,
      lastApiVideoId,
      lastApiTitle,
      failedVideoIds: [...failedVideoIdsRef.current],
      youtubeMode: youtubeRef.current?.getPlayerMode() ?? null,
      playerState,
      activelyPlaying,
      elapsed,
      duration,
      diagHint,
      pageHidden: typeof document !== 'undefined' ? document.hidden : false,
    });
  }, [
    activeKey,
    diagHint,
    duration,
    elapsed,
    lastApiTitle,
    activelyPlaying,
    lastApiVideoId,
    playerState,
    source,
    status,
  ]);

  useEffect(() => {
    syncDiagSnapshot();
  }, [syncDiagSnapshot]);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current != null) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const stopRaf = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const detachYouTube = useCallback(() => {
    youtubeRef.current?.destroy();
    youtubeRef.current = null;
    currentVideoIdRef.current = null;
    setAttachedVideoId(null);
  }, []);

  const detachAudio = useCallback(() => {
    stopRaf();
    unmountAudioElement(audioRef.current);
    audioRef.current = null;
  }, [stopRaf]);

  const reset = useCallback(() => {
    clearStallTimer();
    detachAudio();
    detachYouTube();
    activeKeyRef.current = null;
    sourceRef.current = null;
    playRequestedRef.current = false;
    loadInFlightRef.current = null;
    setActiveKey(null);
    setSource(null);
    setYoutubeMuted(false);
    setStatus('idle');
    setProgress(0);
    setElapsed(0);
    setDuration(SPOTIFY_PREVIEW_SECONDS);
    setDiagHint(null);
    setAttachedVideoId(null);
    setLastApiVideoId(null);
    setLastApiTitle(null);
    setPlayerState(null);
    setActivelyPlaying(false);
  }, [clearStallTimer, detachAudio, detachYouTube]);

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

  const scheduleStallCheck = useCallback(
    (key: string) => {
      clearStallTimer();
      stallTimerRef.current = setTimeout(() => {
        stallTimerRef.current = null;
        if (activeKeyRef.current !== key) return;
        const yt = youtubeRef.current;
        if (!yt) return;
        const active = yt.isActivelyPlaying();
        const playerState = yt.getPlayerState?.() ?? null;
        playbackDiag('stall_check', {
          key,
          videoId: currentVideoIdRef.current,
          activelyPlaying: active,
          playerState,
          pageHidden: document.hidden,
        });
        setPlayerState(playerState);
        setActivelyPlaying(active);
        if (active) return;
        setDiagHint(
          'No playback detected — tap play again or use “Try alternate video” in the debug bar.'
        );
      }, 5000);
    },
    [clearStallTimer]
  );

  const playCurrent = useCallback(
    (opts?: { enableSound?: boolean }) => {
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
        const key = activeKeyRef.current;
        playRequestedRef.current = true;

        try {
          const yt = youtubeRef.current;
          yt?.play(enableSound);
          if (enableSound && yt?.isSoundEnabled()) setYoutubeMuted(false);
          if (key) scheduleStallCheck(key);
        } catch {
          setStatus('error');
        }
      }
    },
    [scheduleStallCheck]
  );

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
      mountAudioElement(audio);
      audioRef.current = audio;

      audio.addEventListener('play', () => {
        if (activeKeyRef.current !== key) return;
        setStatus('playing');
        setDiagHint(null);
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
      const autoplay = opts?.autoplay === true;
      const enableSound = opts?.enableSound === true;

      if (
        youtubeRef.current &&
        activeKeyRef.current === key &&
        currentVideoIdRef.current === videoId
      ) {
        playbackDiag('youtube_attach_skip', { key, videoId, reason: 'same_player' });
        setActiveKey(key);
        setSource('youtube');
        sourceRef.current = 'youtube';
        setYoutubeMuted(!enableSound);
        setStatus('ready');
        if (autoplay) {
          playCurrent({ enableSound });
        }
        return;
      }

      detachAudio();
      detachYouTube();
      activeKeyRef.current = key;
      setActiveKey(key);
      sourceRef.current = 'youtube';
      setSource('youtube');
      setDuration(DEFAULT_YOUTUBE_SECONDS);

      setYoutubeMuted(!enableSound);

      currentVideoIdRef.current = videoId;
      setAttachedVideoId(videoId);
      playbackDiag('youtube_attach', {
        key,
        videoId,
        autoplay,
        enableSound,
        source: 'attach',
      });

      youtubeRef.current = new YouTubePreviewPlayer(
        videoId,
        {
          onReady: () => {
            if (activeKeyRef.current !== key) return;
            const d = youtubeRef.current?.getDuration();
            if (d && d > 0) setDuration(d);
            setStatus('ready');
            if (autoplay) {
              playCurrent({ enableSound });
            }
          },
          onMutedChange: (muted) => {
            if (activeKeyRef.current !== key) return;
            setYoutubeMuted(muted);
          },
          onPlaying: () => {
            if (activeKeyRef.current !== key) return;
            clearStallTimer();
            setPlayerState(youtubeRef.current?.getPlayerState() ?? 1);
            setActivelyPlaying(true);
            setStatus('playing');
            setDiagHint(null);
            startProgress();
          },
          onPaused: () => {
            if (activeKeyRef.current !== key) return;
            clearStallTimer();
            setPlayerState(youtubeRef.current?.getPlayerState() ?? 2);
            setActivelyPlaying(false);
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
            playbackDiag('preview_error', { key, code, videoId });
            if (activeKeyRef.current !== key) return;
            const yt = youtubeRef.current;
            if (yt?.isActivelyPlaying()) {
              playbackDiag('preview_error_ignored', {
                key,
                code,
                videoId,
                reason: 'still_playing',
              });
              return;
            }
            if (code === 150 || code === 101) {
              failedVideoIdsRef.current.add(videoId);
              invalidateYouTubePlayback(key, videoId);
            }
            clearStallTimer();
            stopRaf();
            setStatus('error');
            setDiagHint(
              code === 150 || code === 101
                ? 'Embed blocked — use “Try alternate video” in the debug bar.'
                : 'Playback error — tap play to retry.'
            );
          },
        },
        { autoplay, enableSound }
      );
    },
    [
      clearStallTimer,
      detachAudio,
      detachYouTube,
      duration,
      playCurrent,
      startProgress,
      stopRaf,
    ]
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
    [attachSpotify, attachYouTube, detachAudio, detachYouTube]
  );

  const tryAlternateVideo = useCallback(async () => {
    const ctx = loadCtxRef.current;
    if (!ctx) return;

    if (failedVideoIdsRef.current.size >= MAX_VIDEO_ALTERNATES) {
      setStatus('unavailable');
      setDiagHint('No embeddable video found after several attempts');
      return;
    }

    const failedId = currentVideoIdRef.current;
    if (failedId) failedVideoIdsRef.current.add(failedId);
    detachYouTube();

    setStatus('loading');
    setDiagHint(
      import.meta.env.DEV && failedId
        ? `Trying alternate video (blocked ${failedId})…`
        : 'Trying alternate video…'
    );

    try {
      const result = await fetchTrackPlayback(
        ctx.artist,
        ctx.track.title,
        ctx.albumTitle || undefined,
        {
          albumIndex: ctx.albumIndex,
          spotifyTrackId: ctx.track.spotifyTrackId,
          excludeVideoIds: [...failedVideoIdsRef.current],
        }
      );

      if (activeKeyRef.current !== ctx.key) return;

      if (!result.ok) {
        setStatus(result.reason === 'rate_limited' ? 'rate_limited' : 'unavailable');
        setDiagHint('No alternate embeddable video found');
        return;
      }

      if (
        result.data.source === 'youtube' &&
        failedVideoIdsRef.current.has(result.data.videoId)
      ) {
        setStatus('unavailable');
        setDiagHint('No alternate embeddable video found');
        return;
      }

      if (result.data.source === 'youtube') {
        setLastApiVideoId(result.data.videoId);
        setLastApiTitle(result.data.videoTitle ?? null);
      }
      playbackDiag('api_result', {
        key: ctx.key,
        phase: 'alternate',
        source: result.data.source,
        videoId: result.data.source === 'youtube' ? result.data.videoId : undefined,
        videoTitle: result.data.source === 'youtube' ? result.data.videoTitle : undefined,
      });
      applyPlayback(
        result.data,
        ctx.key,
        playRequestedRef.current,
        false
      );
      setDiagHint(null);
    } catch {
      if (activeKeyRef.current === ctx.key) setStatus('error');
    }
  }, [applyPlayback, detachYouTube]);

  useEffect(() => {
    tryAlternateRef.current = () => {
      void tryAlternateVideo();
    };
  }, [tryAlternateVideo]);

  useEffect(() => {
    attachYouTubeRef.current = attachYouTube;
  }, [attachYouTube]);

  const load = useCallback(
    async (
      record: VinylRecord,
      track: Track,
      autoplay = false,
      enableSoundOnAutoplay = false
    ) => {
      const key = playSelectionKey({ recordId: record.id, trackId: track.id });

      if (
        loadInFlightRef.current &&
        loadInFlightRef.current !== key &&
        activeKeyRef.current === loadInFlightRef.current
      ) {
        playbackDiag('load_skip', {
          key,
          reason: 'stale_track',
          active: loadInFlightRef.current,
        });
        return;
      }

      if (loadInFlightRef.current === key) {
        if (autoplay) {
          pendingAutoplayRef.current = { key, enableSound: enableSoundOnAutoplay };
          playRequestedRef.current = true;
        }
        playbackDiag('load_skip', { key, reason: 'in_flight' });
        return;
      }

      if (
        !autoplay &&
        activeKeyRef.current === key &&
        (youtubeRef.current != null || audioRef.current != null)
      ) {
        playbackDiag('load_skip', { key, reason: 'already_attached' });
        return;
      }

      if (loadInFlightRef.current && loadInFlightRef.current !== key) {
        const superseded = loadInFlightRef.current;
        loadGenByKeyRef.current.set(
          superseded,
          (loadGenByKeyRef.current.get(superseded) ?? 0) + 1
        );
      }

      const nextGen = (loadGenByKeyRef.current.get(key) ?? 0) + 1;
      loadGenByKeyRef.current.set(key, nextGen);
      const gen = nextGen;
      const isCurrentLoad = () => loadGenByKeyRef.current.get(key) === gen;
      const clearInFlight = () => {
        if (loadInFlightRef.current === key && isCurrentLoad()) {
          loadInFlightRef.current = null;
        }
      };

      loadInFlightRef.current = key;

      const prevKey = activeKeyRef.current;
      failedVideoIdsRef.current.clear();
      if (prevKey !== key) {
        playRequestedRef.current = false;
      }

      const artist = track.artist?.trim() || record.artist;
      const albumTitle = record.title.trim();
      const albumIndex = record.tracks?.findIndex((t) => t.id === track.id);
      const albumIndexOne =
        albumIndex != null && albumIndex >= 0 ? albumIndex + 1 : undefined;

      loadCtxRef.current = {
        record,
        track,
        key,
        artist,
        albumTitle,
        albumIndex: albumIndexOne,
      };

      updatePlaybackDiagSnapshot({
        lastLoadArtist: artist,
        lastLoadTrack: track.title,
        activeKey: key,
      });

      playbackDiag('load_start', {
        key,
        artist,
        title: track.title,
        album: albumTitle,
        autoplay,
      });

      const cachedPlayback = getPlaybackCached(key);
      const cachedPreview = track.spotifyPreviewUrl?.trim();
      const spotifyData: TrackPlayback | null = cachedPreview
        ? {
            source: 'spotify',
            previewUrl: cachedPreview,
            spotifyTrackId: track.spotifyTrackId,
            durationSec: SPOTIFY_PREVIEW_SECONDS,
          }
        : cachedPlayback?.source === 'spotify'
          ? cachedPlayback
          : null;

      const cachedYouTube =
        cachedPlayback?.source === 'youtube' &&
        !failedVideoIdsRef.current.has(cachedPlayback.videoId)
          ? cachedPlayback
          : null;

      if (spotifyData) {
        const alreadySpotify =
          activeKeyRef.current === key &&
          sourceRef.current === 'spotify' &&
          audioRef.current != null;
        if (alreadySpotify) {
          setActiveKey(key);
          if (autoplay) playCurrent({ enableSound: enableSoundOnAutoplay });
          clearInFlight();
          return;
        }
        activeKeyRef.current = key;
        setActiveKey(key);
        rememberPlayback(key, spotifyData);
        playbackDiag('load_source', { key, source: 'spotify', from: cachedPreview ? 'track' : 'cache' });
        applyPlayback(spotifyData, key, autoplay, enableSoundOnAutoplay);
        clearInFlight();
        return;
      }

      if (cachedYouTube) {
        if (!isCurrentLoad()) {
          playbackDiag('load_stale', { key, gen });
          return;
        }
        activeKeyRef.current = key;
        setActiveKey(key);
        setLastApiVideoId(cachedYouTube.videoId);
        setLastApiTitle(cachedYouTube.videoTitle ?? null);
        playbackDiag('load_source', { key, source: 'youtube', from: 'cache' });
        applyPlayback(cachedYouTube, key, autoplay, enableSoundOnAutoplay);
        clearInFlight();
        return;
      }

      if (isCurrentLoad()) {
        activeKeyRef.current = key;
        setActiveKey(key);
        setStatus('loading');
        setProgress(0);
        setElapsed(0);
        setDiagHint(null);
      }

      const failIfStillLoading = () => {
        if (isCurrentLoad() && activeKeyRef.current === key) setStatus('unavailable');
      };
      const loadTimeout = window.setTimeout(failIfStillLoading, LOAD_TIMEOUT_MS);

      try {
        const result = await fetchTrackPlayback(artist, track.title, albumTitle || undefined, {
          albumIndex: albumIndexOne,
          spotifyTrackId: track.spotifyTrackId,
          excludeVideoIds: [...failedVideoIdsRef.current],
        });
        window.clearTimeout(loadTimeout);
        if (!isCurrentLoad() || activeKeyRef.current !== key) {
          playbackDiag('load_stale', { key, gen });
          return;
        }

        if (!result.ok) {
          playbackDiag('api_result', { key, ok: false, reason: result.reason });
          setStatus(result.reason === 'rate_limited' ? 'rate_limited' : 'unavailable');
          return;
        }

        if (result.data.source === 'youtube') {
          setLastApiVideoId(result.data.videoId);
          setLastApiTitle(result.data.videoTitle ?? null);
        }

        playbackDiag('api_result', {
          key,
          ok: true,
          source: result.data.source,
          videoId: result.data.source === 'youtube' ? result.data.videoId : undefined,
          videoTitle: result.data.source === 'youtube' ? result.data.videoTitle : undefined,
          excludes: [...failedVideoIdsRef.current],
        });

        const apiVideoId =
          result.data.source === 'youtube' ? result.data.videoId : null;

        const sameYoutube =
          apiVideoId != null &&
          youtubeRef.current &&
          activeKeyRef.current === key &&
          currentVideoIdRef.current === apiVideoId;

        if (sameYoutube) {
          playbackDiag('load_skip_attach', {
            key,
            videoId: apiVideoId,
            reason: 'same_video',
          });
          setStatus('ready');
          if (autoplay) {
            playCurrent({ enableSound: enableSoundOnAutoplay });
          }
          return;
        }

        if (
          apiVideoId &&
          currentVideoIdRef.current &&
          currentVideoIdRef.current !== apiVideoId
        ) {
          playbackDiag('video_mismatch_reattach', {
            key,
            attached: currentVideoIdRef.current,
            api: apiVideoId,
          });
        }

        rememberPlayback(key, result.data);
        let shouldAutoplay = autoplay;
        let soundOnAutoplay = enableSoundOnAutoplay;
        const pending = pendingAutoplayRef.current;
        if (pending?.key === key) {
          pendingAutoplayRef.current = null;
          shouldAutoplay = true;
          soundOnAutoplay = pending.enableSound;
        }
        applyPlayback(result.data, key, shouldAutoplay, soundOnAutoplay);
      } catch (err) {
        window.clearTimeout(loadTimeout);
        playbackDiag('load_error', {
          key,
          error: err instanceof Error ? err.message : 'unknown',
        });
        if (isCurrentLoad() && activeKeyRef.current === key) setStatus('error');
      } finally {
        clearInFlight();
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
        return;
      }
      playRequestedRef.current = false;
      youtubeRef.current?.pause();
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

  return {
    status,
    progress,
    elapsed,
    duration,
    activeKey,
    source,
    youtubeMuted,
    diagHint,
    attachedVideoId,
    lastApiVideoId,
    lastApiTitle,
    playerState,
    activelyPlaying,
    getYoutubeMode: () => youtubeRef.current?.getPlayerMode() ?? null,
    tryAlternateVideo,
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