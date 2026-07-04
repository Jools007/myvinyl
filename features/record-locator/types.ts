export type GeoPosition = {
  latitude: number;
  longitude: number;
};

export type OpeningHoursPeriod = {
  openDay: number;
  openTime: string;
  closeDay: number;
  closeTime: string;
};

export type RecordStore = {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  businessStatus?: string;
  openNow?: boolean;
  openingHoursSummary?: string;
  distanceMeters: number;
};

export type PlacesSearchRequest = {
  latitude: number;
  longitude: number;
  radiusMeters?: number;
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
  | { status: 'granted'; position: GeoPosition }
  | { status: 'denied'; message: string }
  | { status: 'error'; message: string };

export type NearbyStoresState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; stores: RecordStore[] }
  | { status: 'error'; message: string };