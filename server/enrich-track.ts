import { collectEnrichmentCandidates } from './enrich-candidates';
import {
  pickBestBpm,
  pickBestKey,
  pickEstimatedBpmFromProfile,
  pickEstimatedCamelotKey,
  scoreBpmCandidate,
} from './enrich-scoring';
import { toCamelotKey } from './key';
import type { DiscogsTrackRow } from './track-match';

export interface TrackEnrichment {
  bpm?: number;
  camelotKey?: string;
  musicalKey?: string;
  vibeTags: string[];
  bpmEstimated?: boolean;
  keyEstimated?: boolean;
  trackSpecific?: boolean;
  spotifyPreviewUrl?: string;
  spotifyTrackId?: string;
}

/**
 * Smart per-track enrichment: collect candidates from all APIs in parallel,
 * then pick the best BPM and key independently (no fixed API order).
 */
export async function resolveTrackEnrichment(opts: {
  artist: string;
  trackTitle: string;
  albumTitle?: string;
  discogsReleaseTitle?: string;
  trackPosition?: string;
  genres?: string[];
  discogsTracklist?: DiscogsTrackRow[];
  spotifyId?: string;
  spotifySecret?: string;
  lastfmKey?: string;
  trackOnly?: boolean;
  keyFallback?: boolean;
  usedKeys?: string[];
}): Promise<TrackEnrichment> {
  const albumTitle = (opts.discogsReleaseTitle ?? opts.albumTitle)?.trim();
  const genres = opts.genres ?? [];
  const keyFallback = opts.keyFallback === true;

  const usedKeys = opts.usedKeys ?? [];

  const {
    bpm: bpmCandidates,
    key: keyCandidates,
    vibeHints,
    spotifyPreviewUrl,
    spotifyTrackId,
  } = await collectEnrichmentCandidates({
    artist: opts.artist,
    trackTitle: opts.trackTitle,
    albumTitle,
    trackPosition: opts.trackPosition,
    genres,
    discogsTracklist: opts.discogsTracklist,
    spotifyId: opts.spotifyId,
    spotifySecret: opts.spotifySecret,
    lastfmKey: opts.lastfmKey,
    usedKeys,
  });

  const bestBpm = pickBestBpm(bpmCandidates, genres);
  const bestKey = pickBestKey(keyCandidates, genres, usedKeys);

  let camelotKey = bestKey ? toCamelotKey(bestKey.camelotKey) : undefined;
  let keyEstimated = false;

  if (!camelotKey && keyFallback && genres.length) {
    camelotKey = pickEstimatedCamelotKey(
      opts.artist,
      opts.trackTitle,
      genres,
      usedKeys,
      opts.trackPosition
    );
    if (camelotKey) keyEstimated = true;
  }

  let bpm = bestBpm?.bpm;
  let bpmEstimated = false;
  if (bestBpm && scoreBpmCandidate(bestBpm, genres) < 0.28) {
    bpm = undefined;
  }
  if (bpm == null && genres.length) {
    bpm = pickEstimatedBpmFromProfile(
      genres,
      opts.artist,
      opts.trackTitle,
      opts.trackPosition
    );
    bpmEstimated = true;
  }

  return {
    bpm,
    camelotKey,
    vibeTags: vibeHints.slice(0, 6),
    bpmEstimated,
    keyEstimated,
    trackSpecific: Boolean(
      (bestBpm && !bpmEstimated && bestBpm.source !== 'lastfm') || (bestKey && !keyEstimated)
    ),
    spotifyPreviewUrl,
    spotifyTrackId,
  };
}