import { fetchDiscogsRelease } from './api';
import {
  isPlayableDiscogsTrack,
  mergeDiscogsTracklistIntoRecord,
  migrateRecord,
} from './tracks';
import type { Track, VinylRecord } from './types';

/** Stay under Discogs ~60 req/min (server proxy shares one token). */
const DISCOGS_FETCH_DELAY_MS = 1100;
const RATE_LIMIT_BACKOFF_MS = 8000;
const MAX_FETCH_RETRIES = 4;

/** Large collections enrich in bounded batches so the browser stays responsive. */
export const TRACKLIST_ENRICH_LARGE_THRESHOLD = 100;
export const TRACKLIST_ENRICH_BATCH_SIZE = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tracklistSignature(tracks: Track[]): string {
  return tracks
    .map((t) => `${t.position ?? ''}|${t.title.trim().toLowerCase()}`)
    .join('\n');
}

export function tracklistWouldChange(record: VinylRecord, merged: VinylRecord): boolean {
  return tracklistSignature(record.tracks) !== tracklistSignature(merged.tracks);
}

export function countDiscogsLinkedRecords(records: VinylRecord[]): number {
  return records.filter((r) => r.discogsId != null).length;
}

/** Releases that likely only have a partial Discogs import (single track). */
export function countLikelyIncompleteTracklists(records: VinylRecord[]): number {
  return records.filter((r) => r.discogsId != null && r.tracks.length <= 1).length;
}

function isRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  return lower.includes('rate limit') || lower.includes('429');
}

async function fetchReleaseWithRetry(
  discogsId: number,
  isCancelled: () => boolean
): Promise<Awaited<ReturnType<typeof fetchDiscogsRelease>> | null> {
  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    if (isCancelled()) return null;
    try {
      return await fetchDiscogsRelease(discogsId);
    } catch (err) {
      if (isRateLimitError(err) && attempt < MAX_FETCH_RETRIES) {
        const backoff = RATE_LIMIT_BACKOFF_MS * (attempt + 1);
        console.info(
          `[tracklist-enrich] Rate limited on release ${discogsId}; waiting ${backoff}ms (attempt ${attempt + 1})`
        );
        await sleep(backoff);
        continue;
      }
      throw err;
    }
  }
  return null;
}

export type FullTracklistEnrichmentResult = {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
};

export type FullTracklistEnrichmentProgress = {
  phase: 'idle' | 'running' | 'done';
  message: string;
  completed: number;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
};

export const idleTracklistEnrichment: FullTracklistEnrichmentProgress = {
  phase: 'idle',
  message: '',
  completed: 0,
  total: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

export interface FullTracklistEnrichmentCallbacks {
  onRecordsChange: (records: VinylRecord[]) => void;
  onProgress: (progress: FullTracklistEnrichmentProgress) => void;
  onPersist: (record: VinylRecord) => void;
  isCancelled: () => boolean;
}

/**
 * One-time (re-runnable) batch: fetch full Discogs tracklists for every release with discogsId.
 * Idempotent — skips rows where the merged tracklist matches what is already stored.
 */
export type FullTracklistEnrichmentOptions = {
  /** Cap releases processed this run (large collections). Omit for no cap. */
  maxPerRun?: number;
  /** When true, only process releases that still look import-incomplete (≤1 track). */
  incompleteOnly?: boolean;
  /** Cumulative completed count from prior batches (large-crate auto-continue). */
  progressOffset?: number;
  /** Total linked releases in the collection (for stable progress denominator). */
  progressTotal?: number;
};

export const BATCH_PAUSE_MS = 4000;

export function countIncompleteTracklistTargets(records: VinylRecord[]): number {
  return records.filter((r) => r.discogsId != null && r.tracks.length <= 1).length;
}

export async function runFullTracklistEnrichment(
  initialRecords: VinylRecord[],
  callbacks: FullTracklistEnrichmentCallbacks,
  options?: FullTracklistEnrichmentOptions
): Promise<FullTracklistEnrichmentResult> {
  const { onRecordsChange, onProgress, onPersist, isCancelled } = callbacks;

  let records = initialRecords.map((r) => migrateRecord(r));
  const targets = records.filter((r) => {
    if (r.discogsId == null) return false;
    if (options?.incompleteOnly) return r.tracks.length <= 1;
    return true;
  });
  const total = targets.length;

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  const progressOffset = options?.progressOffset ?? 0;
  const progressTotal = options?.progressTotal ?? total;

  const report = (message: string) => {
    onProgress({
      phase: 'running',
      message,
      completed: progressOffset + processed,
      total: progressTotal,
      updated,
      skipped,
      failed,
    });
  };

  console.info(`[tracklist-enrich] Starting full tracklist enrichment for ${total} releases`);

  if (total === 0) {
    onProgress({ ...idleTracklistEnrichment, phase: 'done', message: 'No Discogs-linked releases' });
    return { total: 0, processed: 0, updated: 0, skipped: 0, failed: 0 };
  }

  const maxPerRun = options?.maxPerRun;
  report(
    maxPerRun != null && total > maxPerRun
      ? `Enriching tracklists (batch of ${maxPerRun})…`
      : 'Enriching tracklists from Discogs…'
  );

  const working = [...records];

  const targetIds = new Set(targets.map((r) => r.id));

  for (let i = 0; i < working.length; i++) {
    if (isCancelled()) {
      console.info('[tracklist-enrich] Cancelled by caller');
      break;
    }
    if (maxPerRun != null && processed >= maxPerRun) {
      console.info(`[tracklist-enrich] Batch cap reached (${maxPerRun})`);
      break;
    }

    const record = working[i];
    const discogsId = record.discogsId;
    if (discogsId == null || !targetIds.has(record.id)) continue;

    processed += 1;
    const label = `${record.artist} — ${record.title}`;

    try {
      const discogs = await fetchReleaseWithRetry(discogsId, isCancelled);
      if (!discogs || isCancelled()) break;

      const playableCount = (discogs.tracklist ?? []).filter(isPlayableDiscogsTrack).length;
      if (playableCount === 0) {
        skipped += 1;
        console.info(`[tracklist-enrich] Skip (no playable tracks): ${label}`);
      } else {
        const merged = migrateRecord(mergeDiscogsTracklistIntoRecord(record, discogs));
        if (tracklistWouldChange(record, merged)) {
          working[i] = merged;
          updated += 1;
          records = [...working];
          onRecordsChange(records);
          onPersist(merged);
          console.info(
            `[tracklist-enrich] Updated ${label}: ${record.tracks.length} → ${merged.tracks.length} tracks`
          );
        } else {
          skipped += 1;
          console.info(`[tracklist-enrich] Unchanged: ${label} (${record.tracks.length} tracks)`);
        }
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[tracklist-enrich] Failed ${label} (discogs ${discogsId}): ${msg}`);
    }

    report('Enriching tracklists from Discogs…');

    if (processed < total && !isCancelled()) {
      await sleep(DISCOGS_FETCH_DELAY_MS);
    }
  }

  const result: FullTracklistEnrichmentResult = {
    total,
    processed,
    updated,
    skipped,
    failed,
  };

  console.info(
    `[tracklist-enrich] Done — updated ${updated}, skipped ${skipped}, failed ${failed} (${processed}/${total} processed)`
  );

  onProgress({
    phase: 'done',
    message: formatEnrichmentSummary(result),
    completed: progressOffset + processed,
    total: progressTotal,
    updated,
    skipped,
    failed,
  });

  return result;
}

export function formatEnrichmentSummary(result: FullTracklistEnrichmentResult): string {
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (parts.length === 0) return 'No Discogs-linked releases to enrich';
  return parts.join(', ');
}