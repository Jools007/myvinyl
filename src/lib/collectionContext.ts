export type CollectionKind = 'personal' | 'guest' | 'pending_claim' | 'shared';

export interface CollectionCrate {
  id: string;
  ownerUserId: string;
  importedByUserId?: string;
  kind: CollectionKind;
  name: string;
  slug: string;
  discogsUsername?: string;
  recordCount: number;
  claimedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** Peer personal crate from crate_shares. Not a guest Discogs import. */
  isSharedView?: boolean;
}

/** Max vinyl rows per crate (guest + personal imports). 1,500 leaves headroom above ~1,100 Discogs shelves. */
export const GUEST_CRATE_MAX_RECORDS = 1500;
export const GUEST_CRATE_MAX_COUNT = 5;
/** Guest crates above this use lightweight list fetch (no tracklist JSON). Personal never does. */
export const GUEST_SUMMARY_FETCH_THRESHOLD = 200;
export const PERSONAL_CRATE_SLUG = 'my-crate';

export function isGuestCrate(crate: Pick<CollectionCrate, 'kind'>): boolean {
  return crate.kind === 'guest' || crate.kind === 'pending_claim';
}

export function isSharedCrate(
  crate: Pick<CollectionCrate, 'kind' | 'isSharedView'>
): boolean {
  return crate.isSharedView === true || crate.kind === 'shared';
}

export function isPersonalCrate(
  crate: Pick<CollectionCrate, 'kind' | 'slug' | 'isSharedView'>
): boolean {
  if (isSharedCrate(crate)) return false;
  return crate.kind === 'personal' || crate.slug === PERSONAL_CRATE_SLUG;
}

/** Route slug for a peer crate. Must not collide with the viewer's `my-crate`. */
export function sharedCrateRouteSlug(collectionId: string): string {
  return `shared-${collectionId}`;
}

/** "Michael's Crate" from user_profiles.first_name. */
export function sharedCrateDisplayName(firstName: string | null | undefined): string {
  const name = firstName?.trim();
  if (!name) return 'Shared crate';
  return `${name}'s Crate`;
}

/** Re-label an owned-row mirror so the switcher and router treat it as a peer crate. */
export function asSharedCrateView(
  crate: CollectionCrate,
  firstName: string | null | undefined
): CollectionCrate {
  return {
    ...crate,
    kind: 'shared',
    isSharedView: true,
    name: sharedCrateDisplayName(firstName),
    slug: sharedCrateRouteSlug(crate.id),
  };
}