import { getRoutesFixturePayload } from '../fixtures/loadFixtures';
import { optimizeWalkingWaypointOrder, storesByIds } from '../utils/routeOrder';
import type { GeoPosition, RecordStore, WalkingRoute, WalkingRouteLeg } from '../types';
import type { RecordLocatorHandlerOptions } from './placesHandler';

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';
const ROUTES_FIELD_MASK = [
  'routes.duration',
  'routes.distanceMeters',
  'routes.legs.duration',
  'routes.legs.distanceMeters',
  'routes.legs.steps.navigationInstruction',
  'routes.optimizedIntermediateWaypointIndex',
].join(',');

export type WalkingRouteRequest = {
  origin: GeoPosition;
  stores: RecordStore[];
  selectedStoreIds: string[];
};

export function parseWalkingRouteBody(body: unknown): WalkingRouteRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Request body must be a JSON object');
  }
  const data = body as Record<string, unknown>;
  const originRaw = data.origin;
  if (!originRaw || typeof originRaw !== 'object') {
    throw new Error('origin is required');
  }
  const originObj = originRaw as Record<string, unknown>;
  const latitude = Number(originObj.latitude);
  const longitude = Number(originObj.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error('origin latitude and longitude are required');
  }

  if (!Array.isArray(data.stores) || data.stores.length === 0) {
    throw new Error('stores array is required');
  }

  const stores: RecordStore[] = [];
  for (const row of data.stores) {
    if (!row || typeof row !== 'object') continue;
    const s = row as Record<string, unknown>;
    const id = typeof s.id === 'string' ? s.id : '';
    const name = typeof s.name === 'string' ? s.name : '';
    const address = typeof s.address === 'string' ? s.address : '';
    const lat = Number(s.latitude);
    const lon = Number(s.longitude);
    const distanceMeters = Number(s.distanceMeters);
    if (!id || !name || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stores.push({
      id,
      name,
      address,
      latitude: lat,
      longitude: lon,
      distanceMeters: Number.isFinite(distanceMeters) ? distanceMeters : 0,
      rating: typeof s.rating === 'number' ? s.rating : undefined,
      openNow: typeof s.openNow === 'boolean' ? s.openNow : undefined,
      openingHoursSummary:
        typeof s.openingHoursSummary === 'string' ? s.openingHoursSummary : undefined,
    });
  }

  const selectedStoreIds = Array.isArray(data.selectedStoreIds)
    ? data.selectedStoreIds.map((id) => String(id)).filter(Boolean)
    : [];

  if (selectedStoreIds.length < 2) {
    throw new Error('Select at least two stores for a walking route');
  }

  return {
    origin: { latitude, longitude },
    stores,
    selectedStoreIds,
  };
}

type RoutesApiStep = {
  navigationInstruction?: { instructions?: string };
};

type RoutesApiLeg = {
  duration?: string;
  distanceMeters?: number;
  steps?: RoutesApiStep[];
};

type RoutesApiRoute = {
  duration?: string;
  distanceMeters?: number;
  legs?: RoutesApiLeg[];
  optimizedIntermediateWaypointIndex?: number[];
};

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const match = duration.match(/^(\d+)s$/);
  return match ? Number(match[1]) : 0;
}

function buildLegsFromRoute(
  route: RoutesApiRoute,
  stopNames: string[]
): WalkingRouteLeg[] {
  const legs = route.legs ?? [];
  return legs.map((leg, index) => ({
    fromName: stopNames[index] ?? `Stop ${index + 1}`,
    toName: stopNames[index + 1] ?? `Stop ${index + 2}`,
    distanceMeters: leg.distanceMeters ?? 0,
    durationSeconds: parseDurationSeconds(leg.duration),
    steps: (leg.steps ?? [])
      .map((step) => step.navigationInstruction?.instructions?.trim())
      .filter((text): text is string => Boolean(text)),
  }));
}

function buildFallbackRoute(
  origin: GeoPosition,
  stores: RecordStore[],
  selectedIds: string[]
): WalkingRoute {
  const orderedIds = optimizeWalkingWaypointOrder(origin, stores, selectedIds);
  const orderedStores = storesByIds(stores, orderedIds);

  const legs: WalkingRouteLeg[] = orderedStores.map((store, index) => {
    const fromName = index === 0 ? 'You' : orderedStores[index - 1].name;
    return {
      fromName,
      toName: store.name,
      distanceMeters: store.distanceMeters,
      durationSeconds: Math.round(store.distanceMeters / 1.4),
      steps: [`Walk to ${store.name}`, store.address],
    };
  });

  const totalDistanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const totalDurationSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);

  return {
    orderedStoreIds: orderedIds,
    totalDistanceMeters,
    totalDurationSeconds,
    legs,
  };
}

function buildRouteFromFixture(
  fixture: { routes?: RoutesApiRoute[] },
  origin: GeoPosition,
  stores: RecordStore[],
  selectedStoreIds: string[]
): WalkingRoute {
  const clientOrder = optimizeWalkingWaypointOrder(origin, stores, selectedStoreIds);
  const finalStores = storesByIds(stores, clientOrder);
  const stopNames = ['You', ...finalStores.map((s) => s.name)];
  const route = fixture.routes?.[0];
  if (!route) {
    return buildFallbackRoute(origin, stores, selectedStoreIds);
  }
  return {
    orderedStoreIds: clientOrder,
    totalDistanceMeters: route.distanceMeters ?? 0,
    totalDurationSeconds: parseDurationSeconds(route.duration),
    legs: buildLegsFromRoute(route, stopNames),
  };
}

export async function handleWalkingRoute(
  apiKey: string | undefined,
  input: WalkingRouteRequest,
  options?: RecordLocatorHandlerOptions
): Promise<WalkingRoute> {
  const { origin, stores, selectedStoreIds } = input;
  const clientOrder = optimizeWalkingWaypointOrder(origin, stores, selectedStoreIds);
  const orderedStores = storesByIds(stores, clientOrder);

  if (options?.useFixture) {
    return buildRouteFromFixture(getRoutesFixturePayload(), origin, stores, selectedStoreIds);
  }

  if (!apiKey) {
    return buildFallbackRoute(origin, stores, selectedStoreIds);
  }

  const latLng = (pos: GeoPosition) => ({
    location: { latLng: { latitude: pos.latitude, longitude: pos.longitude } },
  });

  try {
    const response = await fetch(ROUTES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': ROUTES_FIELD_MASK,
      },
      body: JSON.stringify({
        origin: latLng(origin),
        destination: latLng({
          latitude: orderedStores[orderedStores.length - 1].latitude,
          longitude: orderedStores[orderedStores.length - 1].longitude,
        }),
        intermediates: orderedStores.slice(0, -1).map((store) =>
          latLng({ latitude: store.latitude, longitude: store.longitude })
        ),
        travelMode: 'WALK',
        optimizeWaypointOrder: true,
        routingPreference: 'ROUTING_PREFERENCE_UNSPECIFIED',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Routes API failed (${response.status}): ${text}`);
    }

    const payload = (await response.json()) as { routes?: RoutesApiRoute[] };
    const route = payload.routes?.[0];
    if (!route) {
      return buildFallbackRoute(origin, stores, selectedStoreIds);
    }

    const optimizedIndexes = route.optimizedIntermediateWaypointIndex;
    let finalOrder = clientOrder;
    if (optimizedIndexes?.length && orderedStores.length > 1) {
      const intermediates = orderedStores.slice(0, -1);
      const reorderedIntermediates = optimizedIndexes.map((i) => intermediates[i]).filter(Boolean);
      const last = orderedStores[orderedStores.length - 1];
      finalOrder = [...reorderedIntermediates, last].map((s) => s.id);
    }

    const finalStores = storesByIds(stores, finalOrder);
    const stopNames = ['You', ...finalStores.map((s) => s.name)];

    return {
      orderedStoreIds: finalOrder,
      totalDistanceMeters: route.distanceMeters ?? 0,
      totalDurationSeconds: parseDurationSeconds(route.duration),
      legs: buildLegsFromRoute(route, stopNames),
    };
  } catch {
    return buildFallbackRoute(origin, stores, selectedStoreIds);
  }
}