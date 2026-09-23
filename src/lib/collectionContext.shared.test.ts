import { describe, expect, it } from 'vitest';
import {
  asSharedCrateView,
  isGuestCrate,
  isPersonalCrate,
  isSharedCrate,
  sharedCrateDisplayName,
  sharedCrateRouteSlug,
  type CollectionCrate,
} from './collectionContext';

function personalCrate(overrides: Partial<CollectionCrate> = {}): CollectionCrate {
  return {
    id: '0ee06306-0130-4407-8d50-b8dd1ab8b0ca',
    ownerUserId: 'owner',
    kind: 'personal',
    name: 'My Crate',
    slug: 'my-crate',
    recordCount: 22,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('shared crate classification', () => {
  it('names a peer crate from the owner first name and gives it a unique route slug', () => {
    const shared = asSharedCrateView(personalCrate(), 'Michael');
    expect(shared.name).toBe("Michael's Crate");
    expect(shared.slug).toBe(sharedCrateRouteSlug(shared.id));
    expect(shared.slug).not.toBe('my-crate');
    expect(shared.kind).toBe('shared');
    expect(shared.recordCount).toBe(22);
    expect(isSharedCrate(shared)).toBe(true);
    expect(isPersonalCrate(shared)).toBe(false);
    expect(isGuestCrate(shared)).toBe(false);
  });

  it('falls back when the profile has no first name', () => {
    expect(sharedCrateDisplayName('  ')).toBe('Shared crate');
    expect(sharedCrateDisplayName(null)).toBe('Shared crate');
  });

  it('still treats the viewer personal crate and guest imports as before', () => {
    const mine = personalCrate({ ownerUserId: 'me' });
    const guest = personalCrate({
      id: 'guest-1',
      kind: 'guest',
      name: "Keendigger's Crate",
      slug: 'keendigger',
    });
    expect(isPersonalCrate(mine)).toBe(true);
    expect(isSharedCrate(mine)).toBe(false);
    expect(isGuestCrate(guest)).toBe(true);
    expect(isPersonalCrate(guest)).toBe(false);
  });
});
