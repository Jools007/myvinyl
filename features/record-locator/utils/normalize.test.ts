import { describe, expect, it } from 'vitest';
import type { RecordStore } from '../types';
import {
  buildPlacePhotoUrl,
  mergeRecordStoreResults,
  normalizePlacesPlace,
  normalizePlacesResponse,
} from './normalize';

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

  it('maps Google photos to proxied photo URLs', () => {
    const store = normalizePlacesPlace(
      {
        id: 'places/abc',
        displayName: { text: 'Vinyl Vault' },
        formattedAddress: '10 Record Lane, London',
        location: { latitude: 51.502, longitude: -0.121 },
        photos: [{ name: 'places/abc/photos/shot-1' }],
        userRatingCount: 128,
      },
      origin
    );
    expect(store?.photoUrl).toBe(buildPlacePhotoUrl('places/abc/photos/shot-1'));
    expect(store?.ratingCount).toBe(128);
  });
});

describe('mergeRecordStoreResults', () => {
  const google = (id: string, lat: number, lon: number): RecordStore => ({
    id,
    name: 'Google Shop',
    address: '1 High St',
    latitude: lat,
    longitude: lon,
    distanceMeters: 100,
    source: 'google',
    rating: 4.8,
    photoUrl: '/api/record-locator/photo?n=places%2Fphoto',
  });

  const osm = (id: string, lat: number, lon: number): RecordStore => ({
    id,
    name: 'OSM Shop',
    address: '1 High Street',
    latitude: lat,
    longitude: lon,
    distanceMeters: 105,
    source: 'osm',
    phone: '+370 5 123 4567',
  });

  it('enriches nearby Google results with OSM fallbacks instead of duplicating', () => {
    const merged = mergeRecordStoreResults(
      [google('g1', 54.68, 25.28)],
      [osm('osm/1', 54.68001, 25.28001)]
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].phone).toBe('+370 5 123 4567');
    expect(merged[0].photoUrl).toContain('/api/record-locator/photo');
  });
});