import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseFilterList } from './filterLabels';
import { migrateRecord } from './tracks';
import type { RecordCondition, Track, VinylRecord } from './types';
import { supabase } from './supabase';
import { generateShareToken, isShareToken, sharePath } from './shareRoute';

const PAGE_SIZE = 500;

const RECORD_COLUMNS =
  'id,collection_id,title,artist,year,format,genre,cover_image,tracklist,condition,discogs_id,bpm,created_at';

export type ShareLinkError = { message: string; code?: string };

export type ShareLink = {
  token: string;
  path: string;
};

export type OwnerLabel = {
  name: string;
  initial: string;
};

export type SharedCrate = {
  id: string;
  name: string;
  ownerName: string;
  ownerInitial: string;
  recordCount: number;
  records: VinylRecord[];
};

type CollectionShareRow = {
  id: string;
  name: string;
  kind: string;
  owner_user_id: string;
};

type ProfileShareRow = {
  first_name: string | null;
};

type ShareRecordRow = {
  id: string;
  collection_id: string | null;
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
  created_at: string;
};

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
};

/** Anonymous client. Session storage is empty so the owner's JWT is never sent. */
function shareReadClient(token: string): SupabaseClient {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { 'x-share-token': token } },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: memoryStorage,
    },
  });
}

function friendlyShareError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes('share_links') &&
    (lower.includes('does not exist') || lower.includes('schema cache'))
  ) {
    return 'Share links are not available yet. Apply supabase/migrations/20260923210000_share_links.sql in the Supabase SQL editor.';
  }
  if (
    lower.includes('row-level security') ||
    lower.includes('42501') ||
    lower.includes('permission denied') ||
    lower.includes('not authenticated')
  ) {
    return 'You can only share a crate you own.';
  }
  return message;
}

function isActive(expiresAt: string | null): boolean {
  if (!expiresAt) return true;
  const time = Date.parse(expiresAt);
  return Number.isNaN(time) || time > Date.now();
}

function ownerInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : '?';
}

export function ownerLabel(firstName: string | null | undefined, email?: string | null): OwnerLabel {
  const profileName = firstName?.trim() ?? '';
  const emailName = email?.split('@')[0]?.trim() ?? '';
  const name = profileName || emailName || 'Collector';
  return { name, initial: ownerInitial(name) };
}

function shareRowToRecord(row: ShareRecordRow): VinylRecord {
  const tracks = Array.isArray(row.tracklist) ? row.tracklist : [];
  return migrateRecord({
    id: row.id,
    artist: row.artist,
    title: row.title,
    year: row.year != null && row.year !== '' ? String(row.year) : undefined,
    format: row.format ?? undefined,
    coverUrl: row.cover_image ?? undefined,
    genres: parseFilterList(row.genre),
    condition: (row.condition as RecordCondition) || 'NM',
    tracks,
    bpm: tracks.length > 0 ? undefined : (row.bpm ?? undefined),
    discogsId: row.discogs_id ?? undefined,
    addedAt: row.created_at,
    collectionId: row.collection_id ?? undefined,
  });
}

async function signedInUserId(): Promise<string> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Not authenticated');
  return user.id;
}

/** Owner-only. Returns the existing active link or creates one. */
export async function createOrGetShareLink(
  collectionId: string
): Promise<{ data: ShareLink | null; error: ShareLinkError | null }> {
  try {
    const userId = await signedInUserId();
    const { data: existing, error: readError } = await supabase
      .from('share_links')
      .select('id, token, expires_at')
      .eq('collection_id', collectionId)
      .maybeSingle();

    if (readError) {
      return {
        data: null,
        error: { message: friendlyShareError(readError.message), code: readError.code },
      };
    }

    if (existing && isShareToken(existing.token) && isActive(existing.expires_at)) {
      return { data: { token: existing.token, path: sharePath(existing.token) }, error: null };
    }

    const token = generateShareToken();
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('share_links')
        .update({ token, expires_at: null, created_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('token')
        .single();
      if (updateError) {
        return {
          data: null,
          error: { message: friendlyShareError(updateError.message), code: updateError.code },
        };
      }
      return { data: { token: updated.token, path: sharePath(updated.token) }, error: null };
    }

    const { data: inserted, error: insertError } = await supabase
      .from('share_links')
      .insert({ collection_id: collectionId, token, created_by: userId })
      .select('token')
      .single();

    if (insertError) {
      if (insertError.code === '23505') {
        const { data: raced } = await supabase
          .from('share_links')
          .select('token')
          .eq('collection_id', collectionId)
          .maybeSingle();
        if (raced?.token && isShareToken(raced.token)) {
          return { data: { token: raced.token, path: sharePath(raced.token) }, error: null };
        }
      }
      return {
        data: null,
        error: { message: friendlyShareError(insertError.message), code: insertError.code },
      };
    }

    return { data: { token: inserted.token, path: sharePath(inserted.token) }, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not create a share link';
    return { data: null, error: { message: friendlyShareError(message) } };
  }
}

export async function fetchSignedInOwnerLabel(): Promise<OwnerLabel> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let firstName: string | null = null;
  if (user) {
    const { data } = await supabase
      .from('user_profiles')
      .select('first_name')
      .eq('user_id', user.id)
      .maybeSingle();
    firstName = (data as ProfileShareRow | null)?.first_name ?? null;
  }
  return ownerLabel(firstName, user?.email);
}

async function fetchSharedRecords(client: SupabaseClient): Promise<VinylRecord[]> {
  const rows: ShareRecordRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client
      .from('records')
      .select(RECORD_COLUMNS)
      .order('created_at', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as ShareRecordRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return rows.map(shareRowToRecord);
}

/** Public, unauthenticated read. Sends x-share-token and no session JWT. */
export async function fetchSharedCrate(
  token: string
): Promise<{ data: SharedCrate | null; error: ShareLinkError | null; notFound?: boolean }> {
  if (!isShareToken(token)) {
    return { data: null, error: { message: 'This link is invalid or has expired.' }, notFound: true };
  }

  const client = shareReadClient(token);
  const [collectionResult, profileResult, recordsResult] = await Promise.all([
    client.from('collections').select('id, name, kind, owner_user_id').limit(1),
    client.from('user_profiles').select('first_name').limit(1),
    fetchSharedRecords(client).then(
      (records) => ({ records, error: null as string | null }),
      (err: unknown) => ({
        records: [] as VinylRecord[],
        error: err instanceof Error ? err.message : 'Could not load this list',
      })
    ),
  ]);

  if (collectionResult.error) {
    return { data: null, error: { message: collectionResult.error.message } };
  }
  if (recordsResult.error) {
    return { data: null, error: { message: recordsResult.error } };
  }

  const collection = ((collectionResult.data ?? [])[0] ?? null) as CollectionShareRow | null;
  if (!collection) {
    return { data: null, error: { message: 'This link is invalid or has expired.' }, notFound: true };
  }

  const profile = ((profileResult.data ?? [])[0] ?? null) as ProfileShareRow | null;
  const owner = ownerLabel(profile?.first_name);
  return {
    data: {
      id: collection.id,
      name: collection.name,
      ownerName: owner.name,
      ownerInitial: owner.initial,
      recordCount: recordsResult.records.length,
      records: recordsResult.records,
    },
    error: null,
  };
}
