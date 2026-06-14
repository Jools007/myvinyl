// Bundled for Vercel — edit scripts/api-entries/discogs/price-suggestions.entry.ts and npm run build

// api/_lib/discogs/oauth.ts
import crypto from "crypto";
function percentEncode(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
function signingKey(consumerSecret, tokenSecret = "") {
  return `${percentEncode(consumerSecret)}&${percentEncode(tokenSecret)}`;
}
function signDiscogsOAuthRequest(opts) {
  const timestamp = String(Math.floor(Date.now() / 1e3));
  const nonce = crypto.randomBytes(16).toString("hex");
  const oauthParams = {
    oauth_consumer_key: opts.credentials.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp,
    oauth_version: "1.0"
  };
  if (opts.credentials.accessToken) {
    oauthParams.oauth_token = opts.credentials.accessToken;
  }
  const allParams = { ...oauthParams, ...opts.queryParams ?? {} };
  const paramString = Object.keys(allParams).sort().map((key) => `${percentEncode(key)}=${percentEncode(allParams[key])}`).join("&");
  const baseUrl = opts.url.split("?")[0];
  const signatureBase = [
    opts.method.toUpperCase(),
    percentEncode(baseUrl),
    percentEncode(paramString)
  ].join("&");
  const signature = crypto.createHmac("sha1", signingKey(opts.credentials.consumerSecret, opts.credentials.accessTokenSecret)).update(signatureBase).digest("base64");
  return { ...oauthParams, oauth_signature: signature };
}
function buildOAuthAuthorizationHeader(params) {
  const header = Object.keys(params).sort().map((key) => `${percentEncode(key)}="${percentEncode(params[key])}"`).join(", ");
  return `OAuth ${header}`;
}
function buildSignedGetHeaders(url, credentials) {
  const oauthParams = signDiscogsOAuthRequest({
    method: "GET",
    url,
    credentials
  });
  return {
    "User-Agent": "MyVinyl/1.0 +https://myvinyl.app",
    Accept: "application/vnd.discogs.v2.discogs+json",
    Authorization: buildOAuthAuthorizationHeader(oauthParams)
  };
}

// api/_lib/discogs/priceSuggestions.ts
var DISCOGS_API = "https://api.discogs.com";
function parsePriceEntry(raw) {
  if (raw == null) return null;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return { currency: "USD", value: raw };
  }
  if (typeof raw !== "object") return null;
  const row = raw;
  if (typeof row.value !== "number" || !Number.isFinite(row.value)) return null;
  return {
    currency: typeof row.currency === "string" && row.currency.trim() ? row.currency : "USD",
    value: row.value
  };
}
function discogsErrorMessage(status, text) {
  try {
    const json2 = JSON.parse(text);
    const detail = json2.message ?? json2.error;
    if (detail) return detail;
  } catch {
  }
  return text.trim() || `Discogs request failed (${status})`;
}
function normalizePriceSuggestions(payload) {
  if (!payload || typeof payload !== "object") return {};
  const out = {};
  for (const [condition, raw] of Object.entries(payload)) {
    const parsed = parsePriceEntry(raw);
    if (parsed) out[condition] = parsed;
  }
  return out;
}
async function fetchDiscogsPriceSuggestions(releaseId, auth) {
  const url = `${DISCOGS_API}/marketplace/price_suggestions/${releaseId}`;
  const attempts = [];
  if (auth.oauth?.consumerKey && auth.oauth.consumerSecret) {
    attempts.push({
      label: "oauth",
      headers: buildSignedGetHeaders(url, auth.oauth)
    });
  }
  if (auth.token) {
    attempts.push({
      label: "token",
      headers: {
        "User-Agent": "MyVinyl/1.0 +https://myvinyl.app",
        Accept: "application/vnd.discogs.v2.discogs+json",
        Authorization: `Discogs token=${auth.token}`
      }
    });
  }
  if (attempts.length === 0) {
    throw new Error("Discogs credentials not configured");
  }
  let lastError = "Discogs price suggestions failed";
  let saw404 = false;
  for (const attempt of attempts) {
    const res = await fetch(url, { headers: attempt.headers });
    if (res.ok) {
      const data = await res.json();
      return normalizePriceSuggestions(data);
    }
    const text = await res.text();
    lastError = discogsErrorMessage(res.status, text);
    if (res.status === 401 || res.status === 403 || res.status === 404) {
      if (res.status === 404) saw404 = true;
      continue;
    }
    if (res.status === 429) {
      throw new Error("Discogs rate limit \u2014 try again shortly");
    }
    throw new Error(lastError);
  }
  if (saw404 && /seller settings/i.test(lastError)) {
    throw new Error(lastError);
  }
  if (saw404) {
    throw new Error("No marketplace price data for this release");
  }
  throw new Error(lastError);
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

// scripts/api-entries/discogs/price-suggestions.entry.ts
var ROUTE = "api/discogs/price-suggestions";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const env = getApiEnv();
    if (!env.discogsOAuth && !env.discogsToken) {
      return json(res, ROUTE, 503, {
        error: "Discogs OAuth not configured (DISCOGS_CONSUMER_KEY / DISCOGS_CONSUMER_SECRET)"
      });
    }
    const query = queryRecord(req.query);
    const releaseIdRaw = typeof query.releaseId === "string" ? query.releaseId : typeof query.release_id === "string" ? query.release_id : "";
    const releaseId = parseInt(releaseIdRaw, 10);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return json(res, ROUTE, 400, { error: "Valid releaseId required" });
    }
    const suggestions = await fetchDiscogsPriceSuggestions(releaseId, {
      oauth: env.discogsOAuth,
      token: env.discogsToken
    });
    return json(res, ROUTE, 200, {
      releaseId,
      suggestions,
      currency: Object.values(suggestions)[0]?.currency ?? "USD"
    });
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : "Price suggestions failed";
    const status = message.includes("rate limit") ? 429 : message.includes("not found") ? 404 : message.includes("not configured") ? 503 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}
export {
  handler as default
};
