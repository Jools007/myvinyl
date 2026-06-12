import {
  enrichReleaseTracksSequential,
  migrateRecord,
  replaceTrackOnRelease,
} from './tracks';
import { resolveTrackCamelot } from './camelot';
import type { Track, VinylRecord } from './types';

const RELEASE_GAP_MS = 180;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function trackNeedsMetadataEnrichment(track: Track): boolean {
  return track.bpm == null || !resolveTrackCamelot(track).code;
}

export function releaseNeedsMetadataEnrichment(record: VinylRecord): boolean {
  return record.tracks.length > 0 && record.tracks.some(trackNeedsMetadataEnrichment);
}

export function isPrimaryTrackEnriched(record: VinylRecord): boolean {
  const primary = record.tracks.find((t) => t.isPrimary) ?? record.tracks[0];
  if (!primary) return false;
  return primary.bpm != null && Boolean(resolveTrackCamelot(primary).code);
}

export function countTracksNeedingMetadata(records: VinylRecord[]): number {
  return records.reduce(
    (sum, record) => sum + record.tracks.filter(trackNeedsMetadataEnrichment).length,
    0
  );
}

export function countReleasesNeedingMetadata(records: VinylRecord[]): number {
  return records.filter(releaseNeedsMetadataEnrichment).length;
}

export type FullMetadataEnrichmentResult = {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  tracksTotal: number;
  tracksCompleted: number;
  tracksEnriched: number;
  cancelled?: boolean;
};

export type FullMetadataEnrichmentProgress = {
  phase: 'idle' | 'running' | 'done';
  message: string;
  completed: number;
  total: number;
  tracksCompleted: number;
  tracksTotal: number;
  tracksEnriched: number;
  updated: number;
  skipped: number;
  failed: number;
  currentRelease?: string;
};

export const idleMetadataEnrichment: FullMetadataEnrichmentProgress = {
  phase: 'idle',
  message: '',
  completed: 0,
  total: 0,
  tracksCompleted: 0,
  tracksTotal: 0,
  tracksEnriched: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

export interface FullMetadataEnrichmentCallbacks {
  onRecordsChange: (records: VinylRecord[]) => void;
  onProgress: (progress: FullMetadataEnrichmentProgress) => void;
  onPersist: (record: VinylRecord) => void;
  isCancelled: () => boolean;
  getRecord: (id: string) => VinylRecord | undefined;
}

export async function runFullMetadataEnrichment(
  initialRecords: VinylRecord[],
  callbacks: FullMetadataEnrichmentCallbacks
): Promise<FullMetadataEnrichmentResult> {
  const targets = initialRecords.filter(releaseNeedsMetadataEnrichment);
  const tracksTotal = countTracksNeedingMetadata(initialRecords);
  const total = targets.length;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let tracksCompleted = 0;
  let tracksEnriched = 0;
  let records = initialRecords.map((r) => migrateRecord(r));

  const report = (message: string, currentRelease?: string) => {
    callbacks.onProgress({
      phase: 'running',
      message,
      completed: processed,
      total,
      tracksCompleted,
      tracksTotal,
      tracksEnriched,
      updated,
      skipped,
      failed,
      currentRelease,
    });
  };

  if (total === 0 || tracksTotal === 0) {
    callbacks.onProgress({
      phase: 'done',
      message: 'All tracks already have BPM & key',
      completed: 0,
      total: 0,
      tracksCompleted: 0,
      tracksTotal: 0,
      tracksEnriched: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    return {
      total: 0,
      processed: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      tracksTotal: 0,
      tracksCompleted: 0,
      tracksEnriched: 0,
    };
  }

  report(`Enriching ${tracksTotal} tracks…`);

  for (const target of targets) {
    if (callbacks.isCancelled()) break;

    const live = callbacks.getRecord(target.id) ?? records.find((r) => r.id === target.id);
    if (!live) {
      skipped += 1;
      processed += 1;
      continue;
    }

    const tracksNeeding = live.tracks.filter(trackNeedsMetadataEnrichment);
    if (tracksNeeding.length === 0) {
      skipped += 1;
      processed += 1;
      continue;
    }

    const label = `${target.artist} — ${target.title}`;
    report(`Enriching ${tracksNeeding.length} track${tracksNeeding.length === 1 ? '' : 's'}`, label);

    const beforeSig = JSON.stringify(
      live.tracks.map((t) => [t.id, t.bpm, resolveTrackCamelot(t).code])
    );
    let apiCallsThisRelease = 0;

    try {
      await enrichReleaseTracksSequential(
        live,
        {
          discogsId: live.discogsId,
          albumTitle: live.title,
          genres: live.genres,
          force: false,
        },
        {
          isCancelled: callbacks.isCancelled,
          getTrack: (trackId) =>
            callbacks.getRecord(live.id)?.tracks.find((t) => t.id === trackId) ??
            records.find((r) => r.id === live.id)?.tracks.find((t) => t.id === trackId),
          onTrackStart: () => {
            apiCallsThisRelease += 1;
          },
          onTrackEnriched: (enrichedTrack) => {
            const beforeTrack = live.tracks.find((t) => t.id === enrichedTrack.id);
            const wasNeeding = beforeTrack ? trackNeedsMetadataEnrichment(beforeTrack) : false;
            const nowComplete =
              enrichedTrack.bpm != null && Boolean(resolveTrackCamelot(enrichedTrack).code);
            const improved =
              beforeTrack != null &&
              ((beforeTrack.bpm == null && enrichedTrack.bpm != null) ||
                (!resolveTrackCamelot(beforeTrack).code && Boolean(resolveTrackCamelot(enrichedTrack).code)));

            if (wasNeeding && nowComplete) {
              tracksEnriched += 1;
              tracksCompleted += 1;
            }

            records = records.map((r) =>
              r.id === live.id ? replaceTrackOnRelease(r, enrichedTrack) : r
            );
            callbacks.onRecordsChange(records);

            const afterRecord = records.find((r) => r.id === live.id);
            if (afterRecord && improved) {
              callbacks.onPersist(afterRecord);
            }

            if (wasNeeding) {
              const remaining = tracksTotal - tracksCompleted;
              report(
                remaining > 0 ? `Enriching ${remaining} left…` : 'Finishing up…',
                label
              );
            }
          },
        }
      );

      if (callbacks.isCancelled()) break;

      const after = records.find((r) => r.id === live.id);
      const afterSig = after
        ? JSON.stringify(after.tracks.map((t) => [t.id, t.bpm, resolveTrackCamelot(t).code]))
        : beforeSig;

      if (after && afterSig !== beforeSig) {
        updated += 1;
        callbacks.onPersist(after);
      } else if (apiCallsThisRelease === 0) {
        skipped += 1;
      } else {
        skipped += 1;
      }
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[metadata-enrich] Failed ${label}: ${msg}`);
    }

    processed += 1;
    report('Enriching BPM, keys & vibes…');

    if (processed < total && !callbacks.isCancelled() && apiCallsThisRelease > 0) {
      await sleep(RELEASE_GAP_MS);
    }
  }

  const cancelled = callbacks.isCancelled();

  callbacks.onProgress({
    phase: 'done',
    message: cancelled ? 'Enrichment cancelled' : 'Metadata enrichment complete',
    completed: processed,
    total,
    tracksCompleted,
    tracksTotal,
    tracksEnriched,
    updated,
    skipped,
    failed,
  });

  return {
    total,
    processed,
    updated,
    skipped,
    failed,
    tracksTotal,
    tracksCompleted,
    tracksEnriched,
    cancelled,
  };
}

export function formatMetadataEnrichmentSummary(result: FullMetadataEnrichmentResult): string {
  const parts: string[] = [];
  if (result.tracksEnriched > 0) {
    parts.push(`${result.tracksEnriched} track${result.tracksEnriched === 1 ? '' : 's'} enriched`);
  } else if (result.updated > 0) {
    parts.push(`${result.updated} release${result.updated === 1 ? '' : 's'} updated`);
  }
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.cancelled) parts.push('cancelled');
  return parts.length ? parts.join(' · ') : 'Nothing to enrich';
}