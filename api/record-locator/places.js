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

// features/record-locator/utils/normalize.ts
var DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
var MERGE_MAX_METERS = 80;
var RECORD_LOCATOR_PHOTO_API = "/api/record-locator/photo";
function buildPlacePhotoUrl(photoName) {
  if (!photoName?.trim()) return void 0;
  return `${RECORD_LOCATOR_PHOTO_API}?n=${encodeURIComponent(photoName.trim())}`;
}
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
    ratingCount: place.userRatingCount,
    businessStatus: place.businessStatus,
    openNow: place.currentOpeningHours?.openNow,
    openingHoursSummary: summarizeOpeningHours(place),
    phone: place.nationalPhoneNumber ?? place.internationalPhoneNumber,
    website: place.websiteUri,
    mapsUrl: place.googleMapsUri,
    photoUrl: buildPlacePhotoUrl(place.photos?.[0]?.name),
    distanceMeters: haversineDistanceMeters(origin, { latitude, longitude }),
    source: "google"
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
function enrichStoreWithFallback(primary, fallback) {
  return {
    ...primary,
    phone: primary.phone ?? fallback.phone,
    website: primary.website ?? fallback.website,
    openingHoursSummary: primary.openingHoursSummary ?? fallback.openingHoursSummary,
    openNow: primary.openNow ?? fallback.openNow,
    photoUrl: primary.photoUrl ?? fallback.photoUrl,
    rating: primary.rating ?? fallback.rating,
    ratingCount: primary.ratingCount ?? fallback.ratingCount,
    mapsUrl: primary.mapsUrl ?? fallback.mapsUrl
  };
}
function mergeRecordStoreResults(googleStores, osmStores) {
  const merged = [...googleStores];
  for (const osm of osmStores) {
    const matchIndex = merged.findIndex(
      (google) => haversineDistanceMeters(google, osm) <= MERGE_MAX_METERS
    );
    if (matchIndex >= 0) {
      merged[matchIndex] = enrichStoreWithFallback(merged[matchIndex], osm);
      continue;
    }
    merged.push(osm);
  }
  return merged.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// features/record-locator/utils/openingHours.ts
var DAY_CODES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
var DAY_INDEX = {
  Su: 0,
  Mo: 1,
  Tu: 2,
  We: 3,
  Th: 4,
  Fr: 5,
  Sa: 6
};
function parseTime(value) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}
function expandDayToken(token) {
  const trimmed = token.trim();
  if (!trimmed) return [];
  if (trimmed.includes(",")) {
    return trimmed.split(",").flatMap((part) => expandDayToken(part)).filter((day, index, all) => all.indexOf(day) === index);
  }
  const rangeMatch = trimmed.match(/^([A-Za-z]{2})-([A-Za-z]{2})$/);
  if (rangeMatch) {
    const start = rangeMatch[1];
    const end = rangeMatch[2];
    if (!(start in DAY_INDEX) || !(end in DAY_INDEX)) return [];
    const days = [];
    let cursor = DAY_INDEX[start];
    const endIndex = DAY_INDEX[end];
    for (let guard = 0; guard < 7; guard += 1) {
      days.push(cursor);
      if (cursor === endIndex) break;
      cursor = (cursor + 1) % 7;
    }
    return days;
  }
  const code = trimmed;
  return code in DAY_INDEX ? [DAY_INDEX[code]] : [];
}
function parseDayRules(raw) {
  const rules = [];
  const segments = raw.split(";").map((segment) => segment.trim()).filter(Boolean);
  for (const segment of segments) {
    if (/^(off|closed)$/i.test(segment)) continue;
    const offMatch = segment.match(/^([A-Za-z0-9,\-]+)\s+(off|closed)$/i);
    if (offMatch) {
      rules.push({
        days: expandDayToken(offMatch[1]),
        ranges: [],
        closed: true
      });
      continue;
    }
    const match = segment.match(/^([A-Za-z0-9,\-]+)\s+(.+)$/);
    if (!match) continue;
    const days = expandDayToken(match[1]);
    const timePart = match[2].trim();
    if (!days.length) continue;
    if (/^(off|closed)$/i.test(timePart)) {
      rules.push({ days, ranges: [], closed: true });
      continue;
    }
    const ranges = [];
    for (const rangeToken of timePart.split(",").map((part) => part.trim())) {
      const rangeMatch = rangeToken.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!rangeMatch) continue;
      const startMinutes = parseTime(rangeMatch[1]);
      const endMinutes = parseTime(rangeMatch[2]);
      if (startMinutes == null || endMinutes == null) continue;
      ranges.push({ startMinutes, endMinutes });
    }
    if (ranges.length) {
      rules.push({ days, ranges, closed: false });
    }
  }
  return rules;
}
function minutesNow(date) {
  return date.getHours() * 60 + date.getMinutes();
}
function isOpenAt(rules, date) {
  const day = date.getDay();
  const now = minutesNow(date);
  const dayRules = rules.filter((rule) => rule.days.includes(day));
  if (dayRules.length === 0) {
    return rules.length > 0 ? false : void 0;
  }
  let sawClosed = false;
  let sawOpenRange = false;
  for (const rule of dayRules) {
    if (rule.closed) {
      sawClosed = true;
      continue;
    }
    for (const range of rule.ranges) {
      sawOpenRange = true;
      if (range.endMinutes > range.startMinutes) {
        if (now >= range.startMinutes && now < range.endMinutes) return true;
      } else if (now >= range.startMinutes || now < range.endMinutes) {
        return true;
      }
    }
  }
  if (sawClosed && !sawOpenRange) return false;
  if (sawOpenRange) return false;
  return void 0;
}
function todaySummary(rules, date) {
  const day = date.getDay();
  const code = DAY_CODES[day];
  const dayRules = rules.filter((rule) => rule.days.includes(day));
  if (!dayRules.length) return void 0;
  const closed = dayRules.some((rule) => rule.closed && rule.ranges.length === 0);
  if (closed) return `${code}: Closed`;
  const ranges = dayRules.flatMap((rule) => rule.ranges);
  if (!ranges.length) return void 0;
  const formatted = ranges.map((range) => {
    const start = formatMinutes(range.startMinutes);
    const end = formatMinutes(range.endMinutes);
    return `${start}\u2013${end}`;
  }).join(", ");
  return `${code}: ${formatted}`;
}
function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function evaluateOsmOpeningHours(raw, date = /* @__PURE__ */ new Date()) {
  if (!raw?.trim()) return {};
  const normalized = raw.trim();
  if (/^24\s*\/\s*7$/i.test(normalized)) {
    return { openNow: true, todaySummary: "Open 24 hours" };
  }
  const rules = parseDayRules(normalized);
  if (!rules.length) return {};
  return {
    openNow: isOpenAt(rules, date),
    todaySummary: todaySummary(rules, date)
  };
}
function applyOpeningHoursToStore(store, date = /* @__PURE__ */ new Date()) {
  if (store.openNow != null || !store.openingHoursSummary) return store;
  const evaluated = evaluateOsmOpeningHours(store.openingHoursSummary, date);
  return {
    ...store,
    openNow: evaluated.openNow ?? store.openNow,
    openingHoursSummary: evaluated.todaySummary ?? store.openingHoursSummary
  };
}

// features/record-locator/server/osmEnrichmentHandler.ts
var OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
var OVERPASS_USER_AGENT = "MyVinylRecordLocator/1.0 (record-store-enrichment)";
function parseOsmStoreRef(storeId) {
  const match = storeId.match(/(?:osm|photon)\/(node|way|relation)\/(\d+)/);
  if (!match) return null;
  return { element: match[1], osmId: Number(match[2]) };
}
function buildTagsQuery(refs) {
  const lines = refs.map((ref) => `${ref.element}(${ref.osmId});`);
  return `[out:json][timeout:20];
(
${lines.join("\n")}
);
out tags;`;
}
async function fetchOsmTags(refs, fetchFn) {
  if (!refs.length) return /* @__PURE__ */ new Map();
  const query = buildTagsQuery(refs);
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetchFn(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": OVERPASS_USER_AGENT,
          Accept: "application/json"
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(1e4)
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Overpass enrichment failed (${response.status}): ${text.slice(0, 160)}`);
      }
      const payload = await response.json();
      const tagsByKey = /* @__PURE__ */ new Map();
      for (const element of payload.elements ?? []) {
        if (!element.tags) continue;
        tagsByKey.set(`${element.type}/${element.id}`, element.tags);
      }
      return tagsByKey;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Overpass enrichment failed");
    }
  }
  if (lastError) throw lastError;
  return /* @__PURE__ */ new Map();
}
function mergeTagsIntoStore(store, tags) {
  const openingHoursSummary = tags.opening_hours ?? store.openingHoursSummary;
  const enriched = {
    ...store,
    phone: store.phone ?? tags.phone ?? tags["contact:phone"],
    website: store.website ?? tags.website ?? tags["contact:website"],
    openingHoursSummary
  };
  return applyOpeningHoursToStore(enriched);
}
async function enrichStoresWithOsmTags(stores, fetchFn) {
  const refs = [];
  const refByStoreId = /* @__PURE__ */ new Map();
  for (const store of stores) {
    const ref = parseOsmStoreRef(store.id);
    if (!ref) continue;
    refs.push(ref);
    refByStoreId.set(store.id, ref);
  }
  if (!refs.length) {
    return stores.map((store) => applyOpeningHoursToStore(store));
  }
  try {
    const tagsByKey = await fetchOsmTags(refs, fetchFn);
    return stores.map((store) => {
      const ref = refByStoreId.get(store.id);
      if (!ref) return applyOpeningHoursToStore(store);
      const tags = tagsByKey.get(`${ref.element}/${ref.osmId}`);
      if (!tags) return applyOpeningHoursToStore(store);
      return mergeTagsIntoStore(store, tags);
    });
  } catch {
    return stores.map((store) => applyOpeningHoursToStore(store));
  }
}

// features/record-locator/utils/osmNormalize.ts
var VINYL_NAME = /record|vinyl|vinil|plokštel|vinilo|viniloteka|vinylomania|hi-fi|hifi|thelonious/i;
var EXCLUDE_NAME = /grindys|flooring|grindų/i;
function elementCoords(element) {
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { latitude: lat, longitude: lon };
}
function formatOsmAddress(tags) {
  if (tags["addr:full"]?.trim()) return tags["addr:full"].trim();
  const parts = [
    [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" "),
    tags["addr:city"] ?? tags["addr:place"],
    tags["addr:postcode"]
  ].filter(Boolean);
  return parts.join(", ") || tags.address?.trim() || "Address not listed";
}
function isLikelyRecordShop(tags) {
  if (!tags) return false;
  const shop = tags.shop?.toLowerCase();
  if (shop === "music" || shop === "vinyl" || shop === "hifi") return true;
  const name = tags.name ?? "";
  if (EXCLUDE_NAME.test(name)) return false;
  return VINYL_NAME.test(name);
}
function normalizeOsmElement(element, origin) {
  const tags = element.tags;
  if (!tags || !isLikelyRecordShop(tags)) return null;
  const coords = elementCoords(element);
  const name = tags.name?.trim();
  if (!coords || !name) return null;
  const id = `osm/${element.type}/${element.id}`;
  return applyOpeningHoursToStore({
    id,
    name,
    address: formatOsmAddress(tags),
    latitude: coords.latitude,
    longitude: coords.longitude,
    phone: tags.phone ?? tags["contact:phone"],
    website: tags.website ?? tags["contact:website"],
    mapsUrl: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    openingHoursSummary: tags.opening_hours,
    distanceMeters: haversineDistanceMeters(origin, coords),
    source: "osm"
  });
}
function normalizeOsmResponse(elements, origin) {
  if (!elements?.length) return [];
  const seen = /* @__PURE__ */ new Set();
  const stores = [];
  for (const element of elements) {
    const normalized = normalizeOsmElement(element, origin);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }
  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// features/record-locator/server/osmSearchHandler.ts
var OVERPASS_ENDPOINTS2 = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter"
];
var OVERPASS_USER_AGENT2 = "MyVinylRecordLocator/1.0 (record-store-locator)";
function buildOverpassQuery(latitude, longitude, radiusMeters) {
  const radius = Math.min(Math.max(radiusMeters, 1e3), 25e3);
  return `[out:json][timeout:25];
(
  node["shop"="music"](around:${radius},${latitude},${longitude});
  node["shop"="vinyl"](around:${radius},${latitude},${longitude});
  node["shop"="hifi"](around:${radius},${latitude},${longitude});
  way["shop"="music"](around:${radius},${latitude},${longitude});
  way["shop"="vinyl"](around:${radius},${latitude},${longitude});
  node["name"~"record|vinyl|vinil|plok\u0161tel|vinilo|viniloteka",i](around:${radius},${latitude},${longitude});
  way["name"~"record|vinyl|vinil|plok\u0161tel|vinilo|viniloteka",i](around:${radius},${latitude},${longitude});
);
out center tags;`;
}
async function queryOverpass(endpoint, query, fetchFn) {
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": OVERPASS_USER_AGENT2,
      Accept: "application/json"
    },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(12e3)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenStreetMap search failed (${response.status}): ${text.slice(0, 200)}`);
  }
  const payload = await response.json();
  return payload.elements ?? [];
}
async function searchOsmRecordStores(input, fetchFn) {
  const query = buildOverpassQuery(input.latitude, input.longitude, input.radiusMeters ?? 12e3);
  const origin = { latitude: input.latitude, longitude: input.longitude };
  let lastError;
  for (const endpoint of OVERPASS_ENDPOINTS2) {
    try {
      const elements = await queryOverpass(endpoint, query, fetchFn);
      const stores = normalizeOsmResponse(elements, origin);
      if (stores.length > 0) return stores;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("OpenStreetMap search failed");
    }
  }
  if (lastError) throw lastError;
  return [];
}

// features/record-locator/utils/photonNormalize.ts
function photonOsmPath(type) {
  if (type === "N" || type === "node") return "node";
  if (type === "W" || type === "way") return "way";
  if (type === "R" || type === "relation") return "relation";
  return "node";
}
function photonId(feature) {
  const type = photonOsmPath(feature.properties.osm_type);
  const id = feature.properties.osm_id ?? 0;
  return `photon/${type}/${id}`;
}
function photonAddress(props) {
  const street = [props.street, props.housenumber].filter(Boolean).join(" ");
  const parts = [street, props.city, props.postcode, props.country].filter(Boolean);
  return parts.join(", ") || "Address not listed";
}
function normalizePhotonFeature(feature, origin, maxDistanceMeters) {
  const [lon, lat] = feature.geometry.coordinates;
  const props = feature.properties;
  const name = props.name?.trim();
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const tags = { name };
  if (props.osm_key === "shop" && props.osm_value) {
    tags.shop = props.osm_value;
  }
  if (!isLikelyRecordShop(tags) && props.osm_value !== "music" && props.osm_value !== "vinyl") {
    if (!isLikelyRecordShop({ name })) return null;
  }
  const distanceMeters = haversineDistanceMeters(origin, { latitude: lat, longitude: lon });
  if (distanceMeters > maxDistanceMeters) return null;
  return {
    id: photonId(feature),
    name,
    address: photonAddress(props),
    latitude: lat,
    longitude: lon,
    distanceMeters,
    source: "osm",
    mapsUrl: `https://www.openstreetmap.org/${photonOsmPath(props.osm_type)}/${props.osm_id ?? ""}`
  };
}
function normalizePhotonResponse(features, origin, maxDistanceMeters) {
  if (!features?.length) return [];
  const seen = /* @__PURE__ */ new Set();
  const stores = [];
  for (const feature of features) {
    const normalized = normalizePhotonFeature(feature, origin, maxDistanceMeters);
    if (!normalized || seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    stores.push(normalized);
  }
  return stores.sort((a, b) => a.distanceMeters - b.distanceMeters);
}

// features/record-locator/server/photonSearchHandler.ts
var PHOTON_URL = "https://photon.komoot.io/api/";
var PHOTON_QUERIES = [
  "vinyl shop",
  "record store",
  "music store",
  "vinyl records",
  "Viniloteka",
  "Muzikumas",
  "VinyloMania",
  "iMuzika",
  "Thelonious"
];
async function searchPhotonRecordStores(input, fetchFn) {
  const radius = input.radiusMeters ?? 12e3;
  const allFeatures = [];
  await Promise.all(
    PHOTON_QUERIES.map(async (query) => {
      const url = new URL(PHOTON_URL);
      url.searchParams.set("q", query);
      url.searchParams.set("lat", String(input.latitude));
      url.searchParams.set("lon", String(input.longitude));
      url.searchParams.set("limit", "12");
      url.searchParams.set("lang", "en");
      try {
        const response = await fetchFn(url.toString(), {
          signal: AbortSignal.timeout(8e3)
        });
        if (!response.ok) return;
        const payload = await response.json();
        if (payload.features?.length) allFeatures.push(...payload.features);
      } catch {
      }
    })
  );
  return normalizePhotonResponse(allFeatures, {
    latitude: input.latitude,
    longitude: input.longitude
  }, radius);
}

// features/record-locator/server/reverseGeocode.ts
var NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse";
var NOMINATIM_USER_AGENT = "MyVinylRecordLocator/1.0 (record-store-locator)";
function formatLocationLabel(payload, position) {
  const addr = payload.address;
  const locality = addr?.city ?? addr?.town ?? addr?.village ?? addr?.municipality ?? addr?.county;
  const country = addr?.country;
  const coords = `${position.latitude.toFixed(4)}\xB0, ${position.longitude.toFixed(4)}\xB0`;
  if (locality && country) return `${locality}, ${country} \xB7 ${coords}`;
  if (payload.display_name) {
    const short = payload.display_name.split(",").slice(0, 2).join(",").trim();
    return `${short} \xB7 ${coords}`;
  }
  return coords;
}
async function reverseGeocodeLabel(position, fetchFn) {
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("lat", String(position.latitude));
  url.searchParams.set("lon", String(position.longitude));
  url.searchParams.set("format", "json");
  url.searchParams.set("zoom", "14");
  let response;
  try {
    response = await fetchFn(url.toString(), {
      headers: {
        "User-Agent": NOMINATIM_USER_AGENT,
        Accept: "application/json"
      },
      signal: AbortSignal.timeout(5e3)
    });
  } catch {
    return `${position.latitude.toFixed(4)}\xB0, ${position.longitude.toFixed(4)}\xB0`;
  }
  if (!response?.ok) {
    return `${position.latitude.toFixed(4)}\xB0, ${position.longitude.toFixed(4)}\xB0`;
  }
  const payload = await response.json();
  return formatLocationLabel(payload, position);
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
  "places.regularOpeningHours",
  "places.nationalPhoneNumber",
  "places.internationalPhoneNumber",
  "places.websiteUri",
  "places.googleMapsUri",
  "places.photos",
  "places.userRatingCount"
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
  const radiusMeters = data.radiusMeters == null ? 12e3 : Number(data.radiusMeters);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 500 || radiusMeters > 5e4) {
    throw new RecordLocatorValidationError("radiusMeters must be between 500 and 50000");
  }
  return { latitude, longitude, radiusMeters };
}
async function postPlaces(apiKey, url, body, fetchFn) {
  const response = await fetchFn(url, {
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
async function searchNearby(apiKey, input, includedTypes, fetchFn) {
  const payload = await postPlaces(
    apiKey,
    PLACES_NEARBY_URL,
    {
      includedTypes,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: input.radiusMeters ?? 12e3
        }
      }
    },
    fetchFn
  );
  return payload.places ?? [];
}
async function searchText(apiKey, input, textQuery, fetchFn) {
  const payload = await postPlaces(
    apiKey,
    PLACES_TEXT_URL,
    {
      textQuery,
      maxResultCount: 20,
      rankPreference: "DISTANCE",
      locationBias: {
        circle: {
          center: { latitude: input.latitude, longitude: input.longitude },
          radius: input.radiusMeters ?? 12e3
        }
      }
    },
    fetchFn
  );
  return payload.places ?? [];
}
async function searchGoogleRecordStores(apiKey, input, fetchFn) {
  const origin = { latitude: input.latitude, longitude: input.longitude };
  const [recordStores, musicStores, vinylText, recordText, shopText] = await Promise.all([
    searchNearby(apiKey, input, ["record_store"], fetchFn),
    searchNearby(apiKey, input, ["music_store"], fetchFn),
    searchText(apiKey, input, "vinyl record shop", fetchFn),
    searchText(apiKey, input, "record store", fetchFn),
    searchText(apiKey, input, "vinyl shop", fetchFn)
  ]);
  const merged = [...recordStores, ...musicStores, ...vinylText, ...recordText, ...shopText];
  return normalizePlacesResponse(merged, origin);
}
function isRealGoogleKey(apiKey) {
  return Boolean(apiKey?.trim() && apiKey !== FIXTURE_API_KEY);
}
async function handleNearbyRecordStores(apiKey, input, options) {
  const origin = { latitude: input.latitude, longitude: input.longitude };
  const fetchFn = options?.fetchFn ?? globalThis.fetch.bind(globalThis);
  const coordsLabel = `${origin.latitude.toFixed(4)}\xB0, ${origin.longitude.toFixed(4)}\xB0`;
  const isFixture = apiKey === FIXTURE_API_KEY;
  if (isFixture) {
    const [stores2, locationLabel2] = await Promise.all([
      searchGoogleRecordStores(apiKey, input, fetchFn),
      reverseGeocodeLabel(origin, fetchFn).catch(() => coordsLabel)
    ]);
    return {
      stores: stores2,
      meta: { source: "fixture", locationLabel: locationLabel2, googleCount: stores2.length, osmCount: 0 }
    };
  }
  const locationPromise = reverseGeocodeLabel(origin, fetchFn).catch(() => coordsLabel);
  let googleStores = [];
  let googleError;
  const googlePromise = isRealGoogleKey(apiKey) ? searchGoogleRecordStores(apiKey, input, fetchFn).catch((error) => {
    googleError = error instanceof Error ? error.message : "Google Places search failed";
    return [];
  }) : Promise.resolve([]);
  let osmStores = [];
  let osmError;
  const photonPromise = searchPhotonRecordStores(input, fetchFn).catch(() => []);
  const osmPromise = photonPromise.then(async (photonStores) => {
    if (photonStores.length > 0) return photonStores;
    try {
      return await searchOsmRecordStores(input, fetchFn);
    } catch (error) {
      osmError = error instanceof Error ? error.message : "OpenStreetMap search failed";
      return [];
    }
  });
  const [locationLabel, googleResult, osmResult] = await Promise.all([
    locationPromise,
    googlePromise,
    osmPromise
  ]);
  googleStores = googleResult;
  osmStores = osmResult;
  if (googleStores.length === 0 && osmStores.length === 0) {
    const parts = [googleError, osmError].filter(Boolean);
    throw new Error(
      parts.length ? parts.join(" \xB7 ") : "No record stores found near your location. Try widening your search area."
    );
  }
  const mergedStores = googleStores.length > 0 && osmStores.length > 0 ? mergeRecordStoreResults(googleStores, osmStores) : [...googleStores, ...osmStores].sort((a, b) => a.distanceMeters - b.distanceMeters);
  const stores = await enrichStoresWithOsmTags(mergedStores, fetchFn);
  const source = googleStores.length > 0 && osmStores.length > 0 ? "combined" : googleStores.length > 0 ? "google" : "osm";
  return {
    stores,
    meta: {
      source,
      locationLabel,
      googleCount: googleStores.length,
      osmCount: osmStores.length,
      googleEnriched: googleStores.length > 0
    }
  };
}

// scripts/api-entries/record-locator/places.entry.ts
var ROUTE = "api/record-locator/places";
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
    const result = await handleNearbyRecordStores(resolveRecordLocatorApiKey(), input, {
      fetchFn: resolveRecordLocatorFetch()
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
