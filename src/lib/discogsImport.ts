import { fetchDiscogsRelease } from './api';
import type { DiscogsCollectionRelease } from './api';
import { resolveDiscogsCoverUrl } from './discogsCover';
import { isCdFormat } from './formats';
import { createPrimaryTrack, releaseFromDiscogsImport, migrateRecord } from './tracks';
import type { VinylRecord } from './types';

export type DiscogsCollectionReleasePayload = DiscogsCollectionRelease;

export type DiscogsCollectionPagination = {
  page: number;
  pages: number;
  per_page: number;
  items: number;
};

const IMPORT_TRACKLIST_CONCURRENCY = 4;
const IMPORT_TRACKLIST_BATCH_DELAY_MS = 280;

function releaseBaseFromCollectionRow(
  row: DiscogsCollectionReleasePayload
): Omit<VinylRecord, 'id' | 'addedAt' | 'tracks'> | null {
  if (row.isCdOnly || isCdFormat(row.format)) return null;

  return {
    discogsId: row.discogsId,
    artist: row.artist,
    title: row.title,
    year: row.year,
    format: row.format,
    coverUrl: resolveDiscogsCoverUrl(row.coverUrl),
    genres: row.genres,
    condition: 'NM',
    addSource: 'discogs-import',
  };
}

/** Fallback when release detail fetch fails during bulk import. */
export function collectionReleaseToRecord(
  row: DiscogsCollectionReleasePayload
): Omit<VinylRecord, 'id' | 'addedAt'> | null {
  const base = releaseBaseFromCollectionRow(row);
  if (!base) return null;
  return {
    ...base,
    tracks: [createPrimaryTrack(row.title, { vibeTags: [] })],
  };
}

/** Fetch Discogs release detail and map the full tracklist. */
export async function importRecordWithTracklist(
  row: DiscogsCollectionReleasePayload
): Promise<Omit<VinylRecord, 'id' | 'addedAt'> | null> {
  const base = releaseBaseFromCollectionRow(row);
  if (!base) return null;

  try {
    const detail = await fetchDiscogsRelease(row.discogsId);
    return releaseFromDiscogsImport(base, {
      tracklist: detail.tracklist,
      bpm: detail.bpm,
      camelotKey: detail.camelotKey,
      musicalKey: detail.musicalKey,
    });
  } catch {
    return collectionReleaseToRecord(row);
  }
}

/** Hydrate collection rows with full Discogs tracklists (rate-limited concurrency). */
export async function buildImportRecordsWithTracklists(
  rows: DiscogsCollectionReleasePayload[],
  onProgress?: (completed: number, total: number) => void
): Promise<Omit<VinylRecord, 'id' | 'addedAt'>[]> {
  const records: Omit<VinylRecord, 'id' | 'addedAt'>[] = [];
  const total = rows.length;

  for (let i = 0; i < rows.length; i += IMPORT_TRACKLIST_CONCURRENCY) {
    const chunk = rows.slice(i, i + IMPORT_TRACKLIST_CONCURRENCY);
    const settled = await Promise.all(chunk.map((row) => importRecordWithTracklist(row)));
    for (const record of settled) {
      if (record) records.push(record);
    }
    onProgress?.(Math.min(i + chunk.length, total), total);
    if (i + IMPORT_TRACKLIST_CONCURRENCY < rows.length) {
      await new Promise((r) => setTimeout(r, IMPORT_TRACKLIST_BATCH_DELAY_MS));
    }
  }

  return records;
}

export function bulkImportCollectionRecords(
  existing: VinylRecord[],
  incoming: Omit<VinylRecord, 'id' | 'addedAt'>[],
  createId: () => string
): { records: VinylRecord[]; added: number; skipped: number } {
  const seen = new Set(
    existing.map((r) => r.discogsId).filter((id): id is number => id != null)
  );

  const toPrepend: VinylRecord[] = [];
  let skipped = 0;

  for (const raw of incoming) {
    if (raw.discogsId != null && seen.has(raw.discogsId)) {
      skipped += 1;
      continue;
    }
    if (isCdFormat(raw.format)) {
      skipped += 1;
      continue;
    }
    const entry = migrateRecord({
      ...raw,
      id: createId(),
      addedAt: new Date().toISOString(),
      tracks: raw.tracks.map((t) => ({ ...t, vibeTags: t.vibeTags ?? [] })),
    });
    if (raw.discogsId != null) seen.add(raw.discogsId);
    toPrepend.push(entry);
  }

  return {
    records: [...toPrepend, ...existing],
    added: toPrepend.length,
    skipped,
  };
}