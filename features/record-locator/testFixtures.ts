import type { RecordStore } from './types';

/** Representative Google Places (New) nearby payload shape after server normalization. */
export const sampleRecordStores: RecordStore[] = [
  {
    id: 'places/open-vinyl',
    name: 'Open Vinyl',
    address: '1 Groove Lane, London',
    latitude: 51.501,
    longitude: -0.121,
    rating: 4.8,
    openNow: true,
    openingHoursSummary: 'Mon: 10 AM – 7 PM',
    distanceMeters: 320,
  },
  {
    id: 'places/closed-spin',
    name: 'Closed Spin',
    address: '9 B-side Road, London',
    latitude: 51.508,
    longitude: -0.125,
    rating: 4.2,
    openNow: false,
    openingHoursSummary: 'Mon: Closed',
    distanceMeters: 980,
  },
  {
    id: 'places/open-crate',
    name: 'Open Crate',
    address: '3 Wax Street, London',
    latitude: 51.504,
    longitude: -0.118,
    rating: 4.5,
    openNow: true,
    openingHoursSummary: 'Mon: 11 AM – 8 PM',
    distanceMeters: 540,
  },
];

export const googlePlacesNearbyPayload = {
  places: [
    {
      id: 'places/open-vinyl',
      displayName: { text: 'Open Vinyl' },
      formattedAddress: '1 Groove Lane, London',
      location: { latitude: 51.501, longitude: -0.121 },
      rating: 4.8,
      currentOpeningHours: { openNow: true, weekdayDescriptions: ['Mon: 10 AM – 7 PM'] },
    },
    {
      id: 'places/closed-spin',
      displayName: { text: 'Closed Spin' },
      formattedAddress: '9 B-side Road, London',
      location: { latitude: 51.508, longitude: -0.125 },
      rating: 4.2,
      currentOpeningHours: { openNow: false, weekdayDescriptions: ['Mon: Closed'] },
    },
  ],
};