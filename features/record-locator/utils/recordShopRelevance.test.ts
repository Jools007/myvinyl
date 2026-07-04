import { describe, expect, it } from 'vitest';
import { isLikelyRecordShopCandidate } from './recordShopRelevance';

describe('isLikelyRecordShopCandidate', () => {
  it('accepts OSM-tagged and known Vilnius record shops', () => {
    expect(isLikelyRecordShopCandidate({ name: 'Viniloteka', shop: 'vinyl' })).toBe(true);
    expect(isLikelyRecordShopCandidate({ name: 'Muzikumas', shop: 'music' })).toBe(true);
    expect(isLikelyRecordShopCandidate({ name: 'Ragainė', shop: 'gift' })).toBe(true);
    expect(isLikelyRecordShopCandidate({ name: 'VŠĮ Vinilo Studija' })).toBe(true);
    expect(isLikelyRecordShopCandidate({ name: 'Trolley Records' })).toBe(true);
  });

  it('accepts Google results with clear retail naming', () => {
    expect(
      isLikelyRecordShopCandidate({ name: 'BUYMUSIC.LT' }, { source: 'google' })
    ).toBe(true);
    expect(
      isLikelyRecordShopCandidate({ name: 'Thelonious Record Store' }, { source: 'google' })
    ).toBe(true);
  });

  it('rejects labels, institutions, cafes, and vague Google hits', () => {
    expect(
      isLikelyRecordShopCandidate({
        name: 'Public Institution DIY Records',
      })
    ).toBe(false);
    expect(isLikelyRecordShopCandidate({ name: 'NEC Records' }, { source: 'google' })).toBe(
      false
    );
    expect(
      isLikelyRecordShopCandidate({
        name: 'Vinyl with Coffee',
        types: ['store'],
      })
    ).toBe(false);
    expect(
      isLikelyRecordShopCandidate({ name: 'Vinylgrinder' }, { source: 'google' })
    ).toBe(false);
    expect(
      isLikelyRecordShopCandidate({
        name: 'Hoodboy Records Studio',
        types: ['store'],
      })
    ).toBe(false);
    expect(
      isLikelyRecordShopCandidate({
        name: 'Grindų rojus',
        address: 'Kuršių g. 2-24, Vilnius',
      })
    ).toBe(false);
  });
});