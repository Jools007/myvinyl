// Bundled for Vercel — edit scripts/api-entries/record-locator/places.entry.ts and npm run build

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

// features/record-locator/fixtures/loadFixtures.ts
function getPlacesFixturePlaces() {
  return places_nearby_default.places ?? [];
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

// features/record-locator/utils/normalize.ts
var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function summarizeOpeningHours(place) {
  const descriptions = place.currentOpeningHours?.weekdayDescriptions ?? place.regularOpeningHours?.weekdayDescriptions;
  if (!descriptions?.length) return void 0;
  const today = DAY_NAMES[(/* @__PURE__ */ new Date()).getDay()];
  const todayLine = descriptions.find((line) => line.startsWith(today));
  return todayLine ?? descriptions[0];
}
function normalizePlacesPlace(place, origin) {
  const id = place.id?.trim();
  const name = place.displayName?.text?.trim();
  const address = place.formattedAddress?.trim();
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!id || !name || !address || latitude == null || longitude == null) {
    return null;
  }
  return {
    id,
    name,
    address,
    latitude,
    longitude,
    rating: place.rating,
    businessStatus: place.businessStatus,
    openNow: place.currentOpeningHours?.openNow,
    openingHoursSummary: summarizeOpeningHours(place),
    distanceMeters: haversineDistanceMeters(origin, { latitude, longitude })
  };
}
function normalizePlacesResponse(places, origin) {
  if (!places?.length) return [];
  const seen = /* @__PURE__ */ new Set();
  const stores = [];
  for (const place of places) {
    const normalized = normalizePlacesPlace(place, origin);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }
  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// features/record-locator/server/placesHandler.ts
var PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
var PLACES_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
var FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.location",
  "places.rating",
  "places.businessStatus",
  "places.currentOpeningHours",
  "places.regularOpeningHours"
].join(",");
var RecordLocatorValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RecordLocatorValidationError";
  }
};
function parsePlacesSearchBody(body) {
  if (!body || typeof body !== "object") {
    throw new RecordLocatorValidationError("Request body must be a JSON object");
  }
  const data = body;
  const latitude = Number(data.latitude);
  const longitude = Number(data.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw new RecordLocatorValidationError("Valid latitude is required");
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new RecordLocatorValidationError("Valid longitude is required");
  }
  const radiusMeters = data.radiusMeters == null ? 8e3 : Number(data.radiusMeters);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 500 || radiusMeters > 5e4) {
    throw new RecordLocatorValidationError("radiusMeters must be between 500 and 50000");
  }
  return { latitude, longitude, radiusMeters };
}
async function postPlaces(apiKey, url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": FIELD_MASK
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Places API failed (${response.status}): ${text}`);
  }
  return await response.json();
}
async function searchNearby(apiKey, input, includedTypes) {
  const payload = await postPlaces(apiKey, PLACES_NEARBY_URL, {
    includedTypes,
    maxResultCount: 20,
    rankPreference: "DISTANCE",
    locationRestriction: {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: input.radiusMeters ?? 8e3
      }
    }
  });
  return payload.places ?? [];
}
async function searchText(apiKey, input, textQuery) {
  const payload = await postPlaces(apiKey, PLACES_TEXT_URL, {
    textQuery,
    maxResultCount: 20,
    rankPreference: "DISTANCE",
    locationBias: {
      circle: {
        center: { latitude: input.latitude, longitude: input.longitude },
        radius: input.radiusMeters ?? 8e3
      }
    }
  });
  return payload.places ?? [];
}
async function handleNearbyRecordStores(apiKey, input, options) {
  const origin = { latitude: input.latitude, longitude: input.longitude };
  if (options?.useFixture) {
    const stores2 = normalizePlacesResponse(getPlacesFixturePlaces(), origin);
    return { stores: stores2 };
  }
  if (!apiKey) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }
  const [recordStores, musicStores, vinylText, recordText] = await Promise.all([
    searchNearby(apiKey, input, ["record_store"]),
    searchNearby(apiKey, input, ["music_store"]),
    searchText(apiKey, input, "vinyl records store"),
    searchText(apiKey, input, "record store")
  ]);
  const merged = [...recordStores, ...musicStores, ...vinylText, ...recordText];
  const stores = normalizePlacesResponse(merged, origin);
  return { stores };
}

// scripts/api-entries/record-locator/places.entry.ts
var ROUTE = "api/record-locator/places";
function useFixtureMode() {
  return process.env.RECORD_LOCATOR_FIXTURE === "1";
}
function readApiKey() {
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}
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
    const input = parsePlacesSearchBody(parseRequestBody(req));
    const result = await handleNearbyRecordStores(readApiKey(), input, {
      useFixture: useFixtureMode()
    });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof RecordLocatorValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : "Places search failed";
    const status = message.includes("not configured") ? 503 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}
export {
  handler as default
};
