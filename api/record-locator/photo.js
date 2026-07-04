// Bundled for Vercel — edit scripts/api-entries/record-locator/photo.entry.ts and npm run build

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

// features/record-locator/server/photoHandler.ts
var PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#1a1a1e"/>
  <circle cx="200" cy="130" r="48" fill="#2a2a32" stroke="#5eb8ad" stroke-width="3"/>
  <circle cx="200" cy="130" r="16" fill="#5eb8ad"/>
  <text x="200" y="220" text-anchor="middle" fill="#a8a6a0" font-family="system-ui,sans-serif" font-size="16">Record shop</text>
</svg>`;
var RecordLocatorPhotoError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "RecordLocatorPhotoError";
  }
};
function parsePhotoNameParam(value) {
  const name = value?.trim();
  if (!name) {
    throw new RecordLocatorPhotoError("Photo name is required");
  }
  if (!name.startsWith("places/")) {
    throw new RecordLocatorPhotoError("Invalid photo reference");
  }
  return name;
}
async function resolvePlacePhoto(apiKey, photoName, fetchFn) {
  if (!apiKey?.trim()) {
    return {
      kind: "svg",
      body: PLACEHOLDER_SVG,
      contentType: "image/svg+xml"
    };
  }
  const mediaUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
  mediaUrl.searchParams.set("maxHeightPx", "480");
  mediaUrl.searchParams.set("maxWidthPx", "640");
  mediaUrl.searchParams.set("skipHttpRedirect", "true");
  const response = await fetchFn(mediaUrl.toString(), {
    headers: { "X-Goog-Api-Key": apiKey }
  });
  if (!response.ok) {
    throw new RecordLocatorPhotoError(`Google photo lookup failed (${response.status})`);
  }
  const payload = await response.json();
  if (!payload.photoUri) {
    throw new RecordLocatorPhotoError("Google photo lookup returned no image");
  }
  return { kind: "redirect", location: payload.photoUri };
}

// scripts/api-entries/record-locator/photo.entry.ts
var ROUTE = "api/record-locator/photo";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    const photoName = parsePhotoNameParam(
      typeof req.query.n === "string" ? req.query.n : void 0
    );
    const result = await resolvePlacePhoto(resolveRecordLocatorApiKey(), photoName, resolveRecordLocatorFetch());
    if (result.kind === "redirect") {
      res.setHeader("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
      res.redirect(302, result.location);
      return;
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.status(200).send(result.body);
  } catch (error) {
    if (error instanceof RecordLocatorPhotoError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : "Photo lookup failed";
    const status = message.includes("not configured") ? 503 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}
export {
  handler as default
};
