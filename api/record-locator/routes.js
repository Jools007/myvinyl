// Bundled for Vercel — edit scripts/api-entries/record-locator/routes.entry.ts and npm run build

// api/_lib/log.ts
function serializeError(error) {
  if (error == null) {
    return { type: "null", value: String(error) };
  }
  if (error instanceof Error) {
    const serialized = {
      type: "Error",
      name: error.name,
      message: error.message,
      stack: error.stack
    };
    if ("cause" in error && error.cause !== void 0) {
      serialized.cause = serializeError(error.cause);
    }
    for (const key of Object.getOwnPropertyNames(error)) {
      if (key === "name" || key === "message" || key === "stack" || key === "cause") {
        continue;
      }
      try {
        serialized[key] = error[key];
      } catch {
        serialized[key] = "[unreadable]";
      }
    }
    return serialized;
  }
  if (typeof error === "object") {
    try {
      return {
        type: "object",
        value: JSON.parse(JSON.stringify(error))
      };
    } catch {
      return { type: "object", value: String(error) };
    }
  }
  return { type: typeof error, value: String(error) };
}
function logApiError(route, error, context) {
  console.error(`[${route}] ERROR`, {
    ...context,
    error: serializeError(error)
  });
}
function logApiRequest(route, req, phase) {
  const body = req.body;
  let bodyKind = "none";
  if (body != null && body !== "") {
    if (Buffer.isBuffer(body)) bodyKind = "buffer";
    else if (typeof body === "string") bodyKind = "string";
    else if (typeof body === "object") bodyKind = "object";
    else bodyKind = typeof body;
  }
  console.error(`[${route}] request`, {
    phase,
    method: req.method,
    url: req.url,
    query: req.query,
    bodyKind,
    contentType: req.headers["content-type"],
    userAgent: req.headers["user-agent"]
  });
}

// api/_lib/response.ts
function json(res, route, status, body) {
  try {
    res.status(status).json(body);
  } catch (error) {
    logApiError(route, error, { phase: "send-response", status });
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to send response" });
    }
  }
}

// features/record-locator/fixtures/places-nearby.json
var places_nearby_default = {
  places: [
    {
      id: "places/open-vinyl",
      displayName: { text: "Open Vinyl" },
      formattedAddress: "1 Groove Lane, London",
      location: { latitude: 51.501, longitude: -0.121 },
      rating: 4.8,
      businessStatus: "OPERATIONAL",
      currentOpeningHours: {
        openNow: true,
        weekdayDescriptions: ["Mon: 10 AM \u2013 7 PM"]
      }
    },
    {
      id: "places/closed-spin",
      displayName: { text: "Closed Spin" },
      formattedAddress: "9 B-side Road, London",
      location: { latitude: 51.508, longitude: -0.125 },
      rating: 4.2,
      businessStatus: "OPERATIONAL",
      currentOpeningHours: {
        openNow: false,
        weekdayDescriptions: ["Mon: Closed"]
      }
    },
    {
      id: "places/open-crate",
      displayName: { text: "Open Crate" },
      formattedAddress: "3 Wax Street, London",
      location: { latitude: 51.504, longitude: -0.118 },
      rating: 4.5,
      businessStatus: "OPERATIONAL",
      currentOpeningHours: {
        openNow: true,
        weekdayDescriptions: ["Mon: 11 AM \u2013 8 PM"]
      }
    }
  ]
};

// features/record-locator/fixtures/routes-walk.json
var routes_walk_default = {
  routes: [
    {
      duration: "900s",
      distanceMeters: 1200,
      optimizedIntermediateWaypointIndex: [0],
      legs: [
        {
          duration: "240s",
          distanceMeters: 320,
          steps: [
            { navigationInstruction: { instructions: "Head north on Groove Lane" } }
          ]
        },
        {
          duration: "660s",
          distanceMeters: 880,
          steps: [
            { navigationInstruction: { instructions: "Turn right on Wax Street" } }
          ]
        }
      ]
    }
  ]
};

// features/record-locator/fixtures/loadFixtures.ts
function getPlacesFixturePlaces() {
  return places_nearby_default.places ?? [];
}
function getRoutesFixturePayload() {
  return routes_walk_default;
}

// features/record-locator/server/googleFetch.ts
var PLACES_HOST = "places.googleapis.com";
var ROUTES_HOST = "routes.googleapis.com";
var FIXTURE_API_KEY = "fixture-intercept";
function urlString(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}
function isGooglePlacesUrl(url) {
  return url.includes(PLACES_HOST);
}
function isGoogleRoutesUrl(url) {
  return url.includes(ROUTES_HOST);
}
function fixtureResponseForUrl(url) {
  if (isGooglePlacesUrl(url)) {
    return new Response(JSON.stringify({ places: getPlacesFixturePlaces() }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  if (isGoogleRoutesUrl(url)) {
    return new Response(JSON.stringify(getRoutesFixturePayload()), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }
  throw new Error(`Fixture fetch cannot handle URL: ${url}`);
}
function createGoogleFetch(mode) {
  if (mode === "live") {
    return globalThis.fetch.bind(globalThis);
  }
  return async (input, init) => {
    const url = urlString(input);
    if (isGooglePlacesUrl(url) || isGoogleRoutesUrl(url)) {
      return fixtureResponseForUrl(url);
    }
    return globalThis.fetch(input, init);
  };
}
function isRecordLocatorFixtureMode(env = process.env) {
  return env.RECORD_LOCATOR_FIXTURE === "1";
}
function resolveRecordLocatorApiKey(env = process.env) {
  const key = env.GOOGLE_PLACES_API_KEY?.trim();
  if (key) return key;
  return isRecordLocatorFixtureMode(env) ? FIXTURE_API_KEY : void 0;
}
function resolveRecordLocatorFetch(env = process.env) {
  return createGoogleFetch(isRecordLocatorFixtureMode(env) ? "fixture" : "live");
}

// features/record-locator/utils/geo.ts
var EARTH_RADIUS_METERS = 6371e3;
function toRadians(degrees) {
  return degrees * Math.PI / 180;
}
function haversineDistanceMeters(from, to) {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

// features/record-locator/utils/routeOrder.ts
function optimizeWalkingWaypointOrder(origin, stores, selectedIds) {
  const selected = stores.filter((s) => selectedIds.includes(s.id));
  if (selected.length <= 1) return selected.map((s) => s.id);
  const remaining = new Map(selected.map((s) => [s.id, s]));
  const ordered = [];
  let cursor = origin;
  while (remaining.size > 0) {
    let nearestId = null;
    let nearestDistance = Infinity;
    for (const [id, store] of remaining) {
      const distance = haversineDistanceMeters(cursor, {
        latitude: store.latitude,
        longitude: store.longitude
      });
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = id;
      }
    }
    if (!nearestId) break;
    const next = remaining.get(nearestId);
    remaining.delete(nearestId);
    ordered.push(nearestId);
    cursor = { latitude: next.latitude, longitude: next.longitude };
  }
  return ordered;
}
function storesByIds(stores, ids) {
  const map = new Map(stores.map((s) => [s.id, s]));
  return ids.map((id) => map.get(id)).filter((s) => Boolean(s));
}

// features/record-locator/server/routesHandler.ts
var ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
var ROUTES_FIELD_MASK = [
  "routes.duration",
  "routes.distanceMeters",
  "routes.legs.duration",
  "routes.legs.distanceMeters",
  "routes.legs.steps.navigationInstruction",
  "routes.optimizedIntermediateWaypointIndex"
].join(",");
function parseWalkingRouteBody(body) {
  if (!body || typeof body !== "object") {
    throw new Error("Request body must be a JSON object");
  }
  const data = body;
  const originRaw = data.origin;
  if (!originRaw || typeof originRaw !== "object") {
    throw new Error("origin is required");
  }
  const originObj = originRaw;
  const latitude = Number(originObj.latitude);
  const longitude = Number(originObj.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("origin latitude and longitude are required");
  }
  if (!Array.isArray(data.stores) || data.stores.length === 0) {
    throw new Error("stores array is required");
  }
  const stores = [];
  for (const row of data.stores) {
    if (!row || typeof row !== "object") continue;
    const s = row;
    const id = typeof s.id === "string" ? s.id : "";
    const name = typeof s.name === "string" ? s.name : "";
    const address = typeof s.address === "string" ? s.address : "";
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
      rating: typeof s.rating === "number" ? s.rating : void 0,
      openNow: typeof s.openNow === "boolean" ? s.openNow : void 0,
      openingHoursSummary: typeof s.openingHoursSummary === "string" ? s.openingHoursSummary : void 0
    });
  }
  const selectedStoreIds = Array.isArray(data.selectedStoreIds) ? data.selectedStoreIds.map((id) => String(id)).filter(Boolean) : [];
  if (selectedStoreIds.length < 2) {
    throw new Error("Select at least two stores for a walking route");
  }
  return {
    origin: { latitude, longitude },
    stores,
    selectedStoreIds
  };
}
function parseDurationSeconds(duration) {
  if (!duration) return 0;
  const match = duration.match(/^(\d+)s$/);
  return match ? Number(match[1]) : 0;
}
function buildLegsFromRoute(route, stopNames) {
  const legs = route.legs ?? [];
  return legs.map((leg, index) => ({
    fromName: stopNames[index] ?? `Stop ${index + 1}`,
    toName: stopNames[index + 1] ?? `Stop ${index + 2}`,
    distanceMeters: leg.distanceMeters ?? 0,
    durationSeconds: parseDurationSeconds(leg.duration),
    steps: (leg.steps ?? []).map((step) => step.navigationInstruction?.instructions?.trim()).filter((text) => Boolean(text))
  }));
}
function buildFallbackRoute(origin, stores, selectedIds) {
  const orderedIds = optimizeWalkingWaypointOrder(origin, stores, selectedIds);
  const orderedStores = storesByIds(stores, orderedIds);
  const legs = orderedStores.map((store, index) => {
    const fromName = index === 0 ? "You" : orderedStores[index - 1].name;
    return {
      fromName,
      toName: store.name,
      distanceMeters: store.distanceMeters,
      durationSeconds: Math.round(store.distanceMeters / 1.4),
      steps: [`Walk to ${store.name}`, store.address]
    };
  });
  const totalDistanceMeters = legs.reduce((sum, leg) => sum + leg.distanceMeters, 0);
  const totalDurationSeconds = legs.reduce((sum, leg) => sum + leg.durationSeconds, 0);
  return {
    orderedStoreIds: orderedIds,
    totalDistanceMeters,
    totalDurationSeconds,
    legs
  };
}
async function handleWalkingRoute(apiKey, input, options) {
  const { origin, stores, selectedStoreIds } = input;
  const clientOrder = optimizeWalkingWaypointOrder(origin, stores, selectedStoreIds);
  const orderedStores = storesByIds(stores, clientOrder);
  const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  if (!apiKey) {
    return buildFallbackRoute(origin, stores, selectedStoreIds);
  }
  const latLng = (pos) => ({
    location: { latLng: { latitude: pos.latitude, longitude: pos.longitude } }
  });
  try {
    const response = await fetchFn(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": ROUTES_FIELD_MASK
      },
      body: JSON.stringify({
        origin: latLng(origin),
        destination: latLng({
          latitude: orderedStores[orderedStores.length - 1].latitude,
          longitude: orderedStores[orderedStores.length - 1].longitude
        }),
        intermediates: orderedStores.slice(0, -1).map(
          (store) => latLng({ latitude: store.latitude, longitude: store.longitude })
        ),
        travelMode: "WALK",
        optimizeWaypointOrder: true,
        routingPreference: "ROUTING_PREFERENCE_UNSPECIFIED"
      })
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Google Routes API failed (${response.status}): ${text}`);
    }
    const payload = await response.json();
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
    const stopNames = ["You", ...finalStores.map((s) => s.name)];
    return {
      orderedStoreIds: finalOrder,
      totalDistanceMeters: route.distanceMeters ?? 0,
      totalDurationSeconds: parseDurationSeconds(route.duration),
      legs: buildLegsFromRoute(route, stopNames)
    };
  } catch {
    return buildFallbackRoute(origin, stores, selectedStoreIds);
  }
}

// scripts/api-entries/record-locator/routes.entry.ts
var ROUTE = "api/record-locator/routes";
function parseRequestBody(req) {
  const raw = req.body;
  if (raw == null || raw === "") return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return raw;
}
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "POST") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    const input = parseWalkingRouteBody(parseRequestBody(req));
    const route = await handleWalkingRoute(resolveRecordLocatorApiKey(), input, {
      fetchFn: resolveRecordLocatorFetch()
    });
    return json(res, ROUTE, 200, { route });
  } catch (error) {
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : "Walking route failed";
    if (message.includes("not configured")) {
      return json(res, ROUTE, 503, { error: message });
    }
    const status = /required|at least/i.test(message) ? 400 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}
export {
  handler as default
};
