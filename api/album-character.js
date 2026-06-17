// Bundled for Vercel — edit scripts/api-entries/album-character.entry.ts and npm run build

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

// server/album-character/pressing-notes.ts
var PRESSING_SIGNALS = [
  /\bvariant\b/i,
  /\bsleeve\b/i,
  /\bbarcode\b/i,
  /\bmatrix\b/i,
  /\bpressing\b/i,
  /\breissue\b/i,
  /\blimited edition\b/i,
  /\bmade in\b/i,
  /\bback (cover|sleeve)\b/i,
  /\btop (right|left) corner\b/i,
  /\binsert\b/i,
  /\bobi\b/i,
  /\bsticker\b/i,
  /\bwhite label\b/i,
  /\bpromo\b/i,
  /\btest pressing\b/i,
  /\bcountry\b/i,
  /\beu version\b/i,
  /\bu\.?s\.? variant\b/i
];
function isPressingNotes(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const hits = PRESSING_SIGNALS.filter((re) => re.test(trimmed)).length;
  if (hits >= 2) return true;
  if (hits === 1 && trimmed.length < 220) return true;
  return false;
}

// server/album-character/compose.ts
var NOISE_TAGS = /* @__PURE__ */ new Set([
  "album",
  "seen live",
  "favourite",
  "favorite",
  "owned",
  "vinyl",
  "cd",
  "my vinyl",
  "all"
]);
var MOOD_BY_TAG = [
  ["dub", "deep"],
  ["roots reggae", "soulful"],
  ["reggae", "warm"],
  ["soul", "soulful"],
  ["jazz", "late-night"],
  ["house", "hypnotic"],
  ["techno", "driving"],
  ["ambient", "spacious"],
  ["funk", "groovy"],
  ["disco", "glittering"],
  ["hip hop", "groovy"],
  ["hip-hop", "groovy"],
  ["trip hop", "moody"],
  ["trip-hop", "moody"],
  ["downtempo", "smooth"]
];
function normalizeTag(raw) {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}
function rankTags(signals) {
  const scores = /* @__PURE__ */ new Map();
  const bump = (raw, weight) => {
    const tag = normalizeTag(raw);
    if (!tag || NOISE_TAGS.has(tag)) return;
    scores.set(tag, (scores.get(tag) ?? 0) + weight);
  };
  for (const g of signals.discogsGenres ?? []) bump(g, 3);
  for (const t of signals.musicBrainzTags ?? []) bump(t, 4);
  for (const row of signals.listenBrainzTags ?? []) bump(row.tag, 3 + Math.min(row.count, 5));
  for (const t of signals.lastfmTags ?? []) bump(t, 2);
  return [...scores.entries()].sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 6);
}
function pickMood(tags) {
  const text = tags.join(" ");
  for (const [needle, mood] of MOOD_BY_TAG) {
    if (text.includes(needle)) return mood;
  }
  return "characterful";
}
function capitalizePhrase(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
function joinTags(tags) {
  const top = tags.slice(0, 3);
  if (top.length === 0) return "";
  if (top.length === 1) return top[0];
  if (top.length === 2) return `${top[0]} & ${top[1]}`;
  return `${top[0]}, ${top[1]} & ${top[2]}`;
}
function shortenWikiProse(text, tags) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean || isPressingNotes(clean)) return null;
  const genreMatch = clean.match(/\bis an?\s+([^.]{3,80}?)\s+album\b/i);
  const genrePhrase = genreMatch?.[1]?.trim();
  const producerMatch = clean.match(/\bproduced by\s+([^.;]{3,50})/i);
  let producer = producerMatch?.[1]?.trim();
  if (producer) {
    producer = producer.replace(/\bat his\b.*/i, "").replace(/\bat the\b.*/i, "").trim();
    if (producer.length > 36) producer = producer.slice(0, 36).trim();
  }
  const tagPhrase = joinTags(tags) || genrePhrase;
  const mood = pickMood(tags.length ? tags : genrePhrase ? [genrePhrase] : []);
  if (tagPhrase && producer) {
    return `${capitalizePhrase(tagPhrase)} \u2014 ${producer}, ${mood} vibes`;
  }
  if (tagPhrase) {
    return `${capitalizePhrase(tagPhrase)} \u2014 ${mood} vibes`;
  }
  const firstSentence = clean.split(/\.\s/)[0]?.trim();
  if (firstSentence && firstSentence.length >= 24 && !isPressingNotes(firstSentence)) {
    return firstSentence.endsWith(".") ? firstSentence : `${firstSentence}.`;
  }
  return null;
}
function clampDescription(text, max = 520) {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trim()}\u2026`;
}
function composeCharacterDescription(signals) {
  const tags = rankTags(signals);
  const sources = [];
  if (signals.wikipediaExtract) sources.push("wikipedia");
  if (signals.lastfmWiki) sources.push("lastfm-wiki");
  if (signals.lastfmTags?.length) sources.push("lastfm-tags");
  if (signals.musicBrainzTags?.length) sources.push("musicbrainz-tags");
  if (signals.listenBrainzTags?.length) sources.push("listenbrainz-tags");
  if (signals.discogsGenres?.length) sources.push("discogs-genres");
  const wiki = signals.wikipediaExtract && !isPressingNotes(signals.wikipediaExtract) ? signals.wikipediaExtract : void 0;
  const lastfm = signals.lastfmWiki && !isPressingNotes(signals.lastfmWiki) ? signals.lastfmWiki : void 0;
  const prose = shortenWikiProse(wiki ?? lastfm ?? "", tags);
  if (prose) {
    return {
      description: clampDescription(prose),
      tags,
      sources: [...new Set(sources)]
    };
  }
  if (tags.length > 0) {
    const mood = pickMood(tags);
    const phrase = `${capitalizePhrase(joinTags(tags))} \u2014 ${mood} vibes`;
    return {
      description: clampDescription(phrase),
      tags,
      sources: [...new Set(sources.filter((s) => s !== "wikipedia" && s !== "lastfm-wiki"))]
    };
  }
  return { description: "", tags: [], sources: [] };
}

// server/album-character/listenbrainz.ts
async function fetchListenBrainzReleaseGroupTags(releaseGroupMbid) {
  const url = `https://api.listenbrainz.org/1/metadata/release_group/?release_group_mbids=${encodeURIComponent(releaseGroupMbid)}&inc=tag`;
  const res = await withTimeout(fetch(url), 5e3, null);
  if (!res?.ok) return [];
  const data = await res.json();
  const bucket = data[releaseGroupMbid]?.tag?.release_group ?? [];
  return bucket.map((t) => ({ tag: t.tag.trim().toLowerCase(), count: t.count })).filter((t) => t.tag.length > 0).sort((a, b) => b.count - a.count);
}

// server/album-character/musicbrainz.ts
var USER_AGENT = "MyVinyl/1.0 (https://myvinyl-nine.vercel.app; album-character; contact@myvinyl.local)";
var lastRequestAt = 0;
async function mbFetch(path) {
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - lastRequestAt));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestAt = Date.now();
  const res = await fetch(`https://musicbrainz.org/ws/2/${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" }
  });
  if (!res.ok) return null;
  return res.json();
}
function tagNamesFromGroup(group) {
  const fromTags = (group.tags ?? []).map((t) => t.name.trim()).filter(Boolean);
  const fromGenres = (group.genres ?? []).map((g) => g.name.trim()).filter(Boolean);
  return [.../* @__PURE__ */ new Set([...fromTags, ...fromGenres])];
}
function artistMatches(credit, artist) {
  const needle = artist.trim().toLowerCase();
  if (!needle || !credit?.length) return true;
  return credit.some((c) => {
    const name = (c.name ?? c.artist?.name ?? "").toLowerCase();
    return name.includes(needle) || needle.includes(name);
  });
}
async function lookupMusicBrainzAlbum(artist, album) {
  const q = encodeURIComponent(`artist:"${artist}" AND releasegroup:"${album}"`);
  const search = await withTimeout(
    mbFetch(`release-group/?query=${q}&fmt=json&limit=5`),
    6e3,
    null
  );
  const hits = search?.["release-groups"] ?? [];
  const best = hits.find((h) => h.score != null && h.score >= 95 && artistMatches(h["artist-credit"], artist)) ?? hits.find((h) => artistMatches(h["artist-credit"], artist)) ?? hits[0];
  if (!best?.id) return null;
  const detail = await withTimeout(
    mbFetch(`release-group/${best.id}?inc=tags+genres&fmt=json`),
    6e3,
    null
  );
  const tags = tagNamesFromGroup(detail ?? best);
  return { releaseGroupMbid: best.id, tags };
}

// server/album-character/wikipedia.ts
var USER_AGENT2 = "MyVinyl/1.0 (https://myvinyl-nine.vercel.app; album-character; contact@myvinyl.local)";
async function fetchSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT2, Accept: "application/json" }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const extract = data.extract?.replace(/\s+/g, " ").trim();
  return extract || null;
}
function albumTitleCandidates(artist, album) {
  const a = artist.trim();
  const t = album.trim();
  const out = [t];
  if (a) {
    out.push(`${t} (${a} album)`);
    out.push(`${t} (${a} Album)`);
  }
  return [...new Set(out)];
}
async function fetchWikipediaAlbumExtract(artist, album) {
  for (const title of albumTitleCandidates(artist, album)) {
    const extract = await withTimeout(fetchSummary(title), 4500, null);
    if (extract) return extract;
  }
  return null;
}

// server/album-character/index.ts
async function resolveAlbumCharacter(input, env) {
  const artist = input.artist.trim();
  const album = input.album.trim();
  const discogsGenres = (input.genres ?? []).map((g) => g.trim()).filter(Boolean);
  const [wikipediaExtract, lastfmInfo, mbMatch] = await Promise.all([
    fetchWikipediaAlbumExtract(artist, album),
    env.lastfmKey ? withTimeout(getAlbumInfo(env.lastfmKey, artist, album), 6e3, null) : Promise.resolve(null),
    lookupMusicBrainzAlbum(artist, album)
  ]);
  const listenBrainzTags = mbMatch?.releaseGroupMbid ? await fetchListenBrainzReleaseGroupTags(mbMatch.releaseGroupMbid) : [];
  const composed = composeCharacterDescription({
    wikipediaExtract: wikipediaExtract ?? void 0,
    lastfmWiki: lastfmInfo?.wikiText,
    lastfmTags: lastfmInfo?.tags,
    musicBrainzTags: mbMatch?.tags,
    listenBrainzTags,
    discogsGenres
  });
  return {
    description: composed.description || null,
    tags: composed.tags,
    sources: composed.sources
  };
}

// server/handlers/album-character.ts
var AlbumCharacterValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "AlbumCharacterValidationError";
  }
};
function parseAlbumCharacterQuery(query) {
  const pick = (key) => {
    const value = query[key];
    if (Array.isArray(value)) return value;
    if (value != null) return [value];
    return [];
  };
  const artist = (pick("artist")[0] ?? "").trim();
  const album = (pick("album")[0] ?? "").trim();
  if (!artist || !album) {
    throw new AlbumCharacterValidationError("artist and album required");
  }
  const genres = [...pick("genres"), ...pick("genre")].flatMap((v) => v.split(",")).map((g) => g.trim()).filter(Boolean);
  return { artist, album, genres: genres.length ? genres : void 0 };
}
async function handleAlbumCharacter(input, env) {
  return resolveAlbumCharacter(input, env);
}

// scripts/api-entries/album-character.entry.ts
var ROUTE = "api/album-character";
async function handler(req, res) {
  logApiRequest(ROUTE, req, "start");
  if (req.method !== "GET") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    const input = parseAlbumCharacterQuery(queryRecord(req.query));
    const { lastfmKey } = getApiEnv();
    const result = await handleAlbumCharacter(input, { lastfmKey });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof AlbumCharacterValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : "Album character failed";
    return json(res, ROUTE, 502, { error: message });
  }
}
export {
  handler as default
};
