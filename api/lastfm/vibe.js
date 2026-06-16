// Bundled for Vercel — edit scripts/api-entries/lastfm/vibe.entry.ts and npm run build

// api/_lib/lastfm.ts
var LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
function pickImage(images) {
  if (!images?.length) return void 0;
  const sorted = [...images].filter((i) => i["#text"]?.trim());
  const large = sorted.find((i) => i.size === "extralarge" || i.size === "large");
  return (large || sorted[sorted.length - 1])?.["#text"];
}
async function lastFmFetch(apiKey, params) {
  params.set("api_key", apiKey);
  params.set("format", "json");
  const res = await fetch(`${LASTFM_API}?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.message || `Last.fm error ${data.error}`);
  if (!res.ok) throw new Error(`Last.fm request failed: ${res.status}`);
  return data;
}
async function getTopTracksByTag(apiKey, tag, limit = 15) {
  const params = new URLSearchParams({
    method: "tag.gettoptracks",
    tag,
    limit: String(limit)
  });
  const data = await lastFmFetch(apiKey, params);
  const tracks = data.tracks?.track;
  if (!tracks) return [];
  const list = Array.isArray(tracks) ? tracks : [tracks];
  return list.filter((t) => t?.name).map(
    (t) => ({
      name: t.name,
      artist: t.artist?.name ?? "",
      url: t.url,
      image: pickImage(t.image)
    })
  );
}

// api/_lib/env.ts
function readEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function readDiscogsOAuth() {
  const consumerKey = readEnv("DISCOGS_CONSUMER_KEY");
  const consumerSecret = readEnv("DISCOGS_CONSUMER_SECRET");
  if (!consumerKey || !consumerSecret) return void 0;
  return {
    consumerKey,
    consumerSecret,
    accessToken: readEnv("DISCOGS_OAUTH_ACCESS_TOKEN"),
    accessTokenSecret: readEnv("DISCOGS_OAUTH_ACCESS_TOKEN_SECRET")
  };
}
function getApiEnv() {
  return {
    discogsToken: readEnv("DISCOGS_TOKEN"),
    discogsOAuth: readDiscogsOAuth(),
    spotifyId: readEnv("SPOTIFY_CLIENT_ID"),
    spotifySecret: readEnv("SPOTIFY_CLIENT_SECRET"),
    lastfmKey: readEnv("LASTFM_API_KEY"),
    youtubeApiKey: readEnv("YOUTUBE_API_KEY")
  };
}
function logApiEnvStatus(route) {
  const env = getApiEnv();
  console.error(`[${route}] env configured:`, {
    DISCOGS_TOKEN: Boolean(env.discogsToken),
    DISCOGS_CONSUMER_KEY: Boolean(env.discogsOAuth?.consumerKey),
    DISCOGS_CONSUMER_SECRET: Boolean(env.discogsOAuth?.consumerSecret),
    DISCOGS_OAUTH_ACCESS_TOKEN: Boolean(env.discogsOAuth?.accessToken),
    SPOTIFY_CLIENT_ID: Boolean(env.spotifyId),
    SPOTIFY_CLIENT_SECRET: Boolean(env.spotifySecret),
    LASTFM_API_KEY: Boolean(env.lastfmKey),
    YOUTUBE_API_KEY: Boolean(env.youtubeApiKey)
  });
}

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

// api/_lib/request.ts
function queryRecord(query) {
  if (!query || typeof query !== "object") {
    return {};
  }
  return query;
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

// scripts/api-entries/lastfm/vibe.entry.ts
var ROUTE = "api/lastfm/vibe";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const { lastfmKey } = getApiEnv();
    if (!lastfmKey) {
      return json(res, ROUTE, 503, { error: "LASTFM_API_KEY not configured" });
    }
    const query = queryRecord(req.query);
    const tag = typeof query.tag === "string" ? query.tag.trim() : "";
    if (!tag) {
      return json(res, ROUTE, 400, { error: "tag required" });
    }
    const tracks = await getTopTracksByTag(lastfmKey, tag, 20);
    return json(res, ROUTE, 200, { tracks });
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : "Last.fm vibe failed";
    return json(res, ROUTE, 500, { error: message });
  }
}
export {
  handler as default
};
