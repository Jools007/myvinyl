import {
  clearAlbumDescriptionCache,
  fetchAlbumCharacterDescription,
} from './albumDescription';
import type { VinylRecord } from './types';

/** ~2.5s between records — respects MusicBrainz 1 req/s inside each API call. */
const RELEASE_GAP_MS = 2500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function recordNeedsCharacterBlurb(record: VinylRecord): boolean {
  return !record.characterBlurb?.trim();
}

export function countRecordsNeedingCharacterBlurbs(records: VinylRecord[]): number {
  return records.filter(recordNeedsCharacterBlurb).length;
}

export type CharacterBlurbRefreshOptions = {
  /** Re-fetch even when characterBlurb is already stored */
  force?: boolean;
};

export type CharacterBlurbRefreshResult = {
  total: number;
  processed: number;
  updated: number;
  skipped: number;
  failed: number;
  cancelled?: boolean;
};

export type CharacterBlurbRefreshProgress = {
  phase: 'idle' | 'running' | 'done';
  message: string;
  completed: number;
  total: number;
  updated: number;
  skipped: number;
  failed: number;
  currentRelease?: string;
};

export const idleCharacterBlurbRefresh: CharacterBlurbRefreshProgress = {
  phase: 'idle',
  message: '',
  completed: 0,
  total: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
};

export interface CharacterBlurbRefreshCallbacks {
  onRecordsChange: (records: VinylRecord[]) => void;
  onProgress: (progress: CharacterBlurbRefreshProgress) => void;
  onPersist: (record: VinylRecord) => void;
  isCancelled: () => boolean;
  getRecord: (id: string) => VinylRecord | undefined;
}

export function formatCharacterBlurbSummary(result: CharacterBlurbRefreshResult): string {
  const parts: string[] = [];
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  if (result.cancelled) parts.push('cancelled');
  return parts.length ? parts.join(' · ') : 'Nothing to refresh';
}

export async function runCharacterBlurbRefresh(
  initialRecords: VinylRecord[],
  callbacks: CharacterBlurbRefreshCallbacks,
  options: CharacterBlurbRefreshOptions = {}
): Promise<CharacterBlurbRefreshResult> {
  const force = options.force ?? false;
  if (force) clearAlbumDescriptionCache();

  const targets = force
    ? initialRecords
    : initialRecords.filter(recordNeedsCharacterBlurb);
  const total = targets.length;
  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  let records = [...initialRecords];

  const report = (message: string, currentRelease?: string) => {
    callbacks.onProgress({
      phase: 'running',
      message,
      completed: processed,
      total,
      updated,
      skipped,
      failed,
      currentRelease,
    });
  };

  if (total === 0) {
    callbacks.onProgress({
      phase: 'done',
      message: force ? 'No records in crate' : 'All records already have character blurbs',
      completed: 0,
      total: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    });
    return { total: 0, processed: 0, updated: 0, skipped: 0, failed: 0 };
  }

  report(force ? `Refreshing ${total} descriptions…` : `Fetching ${total} descriptions…`);

  for (const target of targets) {
    if (callbacks.isCancelled()) break;

    const live = callbacks.getRecord(target.id) ?? records.find((r) => r.id === target.id);
    if (!live) {
      skipped += 1;
      processed += 1;
      continue;
    }

    if (!force && live.characterBlurb?.trim()) {
      skipped += 1;
      processed += 1;
      continue;
    }

    report(`Describing ${live.artist} — ${live.title}`, `${live.artist} — ${live.title}`);

    try {
      const description = await fetchAlbumCharacterDescription(live, { force: true });
      if (description.trim()) {
        const next: VinylRecord = { ...live, characterBlurb: description };
        records = records.map((r) => (r.id === next.id ? next : r));
        callbacks.onRecordsChange(records);
        callbacks.onPersist(next);
        updated += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }

    processed += 1;
    report(
      `Done ${processed} of ${total}`,
      `${live.artist} — ${live.title}`
    );

    if (processed < total && !callbacks.isCancelled()) {
      await sleep(RELEASE_GAP_MS);
    }
  }

  const cancelled = callbacks.isCancelled();
  callbacks.onProgress({
    phase: 'done',
    message: cancelled ? 'Refresh cancelled' : 'Character descriptions complete',
    completed: processed,
    total,
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
    cancelled,
  };
}