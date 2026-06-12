// Bundled for Vercel — edit scripts/api-entries/discogs/collection.entry.ts and npm run build

// api/_lib/discogs/cover.ts
var DISCOGS_IMAGE_HOSTS = /* @__PURE__ */ new Set(["i.discogs.com", "img.discogs.com"]);
var PROXY_IMAGE_PATH = /\/api\/image\b/i;
function decodeUrlSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
function extractNestedUrl(value) {
  const queryMatch = value.match(/[?&]url=([^&]+)/i);
  if (!queryMatch?.[1]) return void 0;
  const nested = decodeUrlSafe(queryMatch[1]).trim();
  return nested && nested !== value ? nested : void 0;
}
function unwrapNestedImageUrl(value) {
  let current = value.trim();
  for (let i = 0; i < 5; i += 1) {
    if (PROXY_IMAGE_PATH.test(current)) {
      const nested2 = extractNestedUrl(current);
      if (nested2) {
        current = nested2;
        continue;
      }
    }
    if (current.startsWith("/") && current.includes("url=")) {
      try {
        const parsed = new URL(current, "https://myvinyl.app");
        const nested2 = parsed.searchParams.get("url");
        if (nested2?.trim()) {
          current = decodeUrlSafe(nested2.trim());
          continue;
        }
      } catch {
        break;
      }
    }
    const nested = extractNestedUrl(current);
    if (nested) {
      current = nested;
      continue;
    }
    break;
  }
  return current;
}
function normalizeProtocol(value) {
  let normalized = value;
  if (normalized.startsWith("//")) normalized = `https:${normalized}`;
  if (normalized.startsWith("http://")) normalized = `https://${normalized.slice(7)}`;
  return normalized;
}
function isDiscogsImageCdnUrl(value) {
  try {
    const { hostname, pathname, protocol } = new URL(value);
    if (protocol !== "https:") return false;
    const host = hostname.toLowerCase();
    if (DISCOGS_IMAGE_HOSTS.has(host)) return true;
    return host.endsWith(".discogs.com") && /\/RKF-[A-Za-z0-9_-]+/i.test(pathname);
  } catch {
    return false;
  }
}
function looksLikeDirectImageUrl(value) {
  return /\.(jpe?g|png|gif|webp|avif)(\?|$)/i.test(value) || /\/image\.(jpe?g|png|gif|webp)/i.test(value);
}
function resolveDiscogsCoverUrl(url) {
  if (!url?.trim()) return void 0;
  const value = normalizeProtocol(unwrapNestedImageUrl(url.trim()));
  if (!value.startsWith("https://")) return void 0;
  if (isDiscogsImageCdnUrl(value)) return value;
  if (/discogs\.com/i.test(value)) return void 0;
  if (looksLikeDirectImageUrl(value)) return value;
  return void 0;
}

// api/_lib/discogs/client.ts
var DISCOGS_API = "https://api.discogs.com";
var COLLECTION_FOLDER_ALL = 0;
function headers(token) {
  return {
    "User-Agent": "MyVinyl/1.0 +https://myvinyl.app",
    Accept: "application/vnd.discogs.v2.discogs+json",
    Authorization: `Discogs token=${token}`
  };
}
function formatStringsFromDiscogs(formats) {
  if (!formats?.length) return [];
  return formats.map(
    (f) => [f.name, ...f.descriptions ?? []].filter(Boolean).join(" ").trim()
  );
}
function isCdOnlyDiscogsFormats(formats) {
  const strings = formatStringsFromDiscogs(formats);
  if (!strings.length) return false;
  return strings.every((s) => /\bCD\b/i.test(s));
}
function pickVinylFormatLabel(formats) {
  const strings = formatStringsFromDiscogs(formats);
  const vinylish = strings.find((s) => !/\bCD\b/i.test(s));
  const primary = vinylish ?? strings[0] ?? "LP";
  const upper = primary.toUpperCase();
  if (upper.includes("12") && upper.includes("SINGLE")) return '12" Single';
  if (upper.includes("7") && upper.includes("SINGLE")) return '7" Single';
  if (upper.includes('10"')) return '10"';
  if (upper.includes("EP")) return "EP";
  if (upper.includes("COMP")) return "Compilation";
  if (upper.includes("LP") || upper.includes("VINYL")) return "LP";
  return primary.split(",")[0]?.trim() || "LP";
}
function parseCollectionRelease(item) {
  const info = item.basic_information;
  const artist = info.artists?.map((a) => a.name).join(", ") || info.title?.split(" - ")[0]?.trim() || "Unknown";
  return {
    discogsId: info.id,
    artist,
    title: info.title?.trim() || "Untitled",
    year: info.year ? String(info.year) : void 0,
    format: pickVinylFormatLabel(info.formats),
    isCdOnly: isCdOnlyDiscogsFormats(info.formats),
    coverUrl: resolveDiscogsCoverUrl(info.cover_image) ?? resolveDiscogsCoverUrl(info.thumb),
    genres: [.../* @__PURE__ */ new Set([...info.genres ?? [], ...info.styles ?? []])].slice(0, 12)
  };
}
async function getUserCollectionPage(token, username, page = 1, perPage = 100) {
  const user = encodeURIComponent(username.trim());
  const params = new URLSearchParams({
    page: String(page),
    per_page: String(Math.min(100, Math.max(1, perPage)))
  });
  const res = await fetch(
    `${DISCOGS_API}/users/${user}/collection/folders/${COLLECTION_FOLDER_ALL}/releases?${params}`,
    { headers: headers(token) }
  );
  if (res.status === 404) {
    throw new Error("Discogs user not found. Check the username and try again.");
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs collection failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    releases: data.releases ?? [],
    pagination: data.pagination ?? { page: 1, pages: 1, per_page: perPage, items: 0 }
  };
}

// api/_lib/discogs/handlers.ts
async function handleDiscogsCollectionPage(token, username, page, perPage) {
  const data = await getUserCollectionPage(token, username, page, perPage);
  return {
    releases: (data.releases ?? []).map(parseCollectionRelease),
    pagination: data.pagination ?? { page: 1, pages: 1, per_page: perPage, items: 0 }
  };
}

// api/_lib/env.ts
function readEnv(key) {
  const value = process.env[key];
  if (typeof value !== "string") return void 0;
  const trimmed = value.trim();
  return trimmed || void 0;
}
function getApiEnv() {
  return {
    discogsToken: readEnv("DISCOGS_TOKEN"),
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

// scripts/api-entries/discogs/collection.entry.ts
var ROUTE = "api/discogs/collection";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const { discogsToken } = getApiEnv();
    if (!discogsToken) {
      return json(res, ROUTE, 503, { error: "DISCOGS_TOKEN not configured" });
    }
    const query = queryRecord(req.query);
    const username = typeof query.username === "string" ? query.username.trim() : "";
    if (!username) {
      return json(res, ROUTE, 400, { error: "username required" });
    }
    const pageRaw = typeof query.page === "string" ? query.page : "1";
    const perPageRaw = typeof query.per_page === "string" ? query.per_page : "100";
    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(perPageRaw, 10) || 100));
    const payload = await handleDiscogsCollectionPage(discogsToken, username, page, perPage);
    return json(res, ROUTE, 200, payload);
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : "Discogs collection failed";
    const status = message.includes("not found") ? 404 : message.includes("rate limit") ? 429 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}
export {
  handler as default
};
