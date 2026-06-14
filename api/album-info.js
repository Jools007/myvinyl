// Bundled for Vercel — edit scripts/api-entries/album-info.entry.ts and npm run build

// api/_lib/discogs/barcode.ts
function digitsOnly(raw) {
  return raw.replace(/\D/g, "");
}
function formatUpcAForDiscogs(digits) {
  if (digits.length !== 12) return null;
  return `${digits[0]} ${digits.slice(1, 6)} ${digits.slice(6, 11)} ${digits[11]}`;
}
function barcodeLookupVariants(raw) {
  const trimmed = raw.trim();
  const digits = digitsOnly(trimmed);
  const variants = [];
  const push = (value) => {
    const v = value.trim();
    if (v && !variants.includes(v)) variants.push(v);
  };
  if (trimmed) push(trimmed);
  if (digits) push(digits);
  if (digits.length === 12) {
    push(`0${digits}`);
    const spaced = formatUpcAForDiscogs(digits);
    if (spaced) push(spaced);
  }
  if (digits.length === 13 && digits.startsWith("0")) {
    push(digits.slice(1));
    const inner = digits.slice(1);
    if (inner.length === 12) {
      const spaced = formatUpcAForDiscogs(inner);
      if (spaced) push(spaced);
    }
  }
  if (digits.length === 8) push(digits);
  return variants;
}

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
function headers(token) {
  return {
    "User-Agent": "MyVinyl/1.0 +https://myvinyl.app",
    Accept: "application/vnd.discogs.v2.discogs+json",
    Authorization: `Discogs token=${token}`
  };
}
async function searchDiscogs(token, q, page = 1, perPage = 24) {
  const params = new URLSearchParams({
    q,
    type: "release",
    page: String(page),
    per_page: String(perPage)
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: headers(token)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs search failed: ${res.status} ${text}`);
  }
  return res.json();
}
async function searchDiscogsByBarcodeOnce(token, barcode, perPage) {
  const params = new URLSearchParams({
    barcode,
    type: "release",
    per_page: String(perPage)
  });
  const res = await fetch(`${DISCOGS_API}/database/search?${params}`, {
    headers: headers(token)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs barcode search failed: ${res.status} ${text}`);
  }
  return res.json();
}
async function searchDiscogsByBarcode(token, barcode, perPage = 5) {
  const variants = barcodeLookupVariants(barcode);
  let last = { results: [] };
  for (const variant of variants) {
    const data = await searchDiscogsByBarcodeOnce(token, variant, perPage);
    last = data;
    if ((data.results?.length ?? 0) > 0) return data;
  }
  return last;
}
function parseSearchResult(item) {
  const title = String(item.title || "");
  const parts = title.split(" - ");
  const artist = parts.length > 1 ? parts[0] : String(item.artist || "Unknown");
  const albumTitle = parts.length > 1 ? parts.slice(1).join(" - ") : title;
  return {
    id: Number(item.id),
    type: String(item.type),
    title: albumTitle,
    artist,
    year: item.year ? String(item.year) : void 0,
    thumb: resolveDiscogsCoverUrl(String(item.thumb || item.cover_image || "")) ?? "",
    cover: resolveDiscogsCoverUrl(
      item.cover_image ? String(item.cover_image) : item.thumb ? String(item.thumb) : void 0
    ),
    format: Array.isArray(item.format) ? item.format : void 0,
    genre: Array.isArray(item.genre) ? item.genre : void 0,
    style: Array.isArray(item.style) ? item.style : void 0,
    label: Array.isArray(item.label) ? item.label : void 0,
    country: item.country ? String(item.country) : void 0,
    resource_url: String(item.resource_url || `https://www.discogs.com/release/${item.id}`)
  };
}

// api/_lib/discogs/handlers.ts
async function handleDiscogsSearch(token, opts) {
  const perPage = opts.perPage ?? (opts.barcode ? 5 : 16);
  const data = opts.barcode?.trim() ? await searchDiscogsByBarcode(token, opts.barcode.trim(), perPage) : await searchDiscogs(token, opts.q?.trim() ?? "", 1, perPage);
  return (data.results ?? []).map(parseSearchResult);
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

// server/enrich-timeout.ts
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

// server/lastfm.ts
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
async function getAlbumInfo(apiKey, artist, album) {
  const params = new URLSearchParams({
    method: "album.getInfo",
    artist,
    album
  });
  const data = await lastFmFetch(apiKey, params);
  const info = data.album;
  if (!info) return null;
  const wiki = info.wiki;
  const wikiText = wiki?.summary?.replace(/<[^>]+>/g, " ").trim() || wiki?.content?.replace(/<[^>]+>/g, " ").trim() || "";
  const tags = info.tags?.tag;
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const tagNames = tagList.filter((t) => t?.name).map((t) => t.name);
  return {
    name: typeof info.name === "string" ? info.name : album,
    artist: typeof info.artist === "string" ? info.artist : artist,
    wikiText,
    tags: tagNames,
    image: pickImage(info.image)
  };
}

// server/handlers/album-info.ts
var AlbumInfoValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AlbumInfoValidationError";
  }
};
function parseAlbumInfoQuery(query) {
  const pick = (key) => {
    const value = query[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };
  const artist = pick("artist")?.trim() ?? "";
  const album = pick("album")?.trim() ?? "";
  if (!artist || !album) {
    throw new AlbumInfoValidationError("artist and album required");
  }
  return {
    artist,
    album,
    discogsNotes: pick("discogsNotes")?.trim() || void 0
  };
}
async function handleAlbumInfo(input, env) {
  let description = input.discogsNotes?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() ?? "";
  if (env.lastfmKey) {
    try {
      const info = await withTimeout(
        getAlbumInfo(env.lastfmKey, input.artist, input.album),
        6e3,
        null
      );
      const wiki = info?.wikiText?.replace(/\s+/g, " ").trim();
      if (wiki && wiki.length > (description?.length ?? 0)) {
        description = wiki;
      }
    } catch (error) {
      console.error(
        "[handleAlbumInfo] Last.fm lookup failed:",
        error instanceof Error ? error.message : error
      );
    }
  }
  if (description.length > 520) {
    description = `${description.slice(0, 517).trim()}\u2026`;
  }
  return { description: description || null };
}

// scripts/api-entries/album-info.entry.ts
var ROUTE = "api/album-info";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  const query = queryRecord(req.query);
  const q = typeof query.q === "string" ? query.q : void 0;
  const barcode = typeof query.barcode === "string" ? query.barcode : void 0;
  if (q?.trim() || barcode?.trim()) {
    const { discogsToken } = getApiEnv();
    if (!discogsToken) {
      return json(res, ROUTE, 503, { error: "DISCOGS_TOKEN not configured" });
    }
    const perPageRaw = typeof query.per_page === "string" ? query.per_page : "16";
    const perPage = Math.min(50, Math.max(1, parseInt(perPageRaw, 10) || 16));
    try {
      const results = await handleDiscogsSearch(discogsToken, { q, barcode, perPage });
      return json(res, ROUTE, 200, { results });
    } catch (error) {
      logApiError(ROUTE, error, { q, barcode });
      const message = error instanceof Error ? error.message : "Discogs search failed";
      const status = message.includes("rate limit") ? 429 : 502;
      return json(res, ROUTE, status, { error: message });
    }
  }
  try {
    const input = parseAlbumInfoQuery(req.query);
    const { lastfmKey } = getApiEnv();
    const result = await handleAlbumInfo(input, { lastfmKey });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof AlbumInfoValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : "Album info failed";
    return json(res, ROUTE, 502, { error: message });
  }
}
export {
  handler as default
};
