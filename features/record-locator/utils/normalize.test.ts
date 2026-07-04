import { describe, expect, it } from 'vitest';
import { normalizePlacesPlace, normalizePlacesResponse } from './normalize';

const origin = { latitude: 51.5, longitude: -0.12 };

describe('normalizePlacesResponse', () => {
  it('maps API places to sorted record stores and dedupes by id', () => {
    const places = [
      {
        id: 'places/abc',
        displayName: { text: 'Vinyl Vault' },
        formattedAddress: '10 Record Lane, London',
        location: { latitude: 51.502, longitude: -0.121 },
        rating: 4.6,
        currentOpeningHours: { openNow: true, weekdayDescriptions: ['Mon: 10 AM – 7 PM'] },
      },
      {
        id: 'places/abc',
        displayName: { text: 'Duplicate' },
        formattedAddress: '10 Record Lane, London',
        location: { latitude: 51.502, longitude: -0.121 },
      },
      {
        id: 'places/xyz',
        displayName: { text: 'Spin City' },
        formattedAddress: '2 Groove Rd, London',
        location: { latitude: 51.51, longitude: -0.12 },
        rating: 4.1,
        currentOpeningHours: { openNow: false },
      },
    ];

    const stores = normalizePlacesResponse(places, origin);
    expect(stores).toHaveLength(2);
    expect(stores[0].id).toBe('places/abc');
    expect(stores[0].name).toBe('Vinyl Vault');
    expect(stores[0].openNow).toBe(true);
    expect(stores[0].openingHoursSummary).toBe('Mon: 10 AM – 7 PM');
    expect(stores[1].id).toBe('places/xyz');
    expect(stores[0].distanceMeters).toBeLessThan(stores[1].distanceMeters);
  });

  it('drops invalid places missing required fields', () => {
    expect(
      normalizePlacesPlace({ id: 'x', displayName: { text: 'No address' } }, origin)
    ).toBeNull();
  });
});