export type CollectionKind = 'personal' | 'guest' | 'pending_claim';

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
}

/** Max vinyl rows per crate (guest + personal imports). 1,500 leaves headroom above ~1,100 Discogs shelves. */
export const GUEST_CRATE_MAX_RECORDS = 1500;
export const GUEST_CRATE_MAX_COUNT = 5;
export const PERSONAL_CRATE_SLUG = 'my-crate';

export function isGuestCrate(crate: Pick<CollectionCrate, 'kind'>): boolean {
  return crate.kind === 'guest' || crate.kind === 'pending_claim';
}

export function isPersonalCrate(crate: Pick<CollectionCrate, 'kind' | 'slug'>): boolean {
  return crate.kind === 'personal' || crate.slug === PERSONAL_CRATE_SLUG;
}