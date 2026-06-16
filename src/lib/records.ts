import { resolveDiscogsCoverUrl } from './discogsCover';
import { parseFilterList } from './filterLabels';
import { migrateRecord } from './tracks';
import { supabase } from './supabase';
import type { RecordCondition, Track, VinylRecord } from './types';

const TABLE = 'records';

const SCOPED_RECORD_COLUMNS =
  'id,user_id,collection_id,title,artist,year,format,genre,cover_image,tracklist,condition,discogs_id,bpm,barcode,created_at';

const LEGACY_RECORD_COLUMNS =
  'id,user_id,title,artist,year,format,genre,cover_image,tracklist,condition,discogs_id,bpm,barcode,created_at';

/** List/grid load — omits heavy tracklist JSON (placeholder track synthesized client-side). */
const SCOPED_SUMMARY_COLUMNS =
  'id,user_id,collection_id,title,artist,year,format,genre,cover_image,condition,discogs_id,bpm,barcode,created_at';

const LEGACY_SUMMARY_COLUMNS =
  'id,user_id,title,artist,year,format,genre,cover_image,condition,discogs_id,bpm,barcode,created_at';

type RecordsSchemaMode = 'unknown' | 'scoped' | 'legacy';

let recordsSchemaMode: RecordsSchemaMode = 'unknown';
let recordsSchemaProbe: Promise<RecordsSchemaMode> | null = null;

function isMissingCollectionIdColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes('collection_id') && lower.includes('does not exist');
}

function selectColumns(summaryOnly = false): string {
  if (summaryOnly) {
    return recordsSchemaMode === 'legacy' ? LEGACY_SUMMARY_COLUMNS : SCOPED_SUMMARY_COLUMNS;
  }
  return recordsSchemaMode === 'legacy' ? LEGACY_RECORD_COLUMNS : SCOPED_RECORD_COLUMNS;
}

function useLegacyRecordsSchema(): void {
  recordsSchemaMode = 'legacy';
}

function supportsCollectionIdColumn(): boolean {
  return recordsSchemaMode !== 'legacy';
}

/** Probe whether records.collection_id exists (cached). Legacy mode when migrations are not applied. */
export async function probeRecordsSchema(): Promise<boolean> {
  if (recordsSchemaMode === 'scoped') return true;
  if (recordsSchemaMode === 'legacy') return false;

  if (!recordsSchemaProbe) {
    recordsSchemaProbe = (async () => {
      const { error } = await supabase.from(TABLE).select('collection_id').limit(1);
      if (error && isMissingCollectionIdColumnError(error.message)) {
        useLegacyRecordsSchema();
        return 'legacy' as const;
      }
      recordsSchemaMode = 'scoped';
      return 'scoped' as const;
    })();
  }

  const mode = await recordsSchemaProbe;
  return mode === 'scoped';
}

async function ensureRecordsSchemaProbed(): Promise<void> {
  await probeRecordsSchema();
}

export type FetchRecordsOptions = {
  userId?: string;
  /** When set, returns records for this crate (plus legacy null rows for personal crate). */
  collectionId?: string;
  /** Personal crate id — used to include legacy rows with null collection_id. */
  personalCollectionId?: string;
  /** Skip tracklist JSON — much faster for 1k+ record guest crates. */
  summaryOnly?: boolean;
  /** When this returns false, pagination stops (stale crate switch). */
  shouldContinue?: () => boolean;
};

export type PersistRecordOptions = {
  userId?: string;
  collectionId?: string;
};

export type RecordRow = {
  id: string;
  user_id: string;
  collection_id?: string | null;
  title: string;
  artist: string;
  year: string | number | null;
  format: string | null;
  genre: string | string[] | null;
  cover_image: string | null;
  tracklist: Track[] | null;
  condition: string | null;
  discogs_id: number | null;
  bpm: number | null;
  barcode: string | null;
  created_at: string;
};

export type RecordsError = {
  message: string;
  code?: string;
};

export type FetchRecordsResult =
  | { data: VinylRecord[]; error: null }
  | { data: null; error: RecordsError };

export type AddRecordResult =
  | { data: VinylRecord; error: null }
  | { data: null; error: RecordsError };

export type AddRecordsBatchResult =
  | { data: VinylRecord[]; error: null; failed: number }
  | { data: VinylRecord[] | null; error: RecordsError; failed: number };

const INSERT_BATCH_SIZE = 15;
/** PostgREST defaults to 1000 rows — paginate so large guest crates load fully. */
const FETCH_PAGE_SIZE = 500;

let inFlightFetch: Promise<FetchRecordsResult> | null = null;
let inFlightFetchKey = '';

type PageQueryResult = { data: unknown[] | null; error: { message: string } | null };

async function fetchAllPages(
  fetchPage: (from: number, to: number) => Promise<PageQueryResult>,
  shouldContinue?: () => boolean
): Promise<{ rows: RecordRow[]; error: RecordsError | null }> {
  const rows: RecordRow[] = [];
  let offset = 0;

  while (true) {
    if (shouldContinue && !shouldContinue()) {
      return { rows: [], error: { message: 'Fetch cancelled' } };
    }
    const { data, error } = await fetchPage(offset, offset + FETCH_PAGE_SIZE - 1);
    if (error) {
      return { rows: [], error: toRecordsError(error) };
    }

    const page = (data ?? []) as RecordRow[];
    rows.push(...page);
    if (page.length < FETCH_PAGE_SIZE) break;
    offset += FETCH_PAGE_SIZE;
  }

  return { rows, error: null };
}

export type DeleteRecordResult =
  | { data: true; error: null }
  | { data: null; error: RecordsError };

export type UpdateRecordResult =
  | { data: VinylRecord; error: null }
  | { data: null; error: RecordsError };

async function resolveUserId(userId?: string): Promise<string> {
  if (userId?.trim()) return userId.trim();

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  const userIdFromSession = session?.user?.id;
  if (error || !userIdFromSession) {
    throw new Error('Not authenticated');
  }

  return userIdFromSession;
}

function toRecordsError(error: { message: string; code?: string }): RecordsError {
  return { message: error.message, code: error.code };
}

export function isPersistedRecordId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function parseGenre(genre: string | string[] | null | undefined): string[] {
  if (!genre) return [];
  if (Array.isArray(genre)) {
    return genre.flatMap((g) => parseFilterList(g));
  }
  return parseFilterList(genre);
}

function serializeGenre(genres: string[]): string[] {
  return genres.map((g) => g.trim()).filter(Boolean);
}

function parseTracklist(tracklist: Track[] | null | undefined): Track[] {
  if (!Array.isArray(tracklist)) return [];
  return tracklist.map((track) => ({
    ...track,
    vibeTags: track.vibeTags ?? [],
  }));
}

function primaryTrackBpm(tracks: Track[]): number | null {
  const primary = tracks.find((track) => track.isPrimary) ?? tracks[0];
  return primary?.bpm ?? null;
}

function rowToRecord(row: RecordRow, summaryOnly = false): VinylRecord {
  const tracks = summaryOnly ? [] : parseTracklist(row.tracklist);
  return migrateRecord({
    id: row.id,
    artist: row.artist,
    title: row.title,
    year: row.year != null && row.year !== '' ? String(row.year) : undefined,
    format: row.format ?? undefined,
    coverUrl: resolveDiscogsCoverUrl(row.cover_image),
    genres: parseGenre(row.genre),
    condition: (row.condition as RecordCondition) || 'NM',
    tracks,
    discogsId: row.discogs_id ?? undefined,
    addedAt: row.created_at,
    collectionId: row.collection_id ?? undefined,
  });
}

type RecordWriteRow = Omit<RecordRow, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
  collection_id?: string | null;
};

function recordToRow(
  record: VinylRecord,
  userId: string,
  collectionId?: string
): RecordWriteRow {
  const tracks = record.tracks ?? [];
  const row: RecordWriteRow = {
    user_id: userId,
    title: record.title,
    artist: record.artist,
    year: record.year ?? null,
    format: record.format ?? null,
    genre: serializeGenre(record.genres),
    cover_image: resolveDiscogsCoverUrl(record.coverUrl) ?? null,
    tracklist: tracks,
    condition: record.condition,
    discogs_id: record.discogsId ?? null,
    bpm: primaryTrackBpm(tracks),
    barcode: null,
    created_at: record.addedAt,
  };

  if (supportsCollectionIdColumn()) {
    row.collection_id = collectionId ?? record.collectionId ?? null;
  }

  if (isPersistedRecordId(record.id)) {
    row.id = record.id;
  }

  return row;
}

function recordToUpdatePayload(
  record: VinylRecord,
  userId: string
): Partial<Omit<RecordRow, 'id' | 'user_id' | 'created_at'>> {
  const row = recordToRow(record, userId, record.collectionId);
  const payload: Partial<Omit<RecordRow, 'id' | 'user_id' | 'created_at'>> = {
    title: row.title,
    artist: row.artist,
    year: row.year,
    format: row.format,
    genre: row.genre,
    cover_image: row.cover_image,
    tracklist: row.tracklist,
    condition: row.condition,
    discogs_id: row.discogs_id,
    bpm: row.bpm,
    barcode: row.barcode,
  };

  if (supportsCollectionIdColumn() && row.collection_id !== undefined) {
    payload.collection_id = row.collection_id;
  }

  return payload;
}

async function fetchAllUserRecords(
  uid: string,
  options?: Pick<FetchRecordsOptions, 'summaryOnly' | 'shouldContinue'>
): Promise<FetchRecordsResult> {
  const summaryOnly = options?.summaryOnly ?? false;
  const { rows, error } = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select(selectColumns(summaryOnly))
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .range(from, to);
    return { data, error };
  }, options?.shouldContinue);

  if (error) {
    if (recordsSchemaMode !== 'legacy' && isMissingCollectionIdColumnError(error.message)) {
      useLegacyRecordsSchema();
      return fetchAllUserRecords(uid);
    }
    return { data: null, error };
  }

  const records = rows.map((row) => rowToRecord(row, summaryOnly));
  return { data: records, error: null };
}

async function fetchScopedRecords(
  uid: string,
  collectionId: string,
  personalCollectionId?: string,
  options?: Pick<FetchRecordsOptions, 'summaryOnly' | 'shouldContinue'>
): Promise<FetchRecordsResult> {
  const summaryOnly = options?.summaryOnly ?? false;
  const scoped = await fetchAllPages(async (from, to) => {
    const { data, error } = await supabase
      .from(TABLE)
      .select(selectColumns(summaryOnly))
      .eq('user_id', uid)
      .eq('collection_id', collectionId)
      .order('created_at', { ascending: false })
      .range(from, to);
    return { data, error };
  }, options?.shouldContinue);

  if (scoped.error) {
    if (isMissingCollectionIdColumnError(scoped.error.message)) {
      useLegacyRecordsSchema();
      return fetchAllUserRecords(uid);
    }
    return { data: null, error: scoped.error };
  }

  let legacyRows: RecordRow[] = [];
  if (personalCollectionId && collectionId === personalCollectionId) {
    const legacy = await fetchAllPages(async (from, to) => {
      const { data, error } = await supabase
        .from(TABLE)
        .select(selectColumns(summaryOnly))
        .eq('user_id', uid)
        .is('collection_id', null)
        .order('created_at', { ascending: false })
        .range(from, to);
      return { data, error };
    }, options?.shouldContinue);

    if (legacy.error) {
      if (isMissingCollectionIdColumnError(legacy.error.message)) {
        useLegacyRecordsSchema();
        return fetchAllUserRecords(uid);
      }
      return { data: null, error: legacy.error };
    }
    legacyRows = legacy.rows;
  }

  const merged = [...scoped.rows, ...legacyRows];
  const seen = new Set<string>();
  const records = merged
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .map((row) => rowToRecord(row, summaryOnly));

  return { data: records, error: null };
}

function fetchKey(options?: FetchRecordsOptions | string): string {
  if (typeof options === 'string') return `user:${options}`;
  const o = options ?? {};
  return [
    o.userId ?? 'session',
    o.collectionId ?? 'all',
    o.personalCollectionId ?? '',
    o.summaryOnly ? 'summary' : 'full',
  ].join('|');
}

/** Fetch records for the current user, optionally scoped to a crate. */
export async function fetchRecords(
  options?: FetchRecordsOptions | string
): Promise<FetchRecordsResult> {
  const key = fetchKey(options);
  if (inFlightFetch && inFlightFetchKey === key) {
    return inFlightFetch;
  }

  const run = async (): Promise<FetchRecordsResult> => {
    const resolved: FetchRecordsOptions =
      typeof options === 'string' ? { userId: options } : (options ?? {});

    try {
      await ensureRecordsSchemaProbed();
      const uid = await resolveUserId(resolved.userId);
      const { collectionId, personalCollectionId, summaryOnly, shouldContinue } = resolved;
      const pageOpts = { summaryOnly, shouldContinue };

      if (collectionId && supportsCollectionIdColumn()) {
        return fetchScopedRecords(uid, collectionId, personalCollectionId, pageOpts);
      }

      return fetchAllUserRecords(uid, pageOpts);
    } catch (err) {
      return {
        data: null,
        error: { message: err instanceof Error ? err.message : 'Failed to fetch records' },
      };
    }
  };

  inFlightFetchKey = key;
  inFlightFetch = run().finally(() => {
    if (inFlightFetchKey === key) {
      inFlightFetch = null;
      inFlightFetchKey = '';
    }
  });
  return inFlightFetch;
}

/** Insert a record scoped to the current user (or an explicit user id). */
export async function addRecord(
  record: VinylRecord,
  options?: PersistRecordOptions
): Promise<AddRecordResult> {
  try {
    await ensureRecordsSchemaProbed();
    const uid = await resolveUserId(options?.userId);
    const payload = recordToRow(record, uid, options?.collectionId ?? record.collectionId);

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select(selectColumns())
      .single();

    if (error) {
      if (recordsSchemaMode !== 'legacy' && isMissingCollectionIdColumnError(error.message)) {
        useLegacyRecordsSchema();
        return addRecord(record, options);
      }
      return { data: null, error: toRecordsError(error) };
    }

    return {
      data: rowToRecord(data as unknown as RecordRow),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to add record' },
    };
  }
}

/** Insert many records in bounded batches (bulk Discogs import). */
export async function addRecordsBatch(
  records: VinylRecord[],
  options?: PersistRecordOptions
): Promise<AddRecordsBatchResult> {
  if (records.length === 0) {
    return { data: [], error: null, failed: 0 };
  }

  try {
    await ensureRecordsSchemaProbed();
    const uid = await resolveUserId(options?.userId);
    const targetCollectionId = options?.collectionId;
    const saved: VinylRecord[] = [];
    let failed = 0;

    for (let i = 0; i < records.length; i += INSERT_BATCH_SIZE) {
      const chunk = records.slice(i, i + INSERT_BATCH_SIZE);
      const payloads = chunk.map((record) =>
        recordToRow(record, uid, targetCollectionId ?? record.collectionId)
      );

      const { data, error } = await supabase
        .from(TABLE)
        .insert(payloads)
        .select(selectColumns());

      if (error) {
        if (recordsSchemaMode !== 'legacy' && isMissingCollectionIdColumnError(error.message)) {
          useLegacyRecordsSchema();
          return addRecordsBatch(records, options);
        }

        for (const record of chunk) {
          const single = await addRecord(record, options);
          if (single.data) saved.push(single.data);
          else failed += 1;
        }
        continue;
      }

      const rows = (data ?? []) as unknown as RecordRow[];
      saved.push(...rows.map((row) => rowToRecord(row)));
      failed += chunk.length - rows.length;
    }

    return { data: saved, error: null, failed };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to add records' },
      failed: records.length,
    };
  }
}

/** Update an existing record for the current user (or an explicit user id). */
export async function updateRecord(
  record: VinylRecord,
  options?: PersistRecordOptions
): Promise<UpdateRecordResult> {
  if (!isPersistedRecordId(record.id)) {
    return { data: null, error: { message: 'Record id is not a persisted UUID' } };
  }

  try {
    const uid = await resolveUserId(options?.userId);
    const payload = recordToUpdatePayload(record, uid);

    await ensureRecordsSchemaProbed();
    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', record.id)
      .eq('user_id', uid)
      .select(selectColumns())
      .single();

    if (error) {
      if (recordsSchemaMode !== 'legacy' && isMissingCollectionIdColumnError(error.message)) {
        useLegacyRecordsSchema();
        return updateRecord(record, options);
      }
      return { data: null, error: toRecordsError(error) };
    }

    return {
      data: rowToRecord(data as unknown as RecordRow),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to update record' },
    };
  }
}

/** Discogs ids already in a crate (for import dedup). */
export async function fetchDiscogsIdsForCollection(
  collectionId: string
): Promise<number[]> {
  try {
    await ensureRecordsSchemaProbed();
    if (!supportsCollectionIdColumn()) {
      const result = await fetchRecords();
      if (result.error || !result.data) return [];
      return result.data
        .map((record) => record.discogsId)
        .filter((id): id is number => id != null);
    }

    const uid = await resolveUserId();
    const ids: number[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await supabase
        .from(TABLE)
        .select('discogs_id')
        .eq('user_id', uid)
        .eq('collection_id', collectionId)
        .not('discogs_id', 'is', null)
        .range(offset, offset + FETCH_PAGE_SIZE - 1);

      if (error) return ids;
      const page = (data ?? [])
        .map((row) => (row as { discogs_id: number | null }).discogs_id)
        .filter((id): id is number => id != null);
      ids.push(...page);
      if (page.length < FETCH_PAGE_SIZE) break;
      offset += FETCH_PAGE_SIZE;
    }

    return ids;
  } catch {
    return [];
  }
}

/** Delete a record by id for the current user (or an explicit user id). */
export async function deleteRecord(
  recordId: string,
  userId?: string
): Promise<DeleteRecordResult> {
  const id = recordId.trim();
  if (!id) {
    return { data: null, error: { message: 'Record id is required' } };
  }

  try {
    const uid = await resolveUserId(userId);
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq('id', id)
      .eq('user_id', uid)
      .select('id');

    if (error) return { data: null, error: toRecordsError(error) };
    if (!data?.length) {
      return { data: null, error: { message: 'Record not found', code: 'not_found' } };
    }

    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to delete record' },
    };
  }
}

export type GuestTracklistProbeResult = {
  sampled: number;
  multiTrack: number;
  looksEnriched: boolean;
};

/** Sample DB rows to see if guest tracklist enrich was persisted (uses auth session). */
export async function probeGuestTracklistsPersisted(
  collectionId: string,
  sampleSize = 48
): Promise<GuestTracklistProbeResult> {
  await ensureRecordsSchemaProbed();
  if (!supportsCollectionIdColumn()) {
    return { sampled: 0, multiTrack: 0, looksEnriched: false };
  }

  const { data, error } = await supabase
    .from(TABLE)
    .select('tracklist')
    .eq('collection_id', collectionId)
    .not('discogs_id', 'is', null)
    .limit(sampleSize);

  if (error || !data?.length) {
    return { sampled: 0, multiTrack: 0, looksEnriched: false };
  }

  let multiTrack = 0;
  for (const row of data) {
    const tracks = Array.isArray(row.tracklist) ? row.tracklist : [];
    if (tracks.length > 1) multiTrack += 1;
  }

  const sampled = data.length;
  const looksEnriched = sampled >= 8 && multiTrack / sampled >= 0.65;
  return { sampled, multiTrack, looksEnriched };
}