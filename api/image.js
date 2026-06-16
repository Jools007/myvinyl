// Bundled for Vercel — edit scripts/api-entries/image.entry.ts and npm run build

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

// server/discogs-cover.ts
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

// server/handlers/image-proxy.ts
function parseImageProxyUrl(urlParam) {
  if (!urlParam?.trim()) return void 0;
  try {
    return resolveDiscogsCoverUrl(decodeURIComponent(urlParam.trim()));
  } catch {
    return resolveDiscogsCoverUrl(urlParam.trim());
  }
}
async function fetchProxiedImage(url, opts) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    Referer: "https://www.discogs.com/"
  };
  if (opts?.discogsToken) {
    headers.Authorization = `Discogs token=${opts.discogsToken}`;
  }
  const response = await fetch(url, {
    headers,
    redirect: "follow"
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  if (!contentType.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) return null;
  return { buffer, contentType };
}

// scripts/api-entries/image.entry.ts
async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  const rawUrl = typeof req.query.url === "string" ? req.query.url : void 0;
  const imageUrl = parseImageProxyUrl(rawUrl);
  if (!imageUrl) {
    return res.status(400).json({ error: "Valid image url required" });
  }
  try {
    const { discogsToken } = getApiEnv();
    const result = await fetchProxiedImage(imageUrl, { discogsToken });
    if (!result) {
      return res.status(404).json({ error: "Image not found" });
    }
    res.setHeader("Content-Type", result.contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Image proxy failed";
    return res.status(502).json({ error: message });
  }
}
export {
  handler as default
};
