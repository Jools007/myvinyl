// Bundled for Vercel — edit scripts/api-entries/spotify/audio.entry.ts and npm run build

// api/_lib/play-audio/track-title.ts
function normalizeTrackTitle(title) {
  return title.trim().replace(/^[A-Za-z]{1,2}\d+[.:\s-]+/i, "").replace(/^\d+[.:\s-]+/, "").replace(/^\d+\.?\s*/, "").replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ").replace(/\s+/g, " ").trim();
}

// api/_lib/play-audio/track-match.ts
var VARIANT_MARKERS = /\b(remix|rework|re-?edit|mix|version|live|acoustic|instrumental|karaoke|demo|radio\s*edit|extended|club|dub|mashup|bootleg|cover|tribute|ringtone)\b/i;
var VARIANT_MARKERS_STRICT = /\b(remix|rework|re-?edit|extended\s+mix|club\s+mix|live|acoustic|instrumental|karaoke|demo|radio\s*edit|dub\s+mix|mashup|bootleg)\b/i;
function normalizeForMatch(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ").replace(/feat\.?.*$/i, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function strictTitleEquals(wantedTitle, candidateTitle) {
  const want = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const got = normalizeForMatch(normalizeTrackTitle(candidateTitle));
  return Boolean(want && got && want === got && !isExtraVariant(wantedTitle, candidateTitle));
}
function strictArtistEquals(wantedArtist, candidateArtist) {
  const want = normalizeForMatch(wantedArtist.split(",")[0]);
  const got = normalizeForMatch(candidateArtist.split(",")[0]);
  return Boolean(want && got && want === got);
}
function strictAlbumEquals(wantedAlbum, candidateAlbum) {
  const want = normalizeForMatch(wantedAlbum);
  const got = normalizeForMatch(candidateAlbum);
  return Boolean(want && got && want === got);
}
function strictCatalogTrackMatch(catalog, spotify) {
  if (!strictTitleEquals(catalog.title, spotify.title)) return false;
  if (!strictArtistEquals(catalog.artist, spotify.artist)) return false;
  if (!strictAlbumEquals(catalog.album, spotify.album)) return false;
  if (catalog.trackNumber != null && spotify.trackNumber != null && catalog.trackNumber !== spotify.trackNumber) {
    return false;
  }
  return true;
}
function isExtraVariant(wantedTitle, candidateTitle) {
  const wantNorm = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const gotNorm = normalizeForMatch(candidateTitle);
  if (!wantNorm || !gotNorm) return true;
  const wantHasVariant = VARIANT_MARKERS.test(wantedTitle);
  const gotHasVariant = VARIANT_MARKERS_STRICT.test(candidateTitle);
  if (gotHasVariant && !wantHasVariant) return true;
  if (gotNorm.length > wantNorm.length * 1.45 && gotNorm.includes(wantNorm)) return true;
  return false;
}

// api/_lib/play-audio/spotify.ts
var cachedToken = null;
var rateLimitedUntil = 0;
var lastSpotifyRequestAt = 0;
var SPOTIFY_MIN_INTERVAL_MS = 400;
var SPOTIFY_MAX_RETRIES = 0;
var SPOTIFY_PREVIEW_MAX_RETRIES = 2;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}
function isSpotifyRateLimited() {
  return isRateLimited();
}
function getSpotifyRateLimitRetrySec() {
  return Math.max(0, Math.ceil((rateLimitedUntil - Date.now()) / 1e3));
}
function markRateLimited(retryAfterSec) {
  rateLimitedUntil = Date.now() + Math.min(retryAfterSec, 8) * 1e3;
}
async function getAccessToken(clientId, clientSecret) {
  if (isRateLimited()) {
    if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
    return null;
  }
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.token;
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: "grant_type=client_credentials"
  });
  if (!res.ok) return null;
  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expires: Date.now() + (data.expires_in - 60) * 1e3
  };
  return cachedToken.token;
}
async function spotifyFetch(url, token, retries = SPOTIFY_MAX_RETRIES) {
  const gap = Date.now() - lastSpotifyRequestAt;
  if (gap < SPOTIFY_MIN_INTERVAL_MS) {
    await sleep(SPOTIFY_MIN_INTERVAL_MS - gap);
  }
  lastSpotifyRequestAt = Date.now();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 429) {
    const waitSec = parseInt(res.headers.get("retry-after") || "2", 10);
    markRateLimited(waitSec);
    if (retries > 0) {
      await sleep(Math.min(waitSec, 3) * 1e3 + 200);
      return spotifyFetch(url, token, retries - 1);
    }
    return res;
  }
  if (res.ok) rateLimitedUntil = 0;
  return res;
}
async function searchTracks(clientId, clientSecret, q, limit = 5, fetchRetries = SPOTIFY_MAX_RETRIES) {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`,
    token,
    fetchRetries
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.tracks?.items ?? [];
}
function spotifyTrackArtist(t) {
  return t.artists?.[0]?.name ?? "";
}
function trackToPreviewAudio(t, albumName) {
  return {
    spotifyTrackId: t.id,
    spotifyTrackName: t.name,
    albumName: albumName ?? t.album?.name,
    previewUrl: t.preview_url,
    spotifyUrl: t.external_urls?.spotify
  };
}
function catalogFromArgs(artist, title, album, trackNumber) {
  return {
    artist: artist.trim(),
    title: title.trim(),
    album: album.trim(),
    trackNumber
  };
}
function spotifyCandidateFromTrack(t, albumName) {
  return {
    title: t.name,
    artist: spotifyTrackArtist(t),
    album: albumName,
    trackNumber: t.track_number
  };
}
async function fetchSpotifyTrackById(clientId, clientSecret, trackId, catalog, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`,
    token,
    fetchRetries
  );
  if (!res.ok) return null;
  const t = await res.json();
  const albumName = t.album?.name ?? catalog?.album ?? "";
  if (catalog && !strictCatalogTrackMatch(catalog, spotifyCandidateFromTrack(t, albumName))) {
    return null;
  }
  if (!t.preview_url) return null;
  return trackToPreviewAudio(t, albumName);
}
async function findExactSpotifyAlbumId(clientId, clientSecret, catalog, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return void 0;
  const q = `album:"${catalog.album}" artist:"${catalog.artist}"`;
  const res = await spotifyFetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=20`,
    token,
    fetchRetries
  );
  if (!res.ok) return void 0;
  const data = await res.json();
  for (const album of data.albums?.items ?? []) {
    const albumArtist = album.artists?.[0]?.name ?? "";
    if (strictAlbumEquals(catalog.album, album.name) && strictArtistEquals(catalog.artist, albumArtist)) {
      return album.id;
    }
  }
  return void 0;
}
async function fetchSpotifyAlbumTracks(token, albumId, fetchRetries) {
  const tracks = [];
  let offset = 0;
  while (offset < 200) {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/albums/${albumId}/tracks?limit=50&offset=${offset}`,
      token,
      fetchRetries
    );
    if (!res.ok) break;
    const page = await res.json();
    tracks.push(...page.items ?? []);
    offset += 50;
    if (!page.items?.length || offset >= (page.total ?? 0)) break;
  }
  return tracks;
}
async function findExactPreviewViaTrackSearch(clientId, clientSecret, catalog, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  const q = `track:"${catalog.title}" artist:"${catalog.artist}" album:"${catalog.album}"`;
  const items = await searchTracks(clientId, clientSecret, q, 20, fetchRetries);
  for (const t of items) {
    if (!t.id || !t.preview_url) continue;
    if (!strictCatalogTrackMatch(
      catalog,
      spotifyCandidateFromTrack(t, t.album?.name ?? catalog.album)
    )) {
      continue;
    }
    return trackToPreviewAudio(t);
  }
  return null;
}
async function findExactPreviewViaAlbum(clientId, clientSecret, catalog, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  const albumId = await findExactSpotifyAlbumId(clientId, clientSecret, catalog, fetchRetries);
  if (!albumId) return null;
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;
  const tracks = await fetchSpotifyAlbumTracks(token, albumId, fetchRetries);
  for (const t of tracks) {
    if (!t.id || !t.preview_url) continue;
    if (!strictTitleEquals(catalog.title, t.name)) continue;
    if (!strictArtistEquals(catalog.artist, spotifyTrackArtist(t))) continue;
    if (catalog.trackNumber != null && t.track_number != null && catalog.trackNumber !== t.track_number) {
      continue;
    }
    return trackToPreviewAudio(t, catalog.album);
  }
  return null;
}
async function resolveTrackPreview(clientId, clientSecret, artist, title, albumTitle, opts) {
  const fetchRetries = opts?.fetchRetries ?? SPOTIFY_PREVIEW_MAX_RETRIES;
  if (isRateLimited() && fetchRetries <= 0) return null;
  const album = albumTitle.trim();
  if (!artist.trim() || !title.trim() || !album) return null;
  const catalog = catalogFromArgs(artist, title, album, opts?.albumIndex);
  if (opts?.spotifyTrackId?.trim()) {
    const cached = await fetchSpotifyTrackById(
      clientId,
      clientSecret,
      opts.spotifyTrackId.trim(),
      catalog,
      fetchRetries
    );
    if (cached?.previewUrl) return cached;
  }
  const fromSearch = await findExactPreviewViaTrackSearch(
    clientId,
    clientSecret,
    catalog,
    fetchRetries
  );
  if (fromSearch?.previewUrl) return fromSearch;
  return findExactPreviewViaAlbum(clientId, clientSecret, catalog, fetchRetries);
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

// scripts/api-entries/spotify/audio.entry.ts
var ROUTE = "api/spotify/audio";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const { spotifyId, spotifySecret } = getApiEnv();
    if (!spotifyId || !spotifySecret) {
      return json(res, ROUTE, 503, { error: "Spotify credentials not configured" });
    }
    const query = queryRecord(req.query);
    const artist = typeof query.artist === "string" ? query.artist.trim() : "";
    const title = (typeof query.title === "string" ? query.title : typeof query.album === "string" ? query.album : "").trim();
    const album = typeof query.album === "string" ? query.album.trim() : "";
    if (!artist || !title) {
      return json(res, ROUTE, 400, { error: "artist and title required" });
    }
    if (!album) {
      return json(res, ROUTE, 400, {
        error: "album is required \u2014 use the release title from the collection"
      });
    }
    const albumIndexRaw = typeof query.albumIndex === "string" ? query.albumIndex : void 0;
    const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : void 0;
    const spotifyTrackId = typeof query.spotifyTrackId === "string" ? query.spotifyTrackId.trim() : void 0;
    const audio = await resolveTrackPreview(
      spotifyId,
      spotifySecret,
      artist,
      title,
      album,
      {
        fetchRetries: 2,
        spotifyTrackId: spotifyTrackId || void 0,
        albumIndex: albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0 ? albumIndex : void 0
      }
    );
    if (!audio?.previewUrl) {
      if (isSpotifyRateLimited()) {
        return json(res, ROUTE, 503, {
          error: "Spotify is temporarily rate-limited \u2014 try again in a few seconds",
          retryAfterSec: getSpotifyRateLimitRetrySec()
        });
      }
      return json(res, ROUTE, 404, { error: "No Spotify preview found" });
    }
    return json(res, ROUTE, 200, audio);
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : "Spotify preview failed";
    return json(res, ROUTE, 500, { error: message });
  }
}
export {
  handler as default
};
