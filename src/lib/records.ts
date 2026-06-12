import { resolveDiscogsCoverUrl } from './discogsCover';
import { parseFilterList } from './filterLabels';
import { migrateRecord } from './tracks';
import { supabase } from './supabase';
import type { RecordCondition, Track, VinylRecord } from './types';

const TABLE = 'records';

const RECORD_COLUMNS =
  'id,user_id,title,artist,year,format,genre,cover_image,tracklist,condition,discogs_id,bpm,barcode,created_at';

export type RecordRow = {
  id: string;
  user_id: string;
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

function rowToRecord(row: RecordRow): VinylRecord {
  const tracks = parseTracklist(row.tracklist);
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
  });
}

function recordToRow(
  record: VinylRecord,
  userId: string
): Omit<RecordRow, 'id' | 'created_at'> & { id?: string; created_at?: string } {
  const tracks = record.tracks ?? [];
  const row: Omit<RecordRow, 'id' | 'created_at'> & { id?: string; created_at?: string } = {
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

  if (isPersistedRecordId(record.id)) {
    row.id = record.id;
  }

  return row;
}

function recordToUpdatePayload(
  record: VinylRecord,
  userId: string
): Omit<RecordRow, 'id' | 'user_id' | 'created_at'> {
  const row = recordToRow(record, userId);
  return {
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
}

/** Fetch all records for the current user (or an explicit user id). */
export async function fetchRecords(userId?: string): Promise<FetchRecordsResult> {
  try {
    const uid = await resolveUserId(userId);
    const { data, error } = await supabase
      .from(TABLE)
      .select(RECORD_COLUMNS)
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    if (error) return { data: null, error: toRecordsError(error) };

    const records = (data ?? []).map((row) => rowToRecord(row as RecordRow));
    return { data: records, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to fetch records' },
    };
  }
}

/** Insert a record scoped to the current user (or an explicit user id). */
export async function addRecord(
  record: VinylRecord,
  userId?: string
): Promise<AddRecordResult> {
  try {
    const uid = await resolveUserId(userId);
    const payload = recordToRow(record, uid);

    const { data, error } = await supabase
      .from(TABLE)
      .insert(payload)
      .select(RECORD_COLUMNS)
      .single();

    if (error) return { data: null, error: toRecordsError(error) };

    return {
      data: rowToRecord(data as RecordRow),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to add record' },
    };
  }
}

/** Update an existing record for the current user (or an explicit user id). */
export async function updateRecord(
  record: VinylRecord,
  userId?: string
): Promise<UpdateRecordResult> {
  if (!isPersistedRecordId(record.id)) {
    return { data: null, error: { message: 'Record id is not a persisted UUID' } };
  }

  try {
    const uid = await resolveUserId(userId);
    const payload = recordToUpdatePayload(record, uid);

    const { data, error } = await supabase
      .from(TABLE)
      .update(payload)
      .eq('id', record.id)
      .eq('user_id', uid)
      .select(RECORD_COLUMNS)
      .single();

    if (error) return { data: null, error: toRecordsError(error) };

    return {
      data: rowToRecord(data as RecordRow),
      error: null,
    };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to update record' },
    };
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