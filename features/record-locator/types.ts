export type GeoPosition = {
  latitude: number;
  longitude: number;
};

export type RecordStoreSource = 'google' | 'osm';

export type RecordStore = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  ratingCount?: number;
  businessStatus?: string;
  openNow?: boolean;
  openingHoursSummary?: string;
  phone?: string;
  website?: string;
  mapsUrl?: string;
  photoUrl?: string;
  distanceMeters: number;
  source?: RecordStoreSource;
};

export type PlacesSearchRequest = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
};

export type RecordStoreSearchMeta = {
  source: 'google' | 'osm' | 'combined' | 'fixture';
  locationLabel: string;
  googleCount?: number;
  osmCount?: number;
  googleEnriched?: boolean;
};

export type WalkingRouteLeg = {
  fromName: string;
  toName: string;
  distanceMeters: number;
  durationSeconds: number;
  steps: string[];
};

export type WalkingRoute = {
  orderedStoreIds: string[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  legs: WalkingRouteLeg[];
};

export type GeolocationState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'granted'; position: GeoPosition; accuracyMeters?: number }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string };

export type NearbyStoresState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; stores: RecordStore[]; meta: RecordStoreSearchMeta }
  | { status: 'error'; message: string };