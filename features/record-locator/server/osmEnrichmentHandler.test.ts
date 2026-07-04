import { describe, expect, it } from 'vitest';
import { parseOsmStoreRef } from './osmEnrichmentHandler';

describe('parseOsmStoreRef', () => {
  it('parses photon ids', () => {
    expect(parseOsmStoreRef('photon/node/12345')).toEqual({
      element: 'node',
      osmId: 12345,
    });
  });

  it('parses osm ids', () => {
    expect(parseOsmStoreRef('osm/way/987')).toEqual({
      element: 'way',
      osmId: 987,
    });
  });

  it('returns null for google ids', () => {
    expect(parseOsmStoreRef('places/ChIJxyz')).toBeNull();
  });
});