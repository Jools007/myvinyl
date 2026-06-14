import { useEffect, useRef } from 'react';
import { fetchTrackPlayback } from '../lib/api';
import { hasPlaybackCached, rememberPlayback } from '../lib/playbackCache';
import { playSelectionKey } from '../lib/playSession';
import type { Track, VinylRecord } from '../lib/types';

const SPOTIFY_PREVIEW_SECONDS = 30;
const PREFETCH_MAX = 8;
const PREFETCH_CONCURRENCY = 2;

type PrefetchEntry = { record: VinylRecord; track: Track };

/**
 * Background Spotify/YouTube lookup for queue + browse picks.
 * Drives `[play-audio]` lines in the Vite dev terminal while you build a set.
 */
export function usePlaybackPrefetch(entries: PrefetchEntry[], skipKey: string | null): void {
  const inflightRef = useRef(0);
  const generationRef = useRef(0);

  useEffect(() => {
    const gen = ++generationRef.current;
    const seen = new Set<string>();
    const queue: Array<PrefetchEntry & { key: string }> = [];

    for (const entry of entries) {
      const key = playSelectionKey({
        recordId: entry.record.id,
        trackId: entry.track.id,
      });
      if (key === skipKey || seen.has(key) || hasPlaybackCached(key)) continue;
      seen.add(key);
      queue.push({ ...entry, key });
      if (queue.length >= PREFETCH_MAX) break;
    }

    if (!queue.length) return;

    let cancelled = false;

    const waitForSlot = async (): Promise<boolean> => {
      while (inflightRef.current >= PREFETCH_CONCURRENCY) {
        await new Promise((r) => setTimeout(r, 150));
        if (cancelled || generationRef.current !== gen) return false;
      }
      return true;
    };

    const run = async () => {
      for (const item of queue) {
        if (cancelled || generationRef.current !== gen) return;
        if (hasPlaybackCached(item.key)) continue;

        const preview = item.track.spotifyPreviewUrl?.trim();
        if (preview) {
          rememberPlayback(item.key, {
            source: 'spotify',
            previewUrl: preview,
            spotifyTrackId: item.track.spotifyTrackId,
            durationSec: SPOTIFY_PREVIEW_SECONDS,
          });
          continue;
        }

        if (!(await waitForSlot())) return;
        inflightRef.current++;

        try {
          const artist = item.track.artist?.trim() || item.record.artist;
          const albumIndex = item.record.tracks?.findIndex((t) => t.id === item.track.id);
          const result = await fetchTrackPlayback(
            artist,
            item.track.title,
            item.record.title.trim() || undefined,
            {
              albumIndex: albumIndex != null && albumIndex >= 0 ? albumIndex + 1 : undefined,
              spotifyTrackId: item.track.spotifyTrackId,
            }
          );
          if (cancelled || generationRef.current !== gen) return;
          // Only cache Spotify — YouTube embed validity is browser-specific; caching
          // stale videoIds (e.g. error 150) poisons the active load path.
          if (result.ok) {
            rememberPlayback(item.key, result.data);
          }
        } catch {
          /* prefetch is best-effort */
        } finally {
          inflightRef.current--;
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [entries, skipKey]);
}