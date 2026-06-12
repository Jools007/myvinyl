// Bundled for Vercel — edit scripts/api-entries/play/audio.entry.ts and npm run build

// api/_lib/play-audio/timeout.ts
function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallback), ms);
    })
  ]);
}

// api/_lib/play-audio/studio.ts
var COMPILATION_MARKERS = /\b(best of|greatest hits|gold|anthology|collection|essentials|very best|platinum|ultimate|classics)\b/i;
function isCompilationAlbum(albumName) {
  if (!albumName?.trim()) return false;
  return COMPILATION_MARKERS.test(albumName);
}
var STUDIO_ALBUMS_BY_ARTIST = {
  sade: ["Diamond Life", "Promise", "Love Deluxe", "Stronger Than Pride"],
  madonna: ["Madonna", "Like a Virgin", "True Blue", "Like a Prayer"],
  prince: ["1999", "Purple Rain", "Sign o' the Times"]
};
function knownStudioAlbumsForArtist(artist) {
  const primary = artist.split(",")[0].trim().toLowerCase();
  for (const [key, albums] of Object.entries(STUDIO_ALBUMS_BY_ARTIST)) {
    if (primary === key || primary.includes(key)) return [...albums];
  }
  return [];
}

// api/_lib/play-audio/log.ts
function playAudioLog(phase, detail) {
  const payload = {
    ts: (/* @__PURE__ */ new Date()).toISOString(),
    phase,
    ...detail
  };
  console.log("[play-audio]", JSON.stringify(payload));
}

// api/_lib/play-audio/track-title.ts
function normalizeTrackTitle(title) {
  return title.trim().replace(/^[A-Za-z]{1,2}\d+[.:\s-]+/i, "").replace(/^\d+[.:\s-]+/, "").replace(/^\d+\.?\s*/, "").replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ").replace(/\s+/g, " ").trim();
}
var PAREN_NOISE = /\([^)]*\b(remaster|remastered|deluxe|explicit|mono|stereo|digital|anniversary|expanded|bonus|single|album|version|edit|mix|hd|hq|clean|dirty|lp|cd|dvd|vinyl|reissue|restored)\b[^)]*\)/gi;
var BRACKET_NOISE = /\[[^\]]*\b(remaster|deluxe|explicit|live)\b[^\]]*\]/gi;
function cleanTitleForSearch(title) {
  return normalizeTrackTitle(
    title.replace(PAREN_NOISE, " ").replace(BRACKET_NOISE, " ").replace(/\s+-\s+(remaster|remastered|deluxe|explicit).*$/i, " ").replace(/\s{2,}/g, " ").trim()
  );
}
function titleSearchVariants(trackTitle) {
  const base = trackTitle.trim();
  const variants = /* @__PURE__ */ new Set();
  const add = (s) => {
    const t = s?.trim();
    if (t && t.length > 1) variants.add(t);
  };
  add(base);
  add(normalizeTrackTitle(base));
  add(cleanTitleForSearch(base));
  const noFeat = cleanTitleForSearch(base.replace(/\s+feat\.?\s+.*/i, " "));
  add(noFeat);
  const noSlash = cleanTitleForSearch(base.split("/")[0] ?? base);
  add(noSlash);
  const beforeDash = cleanTitleForSearch(base.replace(/\s+-\s+[^-]+$/i, " "));
  add(beforeDash);
  return [...variants];
}
function artistSearchVariants(artist) {
  const raw = artist.trim();
  const variants = /* @__PURE__ */ new Set();
  const add = (s) => {
    const t = s?.trim();
    if (t) variants.add(t);
  };
  add(raw);
  add(raw.split(",")[0]?.trim());
  add(raw.split("&")[0]?.trim());
  add(raw.split(" feat")[0]?.trim());
  add(raw.split(" ft")[0]?.trim());
  return [...variants];
}
function albumSearchVariants(album) {
  const raw = album.trim();
  const variants = /* @__PURE__ */ new Set();
  const add = (s) => {
    const t = s?.trim();
    if (t) variants.add(t);
  };
  add(raw);
  add(cleanTitleForSearch(raw));
  add(
    raw.replace(/\s*\([^)]*\)/g, " ").replace(/\s+/g, " ").trim()
  );
  return [...variants];
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
function scoreTitleMatch(wantedTitle, candidateTitle) {
  const want = normalizeForMatch(normalizeTrackTitle(wantedTitle));
  const got = normalizeForMatch(candidateTitle);
  if (!want || !got) return 0;
  if (isExtraVariant(wantedTitle, candidateTitle)) return 0;
  if (got === want) return 1;
  if (got.startsWith(want) && got.length <= want.length + 4) return 0.95;
  if (want.startsWith(got) && want.length <= got.length + 4) return 0.93;
  return 0;
}
function scoreArtistMatch(wantedArtist, candidateArtist) {
  const want = normalizeForMatch(wantedArtist);
  const got = normalizeForMatch(candidateArtist);
  if (!want || !got) return 0;
  if (want === got) return 1;
  const wantPrimary = want.split(",")[0].trim();
  const gotPrimary = got.split(",")[0].trim();
  if (wantPrimary === gotPrimary) return 0.98;
  if (gotPrimary.includes(wantPrimary) || wantPrimary.includes(gotPrimary)) return 0.9;
  const wantTokens = wantPrimary.split(" ").filter((t) => t.length > 1);
  const gotTokens = new Set(gotPrimary.split(" "));
  const overlap = wantTokens.filter((t) => gotTokens.has(t)).length;
  if (overlap >= Math.min(wantTokens.length, 2)) {
    return overlap / wantTokens.length * 0.85;
  }
  return 0;
}
function scoreAlbumMatch(wantedAlbum, candidateAlbum) {
  if (!wantedAlbum?.trim()) return 0.5;
  const want = normalizeForMatch(wantedAlbum);
  const got = normalizeForMatch(candidateAlbum);
  if (!got) return 0;
  if (got === want) return 1;
  if (got.includes(want) || want.includes(got)) return 0.92;
  return 0;
}
function scoreTrackMatch(wanted, candidate, opts) {
  const minTitle = opts?.minTitle ?? 0.92;
  const minArtist = opts?.minArtist ?? 0.88;
  const a = scoreArtistMatch(wanted.artist, candidate.artist ?? "");
  const t = scoreTitleMatch(wanted.title, candidate.title);
  if (t < minTitle || a < minArtist) return 0;
  const al = scoreAlbumMatch(wanted.album, candidate.album ?? "");
  let score = t * 0.52 + a * 0.38 + al * 0.1;
  if (wanted.trackNumber != null && candidate.trackNumber != null && wanted.trackNumber === candidate.trackNumber) {
    score += 0.08;
  }
  return Math.min(score, 1);
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
async function searchMatchedSpotifyTrack(clientId, clientSecret, artist, title, albumTitle, trackNumber, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  const album = albumTitle?.trim();
  const queries = [];
  if (album) queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  queries.push(`track:"${title}" artist:"${artist}"`);
  queries.push(`${artist} ${title}`);
  let bestWithPreview;
  let bestWithPreviewScore = 0;
  let bestAny;
  let bestAnyScore = 0;
  const seen = /* @__PURE__ */ new Set();
  for (const q of queries) {
    const items = await searchTracks(clientId, clientSecret, q, 12, fetchRetries);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      const score = scoreTrackMatch(
        { artist, title, album: albumTitle, trackNumber },
        {
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(" ") ?? "",
          trackNumber: t.track_number,
          album: t.album?.name
        },
        { minTitle: 0.88, minArtist: 0.85 }
      );
      if (score <= 0) continue;
      if (t.preview_url && score > bestWithPreviewScore) {
        bestWithPreviewScore = score;
        bestWithPreview = t;
      }
      if (score > bestAnyScore) {
        bestAnyScore = score;
        bestAny = t;
      }
    }
    if (bestWithPreview && bestWithPreviewScore >= 0.9) break;
  }
  return bestWithPreview ?? bestAny;
}
function normalizeForOverlap(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function overlapScore(want, got) {
  const wantTokens = normalizeForOverlap(want).split(" ").filter((t) => t.length > 1);
  if (!wantTokens.length) return 0;
  const gotSet = new Set(normalizeForOverlap(got).split(" "));
  return wantTokens.filter((t) => gotSet.has(t)).length / wantTokens.length;
}
async function pickSpotifyPreviewLoose(clientId, clientSecret, artist, title, albumTitle, fetchRetries = SPOTIFY_PREVIEW_MAX_RETRIES) {
  if (isRateLimited() && fetchRetries <= 0) return null;
  const queries = [];
  const addQ = (q) => {
    if (!queries.includes(q)) queries.push(q);
  };
  for (const a of [artist.trim(), artist.split(",")[0].trim()]) {
    for (const t of titleSearchVariants(title)) {
      if (albumTitle?.trim()) {
        addQ(`track:"${t}" artist:"${a}" album:"${albumTitle.trim()}"`);
      }
      addQ(`track:"${t}" artist:"${a}"`);
      addQ(`${a} ${t}`);
    }
  }
  let best;
  const seen = /* @__PURE__ */ new Set();
  for (const q of queries) {
    playAudioLog("spotify-loose-query", { q });
    const items = await searchTracks(clientId, clientSecret, q, 15, fetchRetries);
    for (const track of items) {
      if (!track.id || !track.preview_url || seen.has(track.id)) continue;
      if (isExtraVariant(title, track.name)) continue;
      seen.add(track.id);
      const titleScore = overlapScore(title, track.name);
      const artistScore = overlapScore(artist, spotifyTrackArtist(track));
      const score = titleScore * 0.6 + artistScore * 0.4;
      if (titleScore < 0.45 || artistScore < 0.35) continue;
      if (score > (best?.score ?? 0)) best = { track, score };
    }
    if (best && best.score >= 0.82) break;
  }
  if (!best?.track.preview_url) return null;
  playAudioLog("spotify-loose-hit", {
    artist,
    title,
    matched: best.track.name,
    score: best.score,
    spotifyTrackId: best.track.id
  });
  return trackToPreviewAudio(best.track);
}
async function resolveSpotifyPlayPreview(clientId, clientSecret, artist, title, albumTitle, opts) {
  const album = albumTitle?.trim();
  if (album) {
    const strict = await resolveTrackPreview(
      clientId,
      clientSecret,
      artist,
      title,
      album,
      opts
    );
    if (strict?.previewUrl) return strict;
  }
  const match = await searchMatchedSpotifyTrack(
    clientId,
    clientSecret,
    artist,
    title,
    album,
    opts?.albumIndex,
    opts?.fetchRetries ?? SPOTIFY_PREVIEW_MAX_RETRIES
  );
  if (match?.preview_url) return trackToPreviewAudio(match);
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

// api/_lib/play-audio/youtube.ts
var INNERTUBE_KEY = "AIzaSyAO_FJ2SlqU8Q4STEHL6lAD7tEDd8Ep_Rk";
var INNERTUBE_CLIENT_VERSION = "2.20240601.00.00";
var HARD_SKIP_TITLE = /\b(karaoke|instrumental\s+only|how\s+to\s+play|guitar\s+lesson|drum\s+cover|reaction|podcast|unboxing|teaser|trailer|vlog)\b/i;
var SOFT_SKIP_TITLE = /\b(live\s+at|live\s+from|festival)\b/i;
var PREFER_OFFICIAL_AUDIO = /\b(official\s+audio|audio\s+only|provided\s+to\s+youtube|topic\s*-\s*)/i;
var PREFER_TITLE = /\b(lyric\s+video|lyrics\s+video|album\s+version)\b/i;
var DISLIKE_OFFICIAL_VIDEO = /\bofficial\s+video\b/i;
var DISLIKE_TITLE = /\b(cover|tribute|mashup|8d\s+audio|nightcore|sped\s+up|slowed|reverb)\b/i;
function normalize(s) {
  return s.toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function tokenOverlap(want, got) {
  const wantTokens = normalize(want).split(" ").filter((t) => t.length > 1);
  if (!wantTokens.length) return 0;
  const gotSet = new Set(normalize(got).split(" "));
  const hit = wantTokens.filter((t) => gotSet.has(t)).length;
  return hit / wantTokens.length;
}
function scoreYouTubeResult(artist, title, album, candidateTitle) {
  const t = candidateTitle.trim();
  if (!t || HARD_SKIP_TITLE.test(t)) return 0;
  if (SOFT_SKIP_TITLE.test(t)) return 0.08;
  const titleScore = tokenOverlap(title, t);
  const artistScore = tokenOverlap(artist.split(",")[0], t);
  const albumScore = album ? tokenOverlap(album, t) * 0.28 : 0;
  let score = titleScore * 0.5 + artistScore * 0.38 + albumScore;
  if (PREFER_OFFICIAL_AUDIO.test(t)) score += 0.38;
  else if (PREFER_TITLE.test(t)) score += 0.12;
  if (DISLIKE_OFFICIAL_VIDEO.test(t)) score -= 0.22;
  if (/\bvevo\b/i.test(t)) score -= 0.12;
  if (DISLIKE_TITLE.test(t)) score -= 0.22;
  if (titleScore >= 0.7 && artistScore >= 0.4) score += 0.15;
  if (titleScore >= 0.95 && artistScore >= 0.3) score += 0.1;
  return Math.max(0, score);
}
function parseInnerTubeVideos(body) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const walk = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 16) return;
    const obj = node;
    const videoId = typeof obj.videoId === "string" ? obj.videoId.trim() : "";
    let title = "";
    const titleObj = obj.title;
    if (titleObj && typeof titleObj === "object") {
      const t = titleObj;
      title = (t.simpleText ?? t.runs?.[0]?.text ?? "").trim();
    }
    if (videoId.length === 11 && title && !seen.has(videoId)) {
      seen.add(videoId);
      out.push({ videoId, title, score: 0 });
    }
    for (const value of Object.values(obj)) {
      if (value && typeof value === "object") walk(value, depth + 1);
    }
  };
  walk(body);
  return out;
}
async function searchYouTubeInnerTube(query, timeoutMs = 9e3) {
  playAudioLog("youtube-innertube", { query });
  try {
    const res = await fetch(
      `https://www.youtube.com/youtubei/v1/search?key=${INNERTUBE_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "WEB",
              clientVersion: INNERTUBE_CLIENT_VERSION,
              hl: "en",
              gl: "US"
            }
          },
          query
        }),
        signal: AbortSignal.timeout(timeoutMs)
      }
    );
    if (!res.ok) {
      playAudioLog("youtube-innertube-fail", { query, status: res.status });
      return [];
    }
    const data = await res.json();
    const videos = parseInnerTubeVideos(data);
    playAudioLog("youtube-innertube-ok", { query, count: videos.length });
    return videos;
  } catch (err) {
    playAudioLog("youtube-innertube-fail", {
      query,
      error: err instanceof Error ? err.message : "unknown"
    });
    return [];
  }
}
async function searchYouTubeDataApi(apiKey, query, timeoutMs = 9e3) {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    maxResults: "15",
    q: query,
    key: apiKey
  });
  playAudioLog("youtube-data-api", { query });
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?${params}`,
    { signal: AbortSignal.timeout(timeoutMs) }
  );
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const item of data.items ?? []) {
    const videoId = item.id?.videoId?.trim();
    const title = item.snippet?.title?.trim();
    if (videoId && title) out.push({ videoId, title, score: 0 });
  }
  return out;
}
async function fetchYouTubeBatch(query, apiKey) {
  if (apiKey) {
    const api = await searchYouTubeDataApi(apiKey, query);
    if (api.length) return api;
  }
  const inner = await searchYouTubeInnerTube(query);
  if (inner.length) return inner;
  return [];
}
function buildYouTubeQueries(artist, title, album) {
  const queries = /* @__PURE__ */ new Set();
  const add = (q) => {
    const t = q.replace(/\s+/g, " ").trim();
    if (t.length > 3) queries.add(t);
  };
  for (const a of artistSearchVariants(artist)) {
    for (const t of titleSearchVariants(title)) {
      add(`${a} ${t} official audio`);
      add(`${a} ${t} lyrics`);
      add(`${a} - ${t}`);
      add(`${a} ${t} audio`);
      add(`${a} ${t}`);
      if (album) {
        for (const al of albumSearchVariants(album)) {
          add(`${a} ${t} ${al}`);
          add(`${a} ${al} ${t}`);
        }
      }
    }
  }
  return [...queries];
}
function rankCandidates(artist, title, album, candidates, minScore) {
  const seen = /* @__PURE__ */ new Set();
  const ranked = [];
  for (const row of candidates) {
    if (seen.has(row.videoId)) continue;
    seen.add(row.videoId);
    const score = scoreYouTubeResult(artist, title, album, row.title);
    if (score < minScore) continue;
    ranked.push({ ...row, score });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked;
}
async function isYouTubeEmbeddable(videoId) {
  try {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}
async function pickEmbeddable(ranked, maxTry = 2) {
  const slice = ranked.slice(0, maxTry);
  const checks = await Promise.all(
    slice.map(async (row) => ({
      row,
      ok: await isYouTubeEmbeddable(row.videoId)
    }))
  );
  const hit = checks.find((c) => c.ok);
  return hit?.row ?? slice[0] ?? null;
}
async function searchYouTubeForTrack(artist, title, album, apiKey) {
  const a = artist.trim();
  const t = title.trim();
  const al = album?.trim();
  if (!a || !t) return null;
  const queries = buildYouTubeQueries(a, t, al);
  playAudioLog("youtube-start", {
    artist: a,
    title: t,
    album: al,
    queryCount: queries.length,
    queries: queries.slice(0, 10)
  });
  const seenIds = /* @__PURE__ */ new Set();
  const all = [];
  const ingestBatch = (batch) => {
    for (const row of batch) {
      if (seenIds.has(row.videoId)) continue;
      seenIds.add(row.videoId);
      all.push(row);
    }
  };
  const tryReturnHit = async (minScore, phase, query) => {
    const picks = rankCandidates(a, t, al, all, minScore);
    const top = picks[0];
    if (!top || top.score < 0.45) return null;
    const pick = top.score >= 0.72 ? top : await pickEmbeddable(picks) ?? top;
    playAudioLog("youtube-hit", {
      videoId: pick.videoId,
      title: pick.title,
      score: pick.score,
      phase,
      query: query ?? null
    });
    return pick;
  };
  const maxQueries = 10;
  const parallelCount = Math.min(3, queries.length);
  const initialBatches = await Promise.all(
    queries.slice(0, parallelCount).map((q) => fetchYouTubeBatch(q, apiKey))
  );
  for (let i = 0; i < initialBatches.length; i++) {
    ingestBatch(initialBatches[i]);
    const hit = await tryReturnHit(0.32, "parallel", queries[i]);
    if (hit) return hit;
  }
  for (let i = parallelCount; i < Math.min(queries.length, maxQueries); i++) {
    const q = queries[i];
    ingestBatch(await fetchYouTubeBatch(q, apiKey));
    const hit = await tryReturnHit(0.32, "sequential", q);
    if (hit) return hit;
  }
  const relaxedList = rankCandidates(a, t, al, all, 0.22);
  const relaxed = relaxedList[0];
  if (relaxed) {
    const pick = await pickEmbeddable(relaxedList) ?? relaxed;
    playAudioLog("youtube-hit-relaxed", {
      videoId: pick.videoId,
      title: pick.title,
      score: pick.score
    });
    return pick;
  }
  playAudioLog("youtube-miss", { artist: a, title: t, album: al });
  return null;
}

// api/_lib/play-audio/resolve.ts
var SPOTIFY_PASS_MS = 6e3;
var YOUTUBE_PASS_MS = 18e3;
function albumsForSpotifyLookup(ctx) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (raw) => {
    const key = (raw ?? "").trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(raw?.trim() || void 0);
  };
  if (ctx.album?.trim()) {
    for (const al of albumSearchVariants(ctx.album)) push(al);
  }
  if (!ctx.album || isCompilationAlbum(ctx.album)) {
    for (const studio of knownStudioAlbumsForArtist(ctx.artist).slice(0, 2)) {
      push(studio);
    }
  }
  return out;
}
async function trySpotify(ctx, artist, title, album, mode = "loose") {
  if (!ctx.spotifyId || !ctx.spotifySecret) return null;
  if (mode === "loose") {
    return withTimeout(
      pickSpotifyPreviewLoose(
        ctx.spotifyId,
        ctx.spotifySecret,
        artist,
        title,
        album,
        2
      ),
      SPOTIFY_PASS_MS,
      null
    );
  }
  return withTimeout(
    resolveSpotifyPlayPreview(ctx.spotifyId, ctx.spotifySecret, artist, title, album, {
      fetchRetries: 2,
      spotifyTrackId: ctx.spotifyTrackId,
      albumIndex: ctx.albumIndex
    }),
    SPOTIFY_PASS_MS,
    null
  );
}
async function tryYouTube(ctx, artist, title) {
  return withTimeout(
    searchYouTubeForTrack(artist, title, ctx.album, ctx.youtubeApiKey),
    YOUTUBE_PASS_MS,
    null
  );
}
function toSpotifyResult(audio) {
  return {
    source: "spotify",
    previewUrl: audio.previewUrl,
    spotifyTrackId: audio.spotifyTrackId,
    durationSec: 30
  };
}
function toYouTubeResult(hit) {
  return {
    source: "youtube",
    videoId: hit.videoId,
    videoTitle: hit.title
  };
}
async function raceAudioResults(tasks) {
  if (!tasks.length) return null;
  return new Promise((resolve) => {
    let pending = tasks.length;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    for (const task of tasks) {
      task().then((value) => {
        if (value) finish(value);
        else if (--pending === 0) finish(null);
      }).catch(() => {
        if (--pending === 0) finish(null);
      });
    }
  });
}
async function resolvePlayableAudio(ctx) {
  const artist = ctx.artist.trim();
  const title = ctx.title.trim();
  if (!artist || !title) return null;
  const artists = artistSearchVariants(artist);
  const titles = titleSearchVariants(title);
  const albums = albumsForSpotifyLookup({ ...ctx, artist, title });
  playAudioLog("start", {
    artist,
    title,
    album: ctx.album ?? null,
    titleVariants: titles,
    artistVariants: artists,
    albumPasses: albums
  });
  if (ctx.spotifyTrackId?.trim() && ctx.spotifyId && ctx.spotifySecret) {
    const direct = await trySpotify(ctx, artist, title, ctx.album, "full");
    if (direct?.previewUrl) {
      playAudioLog("done", { source: "spotify", phase: "track-id" });
      return toSpotifyResult(direct);
    }
    const yt = await tryYouTube(ctx, artist, title);
    if (yt) {
      playAudioLog("done", { source: "youtube", phase: "track-id-youtube" });
      return toYouTubeResult(yt);
    }
  }
  const primary = await raceAudioResults([
    () => trySpotify(ctx, artist, title, ctx.album, "loose").then(
      (r) => r?.previewUrl ? toSpotifyResult(r) : null
    ),
    () => tryYouTube(ctx, artist, title).then((r) => r ? toYouTubeResult(r) : null)
  ]);
  if (primary) {
    playAudioLog("done", { source: primary.source, phase: "primary-race" });
    return primary;
  }
  for (const a of artists) {
    for (const t of titles) {
      if (a === artist && t === title) continue;
      const variant = await raceAudioResults([
        () => trySpotify(ctx, a, t, ctx.album, "loose").then(
          (r) => r?.previewUrl ? toSpotifyResult(r) : null
        ),
        () => tryYouTube(ctx, a, t).then((r) => r ? toYouTubeResult(r) : null)
      ]);
      if (variant) {
        playAudioLog("done", {
          source: variant.source,
          phase: "variant-race",
          artist: a,
          title: t
        });
        return variant;
      }
    }
  }
  for (const album of albums) {
    for (const a of artists) {
      for (const t of titles) {
        const sp = await trySpotify(ctx, a, t, album, "loose");
        if (sp?.previewUrl) {
          playAudioLog("done", {
            source: "spotify",
            phase: "album-loose",
            artist: a,
            title: t,
            album: album ?? null
          });
          return toSpotifyResult(sp);
        }
        const full = await trySpotify(ctx, a, t, album, "full");
        if (full?.previewUrl) {
          playAudioLog("done", {
            source: "spotify",
            phase: "album-full",
            artist: a,
            title: t,
            album: album ?? null
          });
          return toSpotifyResult(full);
        }
      }
    }
  }
  playAudioLog("miss", { artist, title, album: ctx.album ?? null });
  return null;
}

// api/_lib/play-audio/handler.ts
async function handlePlayAudio(input) {
  const artist = input.artist.trim();
  const title = input.title.trim();
  if (!artist || !title) {
    return { ok: false, status: 404, error: "artist and title required" };
  }
  const playback = await resolvePlayableAudio({
    artist,
    title,
    album: input.album?.trim() || void 0,
    albumIndex: input.albumIndex != null && !Number.isNaN(input.albumIndex) && input.albumIndex > 0 ? input.albumIndex : void 0,
    spotifyTrackId: input.spotifyTrackId?.trim() || void 0,
    spotifyId: input.spotifyId,
    spotifySecret: input.spotifySecret,
    youtubeApiKey: input.youtubeApiKey
  });
  if (playback) {
    return { ok: true, status: 200, data: playback };
  }
  if (isSpotifyRateLimited()) {
    return {
      ok: false,
      status: 503,
      error: "Spotify is temporarily rate-limited \u2014 try again in a few seconds",
      retryAfterSec: getSpotifyRateLimitRetrySec()
    };
  }
  return { ok: false, status: 404, error: "No playable audio found" };
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

// scripts/api-entries/play/audio.entry.ts
var ROUTE = "api/play/audio";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const { spotifyId, spotifySecret, youtubeApiKey } = getApiEnv();
    const query = queryRecord(req.query);
    const artist = typeof query.artist === "string" ? query.artist.trim() : "";
    const title = typeof query.title === "string" ? query.title.trim() : "";
    const album = typeof query.album === "string" ? query.album.trim() : void 0;
    const albumIndexRaw = typeof query.albumIndex === "string" ? query.albumIndex : void 0;
    const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : void 0;
    const spotifyTrackId = typeof query.spotifyTrackId === "string" ? query.spotifyTrackId.trim() : void 0;
    if (!artist || !title) {
      return json(res, ROUTE, 400, { error: "artist and title required" });
    }
    const result = await handlePlayAudio({
      artist,
      title,
      album: album || void 0,
      albumIndex: albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0 ? albumIndex : void 0,
      spotifyTrackId: spotifyTrackId || void 0,
      spotifyId,
      spotifySecret,
      youtubeApiKey
    });
    if (result.ok) {
      return json(res, ROUTE, 200, result.data);
    }
    if (result.status === 503) {
      return json(res, ROUTE, 503, {
        error: result.error,
        retryAfterSec: result.retryAfterSec
      });
    }
    return json(res, ROUTE, 404, { error: result.error });
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : "Internal error";
    return json(res, ROUTE, 500, { error: message });
  }
}
export {
  handler as default
};
