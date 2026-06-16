import { supabase } from './supabase';
import {
  GUEST_CRATE_MAX_COUNT,
  PERSONAL_CRATE_SLUG,
  type CollectionCrate,
  type CollectionKind,
} from './collectionContext';

const TABLE = 'collections';

type CollectionRow = {
  id: string;
  owner_user_id: string;
  imported_by_user_id: string | null;
  kind: CollectionKind;
  name: string;
  slug: string;
  discogs_username: string | null;
  record_count: number;
  claimed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CollectionsError = { message: string; code?: string };

function toError(error: { message: string; code?: string }): CollectionsError {
  return { message: error.message, code: error.code };
}

function rowToCrate(row: CollectionRow): CollectionCrate {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    importedByUserId: row.imported_by_user_id ?? undefined,
    kind: row.kind,
    name: row.name,
    slug: row.slug,
    discogsUsername: row.discogs_username ?? undefined,
    recordCount: row.record_count,
    claimedAt: row.claimed_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingTableError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('does not exist') ||
    lower.includes('could not find the table') ||
    lower.includes('schema cache') ||
    lower.includes('relation') && lower.includes('collections')
  );
}

async function resolveUserId(): Promise<string> {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (error || !userId) throw new Error('Not authenticated');
  return userId;
}

export function slugFromDiscogsUsername(username: string): string {
  const base = username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return base || 'crate';
}

export function guestCrateDisplayName(discogsUsername: string): string {
  return `${discogsUsername.trim()}'s Crate`;
}

/** Fetch all crates for the signed-in user. Returns available:false if migrations not applied. */
export async function fetchCollections(): Promise<
  | { available: true; crates: CollectionCrate[]; error: null }
  | { available: false; crates: []; error: CollectionsError | null }
> {
  try {
    const uid = await resolveUserId();
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('owner_user_id', uid)
      .order('kind', { ascending: true })
      .order('created_at', { ascending: true });

    if (error) {
      if (isMissingTableError(error.message)) {
        return { available: false, crates: [], error: null };
      }
      return { available: false, crates: [], error: toError(error) };
    }

    return {
      available: true,
      crates: (data ?? []).map((row) => rowToCrate(row as CollectionRow)),
      error: null,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch collections';
    if (isMissingTableError(message)) {
      return { available: false, crates: [], error: null };
    }
    return {
      available: false,
      crates: [],
      error: { message },
    };
  }
}

/** Ensure a personal crate exists; backfill orphan records when possible. */
export async function ensurePersonalCollection(): Promise<
  | { available: true; crate: CollectionCrate; error: null }
  | { available: true; crate: null; error: CollectionsError }
  | { available: false; crate: null; error: CollectionsError | null }
> {
  const fetched = await fetchCollections();
  if (!fetched.available) return { available: false, crate: null, error: fetched.error };

  const existing = fetched.crates.find((c) => c.kind === 'personal');
  if (existing) {
    await attachOrphanRecords(existing.id);
    return { available: true, crate: existing, error: null };
  }

  try {
    const uid = await resolveUserId();
    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        owner_user_id: uid,
        kind: 'personal',
        name: 'My Crate',
        slug: PERSONAL_CRATE_SLUG,
      })
      .select('*')
      .single();

    if (error) return { available: true, crate: null, error: toError(error) };

    const crate = rowToCrate(data as CollectionRow);
    await attachOrphanRecords(crate.id);
    return { available: true, crate, error: null };
  } catch (err) {
    return {
      available: true,
      crate: null,
      error: { message: err instanceof Error ? err.message : 'Failed to create personal crate' },
    };
  }
}

async function attachOrphanRecords(personalCollectionId: string): Promise<void> {
  const uid = await resolveUserId();
  const { error } = await supabase
    .from('records')
    .update({ collection_id: personalCollectionId })
    .eq('user_id', uid)
    .is('collection_id', null);

  if (error && !isMissingTableError(error.message)) {
    console.warn('[collections] attach orphan records:', error.message);
  }
}

async function uniqueGuestSlug(uid: string, baseSlug: string): Promise<string> {
  const { data } = await supabase
    .from(TABLE)
    .select('slug')
    .eq('owner_user_id', uid)
    .like('slug', `${baseSlug}%`);

  const taken = new Set((data ?? []).map((row) => (row as { slug: string }).slug));
  if (!taken.has(baseSlug)) return baseSlug;

  for (let i = 2; i < 100; i += 1) {
    const candidate = `${baseSlug}-${i}`.slice(0, 64);
    if (!taken.has(candidate)) return candidate;
  }
  return `${baseSlug}-${Date.now()}`.slice(0, 64);
}

export async function createGuestCollection(
  discogsUsername: string
): Promise<
  | { data: CollectionCrate; error: null }
  | { data: null; error: CollectionsError }
> {
  const trimmed = discogsUsername.trim();
  if (!trimmed) return { data: null, error: { message: 'Discogs username is required' } };

  try {
    const uid = await resolveUserId();
    const fetched = await fetchCollections();
    if (!fetched.available) {
      return { data: null, error: { message: 'Guest crates are not available yet. Run database migration.' } };
    }

    const guestCount = fetched.crates.filter((c) => c.kind === 'guest').length;
    if (guestCount >= GUEST_CRATE_MAX_COUNT) {
      return {
        data: null,
        error: { message: `You can keep up to ${GUEST_CRATE_MAX_COUNT} guest crates.` },
      };
    }

    const existing = fetched.crates.find(
      (c) => c.kind === 'guest' && c.discogsUsername?.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) {
      return { data: existing, error: null };
    }

    const baseSlug = slugFromDiscogsUsername(trimmed);
    const slug = await uniqueGuestSlug(uid, baseSlug);

    const { data, error } = await supabase
      .from(TABLE)
      .insert({
        owner_user_id: uid,
        imported_by_user_id: uid,
        kind: 'guest',
        name: guestCrateDisplayName(trimmed),
        slug,
        discogs_username: trimmed,
      })
      .select('*')
      .single();

    if (error) return { data: null, error: toError(error) };
    return { data: rowToCrate(data as CollectionRow), error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to create guest crate' },
    };
  }
}

export async function syncCollectionRecordCount(collectionId: string): Promise<void> {
  const { count, error: countError } = await supabase
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('collection_id', collectionId);

  if (countError) return;

  await supabase
    .from(TABLE)
    .update({ record_count: count ?? 0, updated_at: new Date().toISOString() })
    .eq('id', collectionId);
}

export async function deleteGuestCollection(
  collectionId: string
): Promise<{ data: true; error: null } | { data: null; error: CollectionsError }> {
  try {
    const uid = await resolveUserId();
    const { data: crate, error: fetchError } = await supabase
      .from(TABLE)
      .select('id, kind')
      .eq('id', collectionId)
      .eq('owner_user_id', uid)
      .maybeSingle();

    if (fetchError) return { data: null, error: toError(fetchError) };
    if (!crate || (crate as { kind: string }).kind !== 'guest') {
      return { data: null, error: { message: 'Guest crate not found' } };
    }

    const { error } = await supabase.from(TABLE).delete().eq('id', collectionId);
    if (error) return { data: null, error: toError(error) };
    return { data: true, error: null };
  } catch (err) {
    return {
      data: null,
      error: { message: err instanceof Error ? err.message : 'Failed to delete guest crate' },
    };
  }
}