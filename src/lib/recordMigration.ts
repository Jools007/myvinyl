import { fetchDiscogsRelease } from './api';
import { hasClientDiscogsToken } from './discogsDirect';
import {
  enrichSingleTrackForRecord,
  mergeDiscogsTracklistIntoRecord,
  mergeEnrichedTracksIntoRelease,
  migrateRecord,
} from './tracks';
import { getPrimaryTrack } from './types';
import type { VinylRecord } from './types';

/** Keep manual/API enrichment when background jobs push a fresh records array. */
export function mergePreservingTrackEnrichment(
  prev: VinylRecord[],
  next: VinylRecord[]
): VinylRecord[] {
  const prevById = new Map(prev.map((r) => [r.id, r]));
  const prevByDiscogsId = new Map(
    prev.filter((r) => r.discogsId != null).map((r) => [r.discogsId as number, r])
  );
  return next.map((n) => {
    const p = prevById.get(n.id) ?? (n.discogsId != null ? prevByDiscogsId.get(n.discogsId) : undefined);
    if (!p) return migrateRecord(n);
    return migrateRecord(mergeEnrichedTracksIntoRelease(n, p.tracks));
  });
}

const FORCE_REFRESH_KEY = 'myvinyl:force-tracklist-refresh-v1';
const TRACK_ENRICH_KEY = 'myvinyl:track-enrich-v2';
const DISCOGS_FETCH_DELAY_MS = 300;
const ENRICH_DELAY_MS = 80;
/** Cap API calls per app session so startup stays light */
const MAX_ENRICH_BATCH = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isForceTracklistRefreshDone(): boolean {
  return localStorage.getItem(FORCE_REFRESH_KEY) === 'done';
}

export function markForceTracklistRefreshDone(): void {
  localStorage.setItem(FORCE_REFRESH_KEY, 'done');
}

export function isTrackEnrichMigrationDone(): boolean {
  return localStorage.getItem(TRACK_ENRICH_KEY) === 'done';
}

export function markTrackEnrichMigrationDone(): void {
  localStorage.setItem(TRACK_ENRICH_KEY, 'done');
}

export function needsBackgroundMigration(): boolean {
  if (!hasClientDiscogsToken()) return false;
  return !isForceTracklistRefreshDone() || !isTrackEnrichMigrationDone();
}

function recordNeedsEnrichment(record: VinylRecord): boolean {
  return record.tracks.some((t) => t.bpm == null || !t.camelotKey);
}

export type BackgroundSyncPhase = 'idle' | 'tracklists' | 'enriching' | 'full-tracklists';

export interface BackgroundSyncState {
  phase: BackgroundSyncPhase;
  message: string;
  completed?: number;
  total?: number;
}

const idleStatus: BackgroundSyncState = { phase: 'idle', message: '' };

/** Enrich primary track only (1–2 API calls per release). */
async function enrichRecordPrimary(record: VinylRecord): Promise<VinylRecord> {
  const primary = getPrimaryTrack(record);
  if (!primary || (primary.bpm != null && primary.camelotKey)) return record;

  const enriched = await enrichSingleTrackForRecord(record, primary.id);
  if (!enriched) return record;

  return mergeEnrichedTracksIntoRelease(record, [enriched]);
}

export interface BackgroundMigrationCallbacks {
  onRecordsChange: (records: VinylRecord[]) => void;
  onStatus: (status: BackgroundSyncState) => void;
  isCancelled: () => boolean;
}

/**
 * Runs after the UI is interactive. Updates records incrementally; never blocks first paint.
 */
export async function runBackgroundMigrations(
  initialRecords: VinylRecord[],
  callbacks: BackgroundMigrationCallbacks
): Promise<void> {
  const { onRecordsChange, onStatus, isCancelled } = callbacks;
  let records = initialRecords.map((r) => migrateRecord(r));

  try {
    if (!hasClientDiscogsToken()) return;

    if (!isForceTracklistRefreshDone()) {
      const targets = records.filter((r) => r.discogsId != null);
      let done = 0;

      onStatus({
        phase: 'tracklists',
        message: 'Updating tracklists…',
        completed: 0,
        total: targets.length,
      });

      const working = [...records];
      for (let i = 0; i < working.length; i++) {
        if (isCancelled()) return;

        const record = working[i];
        if (!record.discogsId) continue;

        try {
          const discogs = await fetchDiscogsRelease(record.discogsId);
          working[i] = mergeDiscogsTracklistIntoRecord(record, discogs);
        } catch {
          /* keep existing row */
        }

        done += 1;
        records = [...working];
        onRecordsChange(records);
        onStatus({
          phase: 'tracklists',
          message: 'Updating tracklists…',
          completed: done,
          total: targets.length,
        });

        if (done < targets.length) await sleep(DISCOGS_FETCH_DELAY_MS);
      }

      markForceTracklistRefreshDone();
    }

    if (!isTrackEnrichMigrationDone() && !isCancelled()) {
      const pending = records.filter(recordNeedsEnrichment);
      const batch = pending.slice(0, MAX_ENRICH_BATCH);
      const total = pending.length;

      if (batch.length > 0) {
        onStatus({
          phase: 'enriching',
          message: 'Enriching tracks…',
          completed: 0,
          total: batch.length,
        });

        for (let i = 0; i < batch.length; i++) {
          if (isCancelled()) return;

          const record = batch[i];
          const updated = await enrichRecordPrimary(record);
          records = records.map((r) => (r.id === record.id ? updated : r));
          onRecordsChange(records);
          onStatus({
            phase: 'enriching',
            message: 'Enriching tracks…',
            completed: i + 1,
            total: batch.length,
          });

          if (i < batch.length - 1) await sleep(ENRICH_DELAY_MS);
        }
      }

      if (records.every((r) => !recordNeedsEnrichment(r))) {
        markTrackEnrichMigrationDone();
      } else if (pending.length > MAX_ENRICH_BATCH) {
        onStatus({
          phase: 'enriching',
          message: `Enriched ${batch.length} of ${total} — tap Enrich on more tracks`,
          completed: batch.length,
          total,
        });
        await sleep(2000);
      } else {
        markTrackEnrichMigrationDone();
      }
    }
  } finally {
    if (!isCancelled()) onStatus(idleStatus);
  }
}