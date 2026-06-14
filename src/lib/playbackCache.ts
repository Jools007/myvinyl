import type { TrackPlayback } from './api';

const PLAYBACK_CACHE_MAX = 64;

const playbackCache = new Map<string, TrackPlayback>();

export function hasPlaybackCached(key: string): boolean {
  return playbackCache.has(key);
}

export function getPlaybackCached(key: string): TrackPlayback | undefined {
  return playbackCache.get(key);
}

/** Session cache — Spotify + resolved YouTube ids (invalidate on embed error 150). */
export function rememberPlayback(key: string, data: TrackPlayback): void {
  playbackCache.set(key, data);
  if (playbackCache.size > PLAYBACK_CACHE_MAX) {
    const oldest = playbackCache.keys().next().value;
    if (oldest) playbackCache.delete(oldest);
  }
}

export function forgetPlayback(key: string): void {
  playbackCache.delete(key);
}

/** Drop a cached YouTube id after embed failure so the next load re-queries. */
export function invalidateYouTubePlayback(key: string, videoId: string): void {
  const cached = playbackCache.get(key);
  if (cached?.source === 'youtube' && cached.videoId === videoId) {
    playbackCache.delete(key);
  }
}