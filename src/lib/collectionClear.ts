import type { RecordAddSource, VinylRecord } from './types';

export type ClearCollectionMode = 'manual' | 'imported' | 'all';

/**
 * Resolve how a record entered the crate. Explicit `addSource` wins; legacy rows
 * without it use a bulk-import stub heuristic (not `discogsId` alone — search adds
 * also carry a Discogs id).
 */
export function inferAddSource(record: VinylRecord): RecordAddSource {
  if (record.addSource === 'discogs-import' || record.addSource === 'manual') {
    return record.addSource;
  }
  if (isLikelyDiscogsBulkImport(record)) return 'discogs-import';
  return 'manual';
}

/** Legacy bulk import: single placeholder primary track, no Discogs tracklist rows. */
export function isLikelyDiscogsBulkImport(record: VinylRecord): boolean {
  if (record.discogsId == null) return false;
  const tracks = record.tracks ?? [];
  if (tracks.length !== 1) return false;
  const t = tracks[0];
  if (!t.isPrimary) return false;
  if (t.discogsTrackId != null || t.position || t.duration) return false;
  return true;
}

export function isImportedRecord(record: VinylRecord): boolean {
  return inferAddSource(record) === 'discogs-import';
}

export function isManualRecord(record: VinylRecord): boolean {
  return inferAddSource(record) === 'manual';
}

export function countRecordsForClearMode(
  records: VinylRecord[],
  mode: ClearCollectionMode
): number {
  if (mode === 'all') return records.length;
  if (mode === 'imported') return records.filter(isImportedRecord).length;
  return records.filter(isManualRecord).length;
}

export function filterRecordsForClearMode(
  records: VinylRecord[],
  mode: ClearCollectionMode
): VinylRecord[] {
  if (mode === 'all') return [];
  if (mode === 'imported') return records.filter(isImportedRecord);
  return records.filter(isManualRecord);
}

export function recordsAfterClear(
  records: VinylRecord[],
  mode: ClearCollectionMode
): VinylRecord[] {
  if (mode === 'all') return [];
  const removeIds = new Set(filterRecordsForClearMode(records, mode).map((r) => r.id));
  return records.filter((r) => !removeIds.has(r.id));
}

export const RESET_COLLECTION_OPTIONS: {
  mode: ClearCollectionMode;
  title: string;
  description: string;
}[] = [
  {
    mode: 'manual',
    title: 'Manually added only',
    description:
      'Removes releases you added one at a time — Discogs search, Add Record, and demo data. Bulk Discogs imports stay.',
  },
  {
    mode: 'imported',
    title: 'Imported from Discogs only',
    description:
      'Removes releases brought in via Import from Discogs. Search and manual adds stay in your crate.',
  },
  {
    mode: 'all',
    title: 'Entire collection',
    description:
      'Empties your local crate on this device. You would need to re-import or add records again.',
  },
];

/** @deprecated Use RESET_COLLECTION_OPTIONS */
export const CLEAR_COLLECTION_OPTIONS = RESET_COLLECTION_OPTIONS;

export function addSourceLabel(source?: RecordAddSource): string {
  return source === 'discogs-import' ? 'imported' : 'manual';
}