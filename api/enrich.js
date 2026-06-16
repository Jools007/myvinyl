// Bundled for Vercel — edit scripts/api-entries/enrich.entry.ts and npm run build

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

// server/discogs.ts
var DISCOGS_API = "https://api.discogs.com";
function headers(token) {
  return {
    "User-Agent": "MyVinyl/1.0 +https://myvinyl.local",
    Accept: "application/vnd.discogs.v2.discogs+json",
    Authorization: `Discogs token=${token}`
  };
}
async function getRelease(token, id) {
  const res = await fetch(`${DISCOGS_API}/releases/${id}`, {
    headers: headers(token)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Discogs release failed: ${res.status} ${text}`);
  }
  return res.json();
}
function extractBpmKey(notes, tracklist) {
  const text = [notes, ...(tracklist || []).map((t) => t.title)].filter(Boolean).join(" ");
  const bpmMatch = text.match(/\b(\d{2,3})\s*BPM\b/i);
  const keyMatch = text.match(/\b(\d{1,2}[AB])\b/i) || text.match(/\b([A-G][#b]?(?:\s*(?:major|minor|maj|min|m))?)\b/i);
  return {
    bpm: bpmMatch ? parseInt(bpmMatch[1], 10) : void 0,
    key: keyMatch ? keyMatch[1].toUpperCase().replace(/\s+/g, "") : void 0
  };
}
function bestCoverImage(images) {
  if (!images?.length) return void 0;
  const primary = images.find((i) => i.type === "primary");
  return resolveDiscogsCoverUrl(primary?.uri || images[0]?.uri);
}

// server/camelot-wheel.ts
var WHEEL_NEIGHBORS = {
  "1A": ["12A", "2A", "1B"],
  "2A": ["1A", "3A", "2B"],
  "3A": ["2A", "4A", "3B"],
  "4A": ["3A", "5A", "4B"],
  "5A": ["4A", "6A", "5B"],
  "6A": ["5A", "7A", "6B"],
  "7A": ["6A", "8A", "7B"],
  "8A": ["7A", "9A", "8B"],
  "9A": ["8A", "10A", "9B"],
  "10A": ["9A", "11A", "10B"],
  "11A": ["10A", "12A", "11B"],
  "12A": ["11A", "1A", "12B"],
  "1B": ["12B", "2B", "1A"],
  "2B": ["1B", "3B", "2A"],
  "3B": ["2B", "4B", "3A"],
  "4B": ["3B", "5B", "4A"],
  "5B": ["4B", "6B", "5A"],
  "6B": ["5B", "7B", "6A"],
  "7B": ["6B", "8B", "7A"],
  "8B": ["7B", "9B", "8A"],
  "9B": ["8B", "10B", "9A"],
  "10B": ["9B", "11B", "10A"],
  "11B": ["10B", "12B", "11A"],
  "12B": ["11B", "1B", "12A"]
};
function hashTrackSeed(artist, title) {
  const s = `${artist.trim().toLowerCase()}|${title.trim().toLowerCase()}`;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = h * 31 + s.charCodeAt(i) >>> 0;
  return h;
}
function pickEstimatedCamelotFromPool(baseKey, artist, title, usedKeys = []) {
  const base = baseKey.match(/^\d{1,2}[AB]$/i)?.[0].toUpperCase();
  if (!base) return baseKey;
  const pool = [base, ...WHEEL_NEIGHBORS[base] ?? []];
  const start = hashTrackSeed(artist, title) % pool.length;
  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    const repeats = usedKeys.filter((k) => k.toUpperCase() === key).length;
    if (repeats === 0) return key;
  }
  for (let i = 0; i < pool.length; i++) {
    const key = pool[(start + i) % pool.length];
    if (usedKeys.filter((k) => k.toUpperCase() === key).length < 2) return key;
  }
  return pool[start];
}

// server/bpm.ts
var GENRE_CAMELOT = [
  ["tech house", "8A"],
  ["deep house", "10A"],
  ["house", "8A"],
  ["techno", "8A"],
  ["minimal", "9A"],
  ["garage", "5A"],
  ["drum and bass", "4A"],
  ["dnb", "4A"],
  ["soul", "8B"],
  ["smooth", "8B"],
  ["quiet storm", "8B"],
  ["r&b", "5B"],
  ["rnb", "5B"],
  ["disco", "10B"],
  ["funk", "5B"],
  ["jazz", "3B"],
  ["hip hop", "4A"],
  ["hip-hop", "4A"],
  ["rap", "4A"],
  ["trip-hop", "6A"],
  ["trip hop", "6A"],
  ["downtempo", "6A"],
  ["chillout", "6A"],
  ["nu jazz", "3B"],
  ["nu-jazz", "3B"],
  ["lounge", "3B"],
  ["ambient", "6A"],
  ["dub", "6A"],
  ["reggae", "10A"],
  ["latin", "9A"],
  ["trance", "7B"],
  ["electro", "8A"],
  ["hard rock", "7A"],
  ["rock", "5A"],
  ["metal", "7A"],
  ["punk", "4A"],
  ["pop", "9B"],
  ["blues", "3B"],
  ["country", "10B"],
  ["folk", "6A"],
  ["progressive", "6A"],
  ["psychedelic", "6A"]
];
var DEFAULT_CAMELOT_POOL = ["5A", "7A", "9B", "3B", "10B", "8B"];
function defaultCamelotForGenres(genres) {
  const text = genres.join(" ").toLowerCase().trim();
  const h = hashTrackSeed(text || "vinyl", "album");
  return DEFAULT_CAMELOT_POOL[h % DEFAULT_CAMELOT_POOL.length];
}
function estimateCamelotFromGenres(genres) {
  const text = genres.join(" ").toLowerCase();
  for (const [key, camelot] of GENRE_CAMELOT) {
    if (text.includes(key)) return camelot;
  }
  return void 0;
}
function extractBpmFromText(text) {
  const bpmMatch = text.match(/\b(\d{2,3})\s*bpm\b/i);
  if (bpmMatch) {
    const n = parseInt(bpmMatch[1], 10);
    if (n >= 60 && n <= 200) return n;
  }
  return void 0;
}
function isPlausibleTrackBpm(bpm, genres = []) {
  if (!Number.isFinite(bpm) || bpm < 55 || bpm > 210) return false;
  const text = genres.join(" ").toLowerCase();
  if (text.includes("drum and bass") || text.includes("dnb")) {
    return bpm >= 155 && bpm <= 190;
  }
  if (text.includes("gabber") || text.includes("hardcore")) {
    return bpm >= 145 && bpm <= 220;
  }
  if (text.includes("ambient") || text.includes("downtempo")) {
    return bpm >= 55 && bpm <= 105;
  }
  if (text.includes("soul") || text.includes("smooth") || text.includes("r&b") || text.includes("rnb") || text.includes("quiet storm") || text.includes("ballad")) {
    return bpm >= 65 && bpm <= 120;
  }
  if (text.includes("jazz") || text.includes("bossa") || text.includes("lounge")) {
    return bpm >= 60 && bpm <= 130;
  }
  if (bpm > 148) return false;
  if (bpm < 68 && !text.includes("jazz") && !text.includes("soul")) return false;
  return true;
}

// server/key.ts
function toCamelotKey(raw) {
  if (!raw?.trim()) return void 0;
  const text = raw.trim();
  const camelot = text.match(/^(\d{1,2})([AB])$/i);
  if (camelot) {
    const n = parseInt(camelot[1], 10);
    if (n >= 1 && n <= 12) return `${n}${camelot[2].toUpperCase()}`;
  }
  const normalized = text.replace(/\s+/g, " ").replace(/♯/g, "#").replace(/♭/g, "b").trim();
  const majorMinor = normalized.match(/^([A-G](?:#|b)?)\s*(major|maj|minor|min|m)$/i);
  if (majorMinor) {
    return pitchToCamelot(majorMinor[1], /minor|min|m/i.test(majorMinor[2]));
  }
  const compact = normalized.match(/^([A-G](?:#|b)?)(m|min)$/i);
  if (compact) {
    return pitchToCamelot(compact[1], true);
  }
  return void 0;
}
var MAJOR = {
  C: "8B",
  "C#": "3B",
  Db: "3B",
  D: "10B",
  "D#": "5B",
  Eb: "5B",
  E: "12B",
  F: "7B",
  "F#": "2B",
  Gb: "2B",
  G: "9B",
  "G#": "4B",
  Ab: "4B",
  A: "11B",
  "A#": "6B",
  Bb: "6B",
  B: "1B"
};
var MINOR = {
  C: "5A",
  "C#": "12A",
  Db: "12A",
  D: "7A",
  "D#": "2A",
  Eb: "2A",
  E: "9A",
  F: "4A",
  "F#": "11A",
  Gb: "11A",
  G: "6A",
  "G#": "1A",
  Ab: "1A",
  A: "8A",
  "A#": "3A",
  Bb: "3A",
  B: "10A"
};
function pitchToCamelot(pitch, isMinor) {
  const letter = pitch.charAt(0).toUpperCase();
  const accidental = pitch.slice(1).replace(/♯/g, "#").replace(/♭/g, "b");
  const p = `${letter}${accidental}`;
  const table = isMinor ? MINOR : MAJOR;
  return table[p];
}
function extractKeyFromText(text) {
  if (!text) return void 0;
  const camelot = text.match(/\b(\d{1,2})\s*([AB])\b/i);
  if (camelot) return toCamelotKey(`${camelot[1]}${camelot[2]}`);
  const keyPhrase = text.match(
    /\b(?:key|camelot|mixed in key)[:\s]+(\d{1,2}[AB]|[A-G](?:#|b)?\s*(?:major|minor|maj|min|m))\b/i
  );
  if (keyPhrase) return toCamelotKey(keyPhrase[1]);
  const musical = text.match(/\b([A-G](?:#|b)?)\s*(major|minor|maj|min|m)\b/i);
  if (musical) return toCamelotKey(`${musical[1]} ${musical[2]}`);
  const compactMinor = text.match(/\b([A-G](?:#|b)?)\s*m\b/i);
  if (compactMinor) return toCamelotKey(`${compactMinor[1]} minor`);
  return void 0;
}

// server/track-title.ts
function normalizeTrackTitle(title) {
  return title.trim().replace(/^[A-Za-z]{1,2}\d+[.:\s-]+/i, "").replace(/^\d+[.:\s-]+/, "").replace(/^\d+\.?\s*/, "").replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ").replace(/\s+/g, " ").trim();
}

// server/track-match.ts
var VARIANT_MARKERS = /\b(remix|rework|re-?edit|mix|version|live|acoustic|instrumental|karaoke|demo|radio\s*edit|extended|club|dub|mashup|bootleg|cover|tribute|ringtone)\b/i;
var VARIANT_MARKERS_STRICT = /\b(remix|rework|re-?edit|extended\s+mix|club\s+mix|live|acoustic|instrumental|karaoke|demo|radio\s*edit|dub\s+mix|mashup|bootleg)\b/i;
function normalizeForMatch(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/\[.*?\]/g, " ").replace(/feat\.?.*$/i, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function parseTrackNumber(position) {
  if (!position?.trim()) return void 0;
  const p = position.trim();
  if (/^\d+$/.test(p)) {
    const num = parseInt(p, 10);
    return num > 0 ? num : void 0;
  }
  return void 0;
}
function parseVinylPosition(position) {
  if (!position?.trim()) return void 0;
  const p = position.trim();
  const m = /^([A-Za-z]+)(\d+)$/i.exec(p);
  if (!m) return void 0;
  const number = parseInt(m[2], 10);
  return number > 0 ? { side: m[1].toUpperCase(), number } : void 0;
}
function normalizeVinylPositionKey(position) {
  const vinyl = parseVinylPosition(position);
  if (vinyl) return `${vinyl.side.toLowerCase()}${vinyl.number}`;
  const num = parseTrackNumber(position);
  return num != null ? String(num) : void 0;
}
function isPlayableDiscogsRow(row) {
  return Boolean(row.title?.trim());
}
function discogsPositionMatches(rowPosition, vinylPosition) {
  const posKey = normalizeVinylPositionKey(vinylPosition);
  const numericPos = parseTrackNumber(vinylPosition);
  const rowPosKey = normalizeVinylPositionKey(rowPosition);
  const rowNum = parseTrackNumber(rowPosition);
  return posKey != null && rowPosKey === posKey || numericPos != null && rowNum === numericPos || vinylPosition.trim().toLowerCase() === (rowPosition ?? "").trim().toLowerCase();
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
function resolveDiscogsHint(tracklist, title, vinylPosition) {
  if (!tracklist?.length) return void 0;
  const playable = tracklist.filter(isPlayableDiscogsRow);
  if (vinylPosition?.trim()) {
    for (let i = 0; i < playable.length; i++) {
      const row = playable[i];
      if (!discogsPositionMatches(row.position, vinylPosition)) continue;
      return {
        row,
        albumIndex: i + 1,
        canonicalTitle: normalizeTrackTitle(row.title),
        position: row.position ?? vinylPosition
      };
    }
  }
  const titleHits = [];
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    if (scoreTitleMatch(title, row.title) >= 0.98) {
      titleHits.push({ row, albumIndex: i + 1 });
    }
  }
  if (titleHits.length !== 1) return void 0;
  const hit = titleHits[0];
  return {
    row: hit.row,
    albumIndex: hit.albumIndex,
    canonicalTitle: normalizeTrackTitle(hit.row.title),
    position: hit.row.position
  };
}
function buildAlbumLookupKeys(title, trackNumber, vinylPosition) {
  const exact = normalizeForMatch(normalizeTrackTitle(title));
  const positioned = trackNumber != null && trackNumber > 0 ? `${trackNumber}|${exact}` : void 0;
  const vinylKey = normalizeVinylPositionKey(vinylPosition);
  const vinyl = vinylKey ? `${vinylKey}|${exact}` : void 0;
  return { exact, positioned, vinyl };
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
function lookupInAlbumMap(map, title, trackNumber, opts) {
  const { exact, positioned, vinyl } = buildAlbumLookupKeys(
    title,
    trackNumber,
    opts?.vinylPosition
  );
  if (vinyl && map.has(vinyl)) return map.get(vinyl);
  if (positioned && map.has(positioned)) return map.get(positioned);
  if (map.has(exact)) return map.get(exact);
  return void 0;
}
function storeInAlbumMap(map, title, trackNumber, value, vinylPosition) {
  const { exact, positioned, vinyl } = buildAlbumLookupKeys(title, trackNumber, vinylPosition);
  if (vinyl) map.set(vinyl, value);
  if (positioned) map.set(positioned, value);
  map.set(exact, value);
}

// server/enrich-scoring.ts
var SOURCE_BPM_WEIGHT = {
  discogs: 1,
  spotify_album: 0.96,
  deezer_album: 0.92,
  spotify_track: 0.86,
  deezer_track: 0.8,
  lastfm: 0.72
};
var SOURCE_KEY_WEIGHT = {
  discogs: 1,
  spotify_album: 0.98,
  spotify_track: 0.9,
  deezer_album: 0,
  deezer_track: 0,
  lastfm: 0.78
};
var COMPILATION_MARKERS = /\b(best of|greatest hits|gold|anthology|collection|essentials|very best|platinum|ultimate|classics)\b/i;
var STUDIO_AVOID_MARKERS = /\b(remix|rework|re-?edit|club|dance|extended|live|acoustic|karaoke|cover|tribute|version)\b/i;
function isCompilationAlbum(albumName) {
  if (!albumName?.trim()) return false;
  return COMPILATION_MARKERS.test(albumName);
}
function genreBpmProfile(genres) {
  const text = genres.join(" ").toLowerCase();
  if (text.includes("drum and bass") || text.includes("dnb")) {
    return { center: 172, min: 160, max: 188 };
  }
  if (text.includes("techno") || text.includes("tech house")) {
    return { center: 128, min: 118, max: 140 };
  }
  if (text.includes("house") || text.includes("garage")) {
    return { center: 124, min: 112, max: 132 };
  }
  if (text.includes("soul") || text.includes("smooth") || text.includes("r&b") || text.includes("rnb") || text.includes("quiet storm") || text.includes("ballad")) {
    return { center: 92, min: 72, max: 118 };
  }
  if (text.includes("disco") || text.includes("funk")) {
    return { center: 112, min: 95, max: 128 };
  }
  if (text.includes("jazz") || text.includes("bossa") || text.includes("lounge")) {
    return { center: 105, min: 70, max: 130 };
  }
  if (text.includes("trip hop") || text.includes("trip-hop") || text.includes("downtempo") || text.includes("chillout") || text.includes("nu jazz") || text.includes("nu-jazz") || text.includes("lounge")) {
    return { center: 90, min: 72, max: 108 };
  }
  if (text.includes("ambient")) {
    return { center: 82, min: 60, max: 100 };
  }
  if (text.includes("hip hop") || text.includes("hip-hop") || text.includes("rap")) {
    return { center: 94, min: 78, max: 110 };
  }
  if (text.includes("hard rock") || text.includes("metal") || text.includes("punk")) {
    return { center: 122, min: 95, max: 150 };
  }
  if (text.includes("rock") || text.includes("alternative")) {
    return { center: 118, min: 90, max: 145 };
  }
  if (text.includes("pop")) {
    return { center: 112, min: 85, max: 135 };
  }
  if (text.includes("blues") || text.includes("country") || text.includes("folk")) {
    return { center: 100, min: 72, max: 125 };
  }
  return { center: 110, min: 75, max: 140 };
}
function titleBpmOffset(title) {
  const t = title.toLowerCase();
  if (/\b(prelude|intro|interlude|ballad|acoustic|lullaby|slow|waltz)\b/.test(t)) return -16;
  if (/\b(rock|power|heal|energy|fast|upbeat)\b/.test(t)) return 6;
  return 0;
}
function pickEstimatedBpmFromProfile(genres, artist, title, trackPosition) {
  const profile = genreBpmProfile(genres);
  const { min, center, max } = profile;
  const steps = [
    min,
    Math.round((min + center) / 2),
    center,
    Math.round((center + max) / 2),
    max
  ];
  const seed = trackPosition?.trim() ? `${trackPosition.trim()}|${title}` : title;
  const h = hashTrackSeed(artist, seed);
  let bpm = steps[h % steps.length];
  bpm = Math.round(bpm + titleBpmOffset(title));
  return Math.min(max, Math.max(min, bpm));
}
function bpmGenreFit(bpm, profile) {
  if (bpm < profile.min || bpm > profile.max) return 0;
  const dist = Math.abs(bpm - profile.center);
  return Math.max(0, 1 - dist / 35);
}
function scoreBpmCandidate(candidate, genres) {
  if (!isPlausibleTrackBpm(candidate.bpm, genres)) return -1;
  const profile = genreBpmProfile(genres);
  let score = candidate.matchScore * (SOURCE_BPM_WEIGHT[candidate.source] ?? 0.5);
  if (candidate.albumScoped) score += 0.14;
  if (candidate.positionAnchored) score += 0.1;
  score += bpmGenreFit(candidate.bpm, profile) * 0.28;
  const album = candidate.albumName ?? "";
  if (album && STUDIO_AVOID_MARKERS.test(album)) score -= 0.45;
  if (album && isCompilationAlbum(album)) {
    const farFromCenter = Math.abs(candidate.bpm - profile.center) > 25;
    if (farFromCenter) score -= 0.3;
    if (candidate.bpm > profile.max) score -= 0.25;
  } else if (!album || !isCompilationAlbum(album)) {
    if (!STUDIO_AVOID_MARKERS.test(album)) score += 0.06;
  }
  return score;
}
function scoreKeyCandidate(candidate, genres, usedKeys = []) {
  const key = toCamelotKey(candidate.camelotKey);
  if (!key) return -1;
  let score = candidate.matchScore * (SOURCE_KEY_WEIGHT[candidate.source] ?? 0.5);
  if (candidate.albumScoped) score += 0.16;
  if (candidate.positionAnchored) score += 0.1;
  if (candidate.studioAlbum) score += 0.2;
  const album = candidate.albumName ?? "";
  if (album && isCompilationAlbum(album) && !candidate.studioAlbum) score -= 0.22;
  if (album && STUDIO_AVOID_MARKERS.test(album)) score -= 0.35;
  const repeats = usedKeys.filter((k) => k === key).length;
  if (repeats >= 2) score -= 0.35;
  else if (repeats === 1) score -= 0.12;
  void genres;
  return score;
}
function pickBestBpm(candidates, genres) {
  let best;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreBpmCandidate(c, genres);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  if (best && bestScore > 0.32) return best;
  const profile = genreBpmProfile(genres);
  let fallback;
  let fallbackDist = Infinity;
  for (const c of candidates) {
    if (c.matchScore < 0.75) continue;
    const s = scoreBpmCandidate(c, genres);
    if (s < 0.28) continue;
    const dist = Math.abs(c.bpm - profile.center);
    if (dist < fallbackDist) {
      fallbackDist = dist;
      fallback = c;
    }
  }
  return fallback;
}
function pickBestKey(candidates, genres, usedKeys = []) {
  let best;
  let bestScore = -1;
  for (const c of candidates) {
    const s = scoreKeyCandidate(c, genres, usedKeys);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }
  return bestScore > 0.34 ? best : void 0;
}
function pickEstimatedCamelotKey(artist, title, genres, usedKeys = [], trackPosition) {
  if (!genres.length) return void 0;
  const base = estimateCamelotFromGenres(genres) ?? defaultCamelotForGenres(genres);
  const seed = trackPosition?.trim() ? `${trackPosition.trim()}|${title}` : title;
  return pickEstimatedCamelotFromPool(base, artist, seed, usedKeys);
}
function streamingMatchScore(wanted, got, opts) {
  const minTitle = opts?.minTitle ?? 0.92;
  const t = scoreTitleMatch(wanted.title, got.title);
  if (t < minTitle || isExtraVariant(wanted.title, got.title)) return 0;
  const wantA = wanted.artist.toLowerCase();
  const gotA = (got.artist ?? "").toLowerCase();
  let a = 0;
  if (gotA === wantA) a = 1;
  else if (gotA.includes(wantA) || wantA.includes(gotA)) a = 0.88;
  else return 0;
  let al = 0.5;
  if (wanted.album && got.album) {
    const w = wanted.album.toLowerCase();
    const g = got.album.toLowerCase();
    if (g === w) al = 1;
    else if (g.includes(w) || w.includes(g)) al = 0.9;
    else al = 0.35;
  }
  return t * 0.5 + a * 0.35 + al * 0.15;
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

// server/deezer.ts
var albumBpmCache = /* @__PURE__ */ new Map();
function albumCacheKey(artist, albumTitle) {
  return `${artist.trim().toLowerCase()}|${albumTitle.trim().toLowerCase()}`;
}
async function deezerFetch(path) {
  const res = await fetch(`https://api.deezer.com${path}`, {
    headers: { "User-Agent": "MyVinyl/1.0" }
  });
  if (!res.ok) return null;
  return res.json();
}
async function fetchTrackBpmRaw(trackId) {
  const detail = await deezerFetch(`/track/${trackId}`);
  const raw = detail?.bpm;
  if (raw == null || !Number.isFinite(raw)) return null;
  return Math.round(raw);
}
async function fetchTrackBpm(trackId, genres) {
  const bpm = await fetchTrackBpmRaw(trackId);
  if (bpm == null || !isPlausibleTrackBpm(bpm, genres)) return null;
  return bpm;
}
async function fetchBpmsParallel(rows, genres, concurrency = 6) {
  const out = /* @__PURE__ */ new Map();
  for (let i = 0; i < rows.length; i += concurrency) {
    const chunk = rows.slice(i, i + concurrency);
    const results = await Promise.all(
      chunk.map(async (row) => ({ id: row.id, bpm: await fetchTrackBpm(row.id, genres) }))
    );
    for (const { id, bpm } of results) {
      if (bpm != null) out.set(id, bpm);
    }
  }
  return out;
}
async function getDeezerAlbumBpmMap(artist, albumTitle, genres = []) {
  const key = albumCacheKey(artist, albumTitle);
  const cached = albumBpmCache.get(key);
  if (cached) return cached;
  const map = /* @__PURE__ */ new Map();
  albumBpmCache.set(key, map);
  const q1 = encodeURIComponent(`album:"${albumTitle}" artist:"${artist}"`);
  const q2 = encodeURIComponent(`${artist} ${albumTitle}`);
  const [searchA, searchB] = await Promise.all([
    deezerFetch(`/search/album?q=${q1}&limit=6`),
    deezerFetch(`/search/album?q=${q2}&limit=6`)
  ]);
  const albumHits = [...searchA?.data ?? [], ...searchB?.data ?? []];
  let bestAlbum;
  let bestAlbumScore = 0;
  for (const album of albumHits) {
    const score = scoreArtistMatch(artist, album.artist?.name ?? "") * 0.45 + scoreAlbumMatch(albumTitle, album.title) * 0.55;
    if (score > bestAlbumScore && score >= 0.9 && scoreArtistMatch(artist, album.artist?.name ?? "") >= 0.9) {
      bestAlbumScore = score;
      bestAlbum = album;
    }
  }
  if (!bestAlbum?.id) return map;
  const tracklist = await deezerFetch(
    `/album/${bestAlbum.id}/tracks?limit=100`
  );
  const rows = tracklist?.data ?? [];
  if (!rows.length) return map;
  const bpms = await fetchBpmsParallel(rows, genres);
  for (const row of rows) {
    let bpm = bpms.get(row.id);
    if (bpm == null) {
      const raw = await fetchTrackBpmRaw(row.id);
      if (raw != null) bpm = raw;
    }
    if (bpm == null) continue;
    storeInAlbumMap(map, row.title_short || row.title, row.track_position, bpm);
  }
  return map;
}
async function collectDeezerTrackCandidates(artist, title, albums, _genres = []) {
  const normalized = normalizeTrackTitle(title);
  const queries = /* @__PURE__ */ new Set([`artist:"${artist}" track:"${normalized}"`]);
  for (const album of albums) {
    if (album?.trim()) queries.add(`artist:"${artist}" track:"${normalized}" album:"${album.trim()}"`);
  }
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const query of queries) {
    const search = await deezerFetch(
      `/search?q=${encodeURIComponent(query)}&limit=10`
    );
    for (const hit of search?.data ?? []) {
      if (!hit.id || seen.has(hit.id) || isExtraVariant(normalized, hit.title_short || hit.title)) {
        continue;
      }
      const match = scoreTrackMatch(
        { artist, title: normalized, album: albums[0] },
        {
          title: hit.title_short || hit.title,
          artist: hit.artist?.name ?? "",
          album: hit.album?.title ?? ""
        },
        { minTitle: 0.92, minArtist: 0.85 }
      );
      if (match <= 0) continue;
      const bpm = hit.bpm != null ? Math.round(hit.bpm) : await fetchTrackBpmRaw(hit.id);
      if (bpm == null) continue;
      seen.add(hit.id);
      out.push({
        bpm,
        matchScore: match,
        albumName: hit.album?.title,
        trackName: hit.title_short || hit.title
      });
    }
  }
  return out;
}

// server/lastfm.ts
var LASTFM_API = "https://ws.audioscrobbler.com/2.0/";
async function lastFmFetch(apiKey, params) {
  params.set("api_key", apiKey);
  params.set("format", "json");
  const res = await fetch(`${LASTFM_API}?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.message || `Last.fm error ${data.error}`);
  if (!res.ok) throw new Error(`Last.fm request failed: ${res.status}`);
  return data;
}
function normalizeForMatch2(s) {
  return s.toLowerCase().replace(/\(.*?\)/g, " ").replace(/feat\.?.*$/i, " ").replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
function pickBestLastFmTrack(hits, artist, trackTitle, albumTitle) {
  let best;
  let bestScore = 0;
  const wantTitle = normalizeForMatch2(trackTitle);
  const wantArtist = normalizeForMatch2(artist);
  const wantAlbum = albumTitle ? normalizeForMatch2(albumTitle) : "";
  for (const hit of hits) {
    const gotTitle = normalizeForMatch2(hit.name);
    const gotArtist = normalizeForMatch2(hit.artist);
    let score = 0;
    if (gotTitle === wantTitle) score += 0.5;
    else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)) score += 0.35;
    else continue;
    if (gotArtist === wantArtist) score += 0.35;
    else if (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist)) score += 0.2;
    else continue;
    if (wantAlbum && hit.album) {
      const gotAlbum = normalizeForMatch2(hit.album);
      if (gotAlbum === wantAlbum || gotAlbum.includes(wantAlbum) || wantAlbum.includes(gotAlbum)) {
        score += 0.15;
      }
    } else if (!wantAlbum) {
      score += 0.05;
    }
    if (score > bestScore) {
      bestScore = score;
      best = hit;
    }
  }
  return bestScore >= 0.7 ? best : void 0;
}
async function searchTracks(apiKey, track, limit = 12) {
  const params = new URLSearchParams({
    method: "track.search",
    track,
    limit: String(limit)
  });
  const data = await lastFmFetch(apiKey, params);
  const results = data.results?.trackmatches?.track;
  if (!results) return [];
  const list = Array.isArray(results) ? results : [results];
  return list.filter((t) => t?.name && t?.artist).map(
    (t) => ({
      name: t.name,
      artist: t.artist,
      url: t.url,
      album: t.album
    })
  );
}
async function getTrackInfo(apiKey, artist, track, album) {
  const params = new URLSearchParams({
    method: "track.getInfo",
    artist,
    track
  });
  if (album?.trim()) params.set("album", album.trim());
  const data = await lastFmFetch(apiKey, params);
  const info = data.track;
  if (!info) return null;
  const tags = info.toptags?.tag;
  const tagList = Array.isArray(tags) ? tags : tags ? [tags] : [];
  const tagNames = tagList.filter((t) => t?.name).map((t) => t.name.toLowerCase());
  const wiki = info.wiki;
  const wikiText = wiki?.content?.replace(/<[^>]+>/g, " ") ?? "";
  return {
    tags: tagNames,
    wikiText,
    duration: typeof info.duration === "string" ? parseInt(info.duration, 10) : void 0,
    name: typeof info.name === "string" ? info.name : track,
    album: typeof info.album?.title === "string" ? info.album.title : album
  };
}
async function resolveLastFmTrack(apiKey, artist, trackTitle, albumTitle) {
  const variant = trackTitle.replace(/\(.*?\)/g, "").trim() || trackTitle;
  const direct = await getTrackInfo(apiKey, artist, variant, albumTitle);
  if (direct && (direct.wikiText || direct.tags.length)) return direct;
  const hits = await searchTracks(apiKey, `${artist} ${variant}`, 8);
  const best = pickBestLastFmTrack(hits, artist, trackTitle, albumTitle);
  if (!best) return direct;
  const resolved = await getTrackInfo(apiKey, best.artist, best.name, best.album ?? albumTitle);
  return resolved ?? direct;
}

// server/spotify.ts
var cachedToken = null;
var rateLimitedUntil = 0;
var lastSpotifyRequestAt = 0;
var SPOTIFY_MIN_INTERVAL_MS = 400;
var SPOTIFY_MAX_RETRIES = 0;
var SPOTIFY_PREVIEW_MAX_RETRIES = 2;
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
var audioFeaturesCache = /* @__PURE__ */ new Map();
var albumAudioCache = /* @__PURE__ */ new Map();
var CAMELOT = {
  "0-0": "5A",
  "0-1": "8B",
  "1-0": "12A",
  "1-1": "3B",
  "2-0": "7A",
  "2-1": "10B",
  "3-0": "2A",
  "3-1": "5B",
  "4-0": "9A",
  "4-1": "12B",
  "5-0": "4A",
  "5-1": "7B",
  "6-0": "11A",
  "6-1": "2B",
  "7-0": "6A",
  "7-1": "9B",
  "8-0": "1A",
  "8-1": "4B",
  "9-0": "8A",
  "9-1": "11B",
  "10-0": "3A",
  "10-1": "6B",
  "11-0": "10A",
  "11-1": "1B"
};
function spotifyToCamelot(key, mode) {
  if (key < 0 || key > 11) return void 0;
  return CAMELOT[`${key}-${mode}`];
}
function isRateLimited() {
  return Date.now() < rateLimitedUntil;
}
function isSpotifyRateLimited() {
  return isRateLimited();
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
function albumCacheKey2(artist, albumTitle) {
  return `${artist.trim().toLowerCase()}|${albumTitle.trim().toLowerCase()}`;
}
function featuresFromPayload(data, genres) {
  const tempo = data.tempo ? Math.round(data.tempo) : void 0;
  const camelotKey = data.key != null && data.key >= 0 && data.mode != null ? spotifyToCamelot(data.key, data.mode) : void 0;
  if (tempo == null && !camelotKey) return null;
  if (tempo != null && !isPlausibleTrackBpm(tempo, genres)) {
    if (!camelotKey) return null;
    return {
      camelotKey,
      energy: data.energy,
      danceability: data.danceability
    };
  }
  return {
    bpm: tempo,
    camelotKey,
    energy: data.energy,
    danceability: data.danceability
  };
}
async function fetchAudioFeaturesBatch(token, trackIds, genres, fetchRetries = SPOTIFY_MAX_RETRIES) {
  const out = /* @__PURE__ */ new Map();
  const pending = trackIds.filter((id) => !audioFeaturesCache.has(id));
  for (let i = 0; i < pending.length; i += 100) {
    const chunk = pending.slice(i, i + 100);
    if (!chunk.length) continue;
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/audio-features?ids=${chunk.join(",")}`,
      token,
      fetchRetries
    );
    if (res.status === 403 || !res.ok) continue;
    const body = await res.json();
    for (const row of body.audio_features ?? []) {
      if (!row?.id) continue;
      const parsed = featuresFromPayload(row, genres);
      if (parsed) {
        audioFeaturesCache.set(row.id, parsed);
        out.set(row.id, parsed);
      }
    }
  }
  for (const id of trackIds) {
    const cached = audioFeaturesCache.get(id);
    if (cached) out.set(id, cached);
  }
  return out;
}
async function getSpotifyAlbumTrackMap(clientId, clientSecret, artist, albumTitle, genres = [], fetchRetries = SPOTIFY_MAX_RETRIES) {
  const cacheKey = albumCacheKey2(artist, albumTitle);
  const cached = albumAudioCache.get(cacheKey);
  if (cached) return cached;
  const map = /* @__PURE__ */ new Map();
  albumAudioCache.set(cacheKey, map);
  const token = await getAccessToken(clientId, clientSecret);
  if (!token || isRateLimited()) return map;
  const albumQueries = [
    `album:"${albumTitle}" artist:"${artist}"`,
    `${artist} ${albumTitle}`
  ];
  let albumId;
  for (const q of albumQueries) {
    const res = await spotifyFetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=album&limit=6`,
      token,
      fetchRetries
    );
    if (!res.ok) continue;
    const data = await res.json();
    let best;
    let bestScore = 0;
    for (const album of data.albums?.items ?? []) {
      const albumArtist = album.artists?.map((a) => a.name).join(" ") ?? "";
      const aScore = scoreArtistMatch(artist, albumArtist);
      const score = aScore * 0.4 + scoreAlbumMatch(albumTitle, album.name) * 0.6;
      if (score > bestScore && score >= 0.82 && aScore >= 0.85) {
        bestScore = score;
        best = album;
      }
    }
    if (best?.id) {
      albumId = best.id;
      break;
    }
  }
  if (!albumId) return map;
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
  const ids = tracks.map((t) => t.id).filter(Boolean);
  const featuresById = await fetchAudioFeaturesBatch(token, ids, genres, fetchRetries);
  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const audio = featuresById.get(track.id);
    const seqIndex = i + 1;
    const trackNum = track.track_number ?? seqIndex;
    const payload = {
      ...audio ?? {},
      spotifyTrackId: track.id,
      spotifyTrackName: track.name,
      previewUrl: track.preview_url,
      spotifyUrl: track.external_urls?.spotify
    };
    const hasPreview = Boolean(track.preview_url);
    const hasFeatures = payload.bpm != null || Boolean(payload.camelotKey);
    if (!hasPreview && !hasFeatures) continue;
    storeInAlbumMap(map, track.name, trackNum, payload);
    if (trackNum !== seqIndex) {
      storeInAlbumMap(map, track.name, seqIndex, payload);
    }
  }
  return map;
}
async function searchTracks2(clientId, clientSecret, q, limit = 5, fetchRetries = SPOTIFY_MAX_RETRIES) {
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
async function getAudioFeatures(clientId, clientSecret, trackId, genres = []) {
  const cached = audioFeaturesCache.get(trackId);
  if (cached) return cached;
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;
  const batch = await fetchAudioFeaturesBatch(token, [trackId], genres);
  return batch.get(trackId) ?? null;
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
  const items = await searchTracks2(clientId, clientSecret, q, 20, fetchRetries);
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
async function collectSpotifyCandidates(clientId, clientSecret, artist, title, opts) {
  if (isRateLimited()) return [];
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return [];
  const genres = opts?.genres ?? [];
  const queries = [];
  const studio = opts?.studioAlbumHint?.trim();
  const album = opts?.albumTitle?.trim();
  if (studio) queries.push(`track:"${title}" artist:"${artist}" album:"${studio}"`);
  if (album && album.toLowerCase() !== studio?.toLowerCase()) {
    queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  }
  queries.push(`track:"${title}" artist:"${artist}"`);
  const seen = /* @__PURE__ */ new Set();
  const tracks = [];
  for (const q of queries) {
    const items = await searchTracks2(clientId, clientSecret, q, 10);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      tracks.push(t);
    }
  }
  let ranked = tracks.map((t) => ({
    t,
    score: scoreTrackMatch(
      { artist, title, album: album ?? studio, trackNumber: opts?.albumIndex },
      {
        title: t.name,
        artist: t.artists?.map((a) => a.name).join(" ") ?? "",
        trackNumber: t.track_number,
        album: t.album?.name
      },
      { minTitle: 0.92, minArtist: 0.85 }
    )
  })).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  if (!ranked.length) {
    ranked = tracks.slice(0, 6).map((t) => ({ t, score: 0.5 }));
  }
  const ids = ranked.map((r) => r.t.id).filter(Boolean);
  const featuresById = await fetchAudioFeaturesBatch(token, ids, genres);
  const out = [];
  for (const { t, score } of ranked) {
    const features = featuresById.get(t.id);
    if (!features || features.bpm == null && !features.camelotKey) continue;
    out.push({
      ...features,
      spotifyTrackId: t.id,
      spotifyTrackName: t.name,
      albumName: t.album?.name,
      previewUrl: t.preview_url,
      spotifyUrl: t.external_urls?.spotify
    });
    void score;
  }
  return out;
}
async function fetchSpotifyTrackKey(clientId, clientSecret, artist, title, opts) {
  if (isRateLimited()) return null;
  const token = await getAccessToken(clientId, clientSecret);
  if (!token) return null;
  const genres = opts?.genres ?? [];
  const studio = opts?.studioAlbumHint?.trim();
  const album = opts?.albumTitle?.trim();
  const queries = [];
  if (studio) queries.push(`track:"${title}" artist:"${artist}" album:"${studio}"`);
  if (album && album.toLowerCase() !== studio?.toLowerCase()) {
    queries.push(`track:"${title}" artist:"${artist}" album:"${album}"`);
  }
  queries.push(`track:"${title}" artist:"${artist}"`);
  const seen = /* @__PURE__ */ new Set();
  let best;
  for (const q of queries) {
    const items = await searchTracks2(clientId, clientSecret, q, 6);
    for (const t of items) {
      if (!t.id || seen.has(t.id) || isExtraVariant(title, t.name)) continue;
      seen.add(t.id);
      const score = scoreTrackMatch(
        { artist, title, album: studio ?? album },
        {
          title: t.name,
          artist: t.artists?.map((a) => a.name).join(" ") ?? "",
          album: t.album?.name
        },
        { minTitle: 0.92, minArtist: 0.88 }
      );
      if (score > (best?.score ?? 0)) best = { track: t, score };
    }
    if (best && best.score >= 0.94) break;
  }
  if (!best?.track.id) return null;
  const features = await getAudioFeatures(clientId, clientSecret, best.track.id, genres);
  if (!features?.camelotKey) return null;
  return {
    camelotKey: features.camelotKey,
    matchScore: best.score,
    albumName: best.track.album?.name,
    trackName: best.track.name
  };
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

// server/studio-album.ts
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
function resolveStudioAlbumTitles(artist, releaseAlbum, lastfmAlbum) {
  const out = /* @__PURE__ */ new Set();
  const compilation = isCompilationAlbum(releaseAlbum);
  if (lastfmAlbum?.trim() && !isCompilationAlbum(lastfmAlbum)) {
    out.add(lastfmAlbum.trim());
  }
  if (compilation) {
    for (const title of knownStudioAlbumsForArtist(artist)) {
      out.add(title);
    }
  }
  return [...out];
}

// server/vibe-tags.ts
var TAG_TO_VIBE = [
  ["trip-hop", "Trip-Hop"],
  ["trip hop", "Trip-Hop"],
  ["triphop", "Trip-Hop"],
  ["downtempo", "Deep"],
  ["chillout", "Chillout"],
  ["chill out", "Chillout"],
  ["stoner rock", "Stoner"],
  ["stoner", "Stoner"],
  ["nu jazz", "Soulful"],
  ["nu-jazz", "Soulful"],
  ["lounge", "Sunset"],
  ["ambient", "Deep"],
  ["soul", "Soulful"],
  ["funk", "Groovy"],
  ["disco", "Groovy"],
  ["house", "Peak-time"],
  ["deep house", "Deep"],
  ["techno", "Hypnotic"],
  ["minimal", "Hypnotic"],
  ["drum and bass", "Raw"],
  ["dnb", "Raw"],
  ["jazz", "Melodic"],
  ["hip hop", "Groovy"],
  ["hip-hop", "Groovy"],
  ["dub", "Deep"],
  ["electronic", "Hypnotic"],
  ["instrumental", "Deep"],
  ["vocal", "Soulful"]
];
var ALLOWED = /* @__PURE__ */ new Set([
  "Peak-time",
  "Warm-up",
  "Deep",
  "Melodic",
  "Raw",
  "Uplifting",
  "Late-night",
  "Sunset",
  "Warehouse",
  "Soulful",
  "Hypnotic",
  "Groovy",
  "Chillout",
  "Stoner",
  "Trip-Hop"
]);
function mapTagsToVibeHints(tags, genres = []) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const sources = [...tags, ...genres];
  for (const raw of sources) {
    const text = raw.trim().toLowerCase();
    if (!text) continue;
    for (const [needle, vibe] of TAG_TO_VIBE) {
      if (!text.includes(needle) || !ALLOWED.has(vibe) || seen.has(vibe)) continue;
      seen.add(vibe);
      out.push(vibe);
      if (out.length >= 4) return out;
    }
  }
  return out;
}

// server/enrich-candidates.ts
function indexAlbumMapWithDiscogsPositions(map, tracklist) {
  if (!tracklist?.length) return;
  const playable = tracklist.filter((t) => t.title?.trim());
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    const hit = lookupInAlbumMap(map, row.title, i + 1);
    if (hit == null) continue;
    storeInAlbumMap(map, row.title, i + 1, hit, row.position);
  }
}
function pushSpotifyAudio(bpmOut, keyOut, audio, source, matchScore, ctx) {
  if (!audio) return;
  if (audio.bpm != null) {
    bpmOut.push({
      bpm: audio.bpm,
      source,
      matchScore,
      albumScoped: ctx.albumScoped,
      positionAnchored: ctx.positionAnchored,
      albumName: ctx.albumName,
      trackName: ctx.trackName ?? audio.spotifyTrackName
    });
  }
  if (audio.camelotKey) {
    keyOut.push({
      camelotKey: audio.camelotKey,
      source,
      matchScore: ctx.studioAlbum ? matchScore + 0.05 : matchScore,
      albumScoped: ctx.albumScoped,
      positionAnchored: ctx.positionAnchored,
      albumName: ctx.albumName,
      trackName: ctx.trackName ?? audio.spotifyTrackName,
      studioAlbum: ctx.studioAlbum
    });
  }
}
function pushFromAlbumMap(bpmOut, keyOut, spotifyMap, deezerMap, lookupTitle, albumIndex, albumLookup, albumTitle, positionAnchored, studioAlbum) {
  let hasBpm = false;
  let hasKey = false;
  if (spotifyMap) {
    const hit = lookupInAlbumMap(spotifyMap, lookupTitle, albumIndex, albumLookup);
    if (hit) {
      pushSpotifyAudio(bpmOut, keyOut, hit, "spotify_album", studioAlbum ? 0.98 : 0.94, {
        albumScoped: true,
        positionAnchored,
        albumName: albumTitle,
        trackName: hit.spotifyTrackName,
        studioAlbum
      });
      hasBpm = hasBpm || hit.bpm != null;
      hasKey = hasKey || Boolean(hit.camelotKey);
    }
  }
  if (deezerMap) {
    const bpm = lookupInAlbumMap(deezerMap, lookupTitle, albumIndex, albumLookup);
    if (bpm != null) {
      bpmOut.push({
        bpm,
        source: "deezer_album",
        matchScore: studioAlbum ? 0.96 : 0.9,
        albumScoped: true,
        positionAnchored,
        albumName: albumTitle,
        trackName: lookupTitle
      });
      hasBpm = true;
    }
  }
  return { hasBpm, hasKey };
}
async function collectEnrichmentCandidates(ctx) {
  const artist = ctx.artist.trim();
  const searchTitle = normalizeTrackTitle(ctx.trackTitle.trim());
  const albumTitle = ctx.albumTitle?.trim();
  const genres = ctx.genres;
  const vinylPosition = ctx.trackPosition?.trim();
  const vibeHints = [];
  const bpmCandidates = [];
  const keyCandidates = [];
  if (!artist || !searchTitle) {
    return { bpm: bpmCandidates, key: keyCandidates, vibeHints };
  }
  const hint = resolveDiscogsHint(ctx.discogsTracklist, searchTitle, vinylPosition);
  const lookupTitle = hint?.canonicalTitle ?? searchTitle;
  const albumIndex = hint?.albumIndex;
  const lookupPosition = hint?.position ?? vinylPosition;
  const positionAnchored = Boolean(lookupPosition && hint);
  const albumLookup = { vinylPosition: lookupPosition };
  const compilation = isCompilationAlbum(albumTitle);
  const wanted = { artist, title: lookupTitle, album: albumTitle };
  if (hint) {
    const meta = extractBpmKey(void 0, [hint.row]);
    if (meta.bpm != null) {
      bpmCandidates.push({
        bpm: meta.bpm,
        source: "discogs",
        matchScore: 1,
        positionAnchored: true,
        albumScoped: true,
        albumName: albumTitle,
        trackName: hint.row.title
      });
    }
    const dk = meta.key ? toCamelotKey(meta.key) : void 0;
    if (dk) {
      keyCandidates.push({
        camelotKey: dk,
        source: "discogs",
        matchScore: 1,
        positionAnchored: true,
        albumScoped: true,
        albumName: albumTitle,
        trackName: hint.row.title
      });
    }
  }
  const SPOTIFY_ALBUM_MS = 4500;
  const DEEZER_ALBUM_MS = 5e3;
  const spotifyAlbum = (album) => {
    if (!ctx.spotifyId || !ctx.spotifySecret || isSpotifyRateLimited()) {
      return Promise.resolve(null);
    }
    return withTimeout(
      getSpotifyAlbumTrackMap(ctx.spotifyId, ctx.spotifySecret, artist, album, genres),
      SPOTIFY_ALBUM_MS,
      null
    );
  };
  const deezerAlbum = (album) => withTimeout(getDeezerAlbumBpmMap(artist, album, genres), DEEZER_ALBUM_MS, null);
  let studioAlbums = resolveStudioAlbumTitles(artist, albumTitle, void 0).slice(0, 2);
  const primaryStudio = compilation ? studioAlbums[0] : void 0;
  const lastfmAlbums = [
    ...new Set(
      [primaryStudio, albumTitle, ...studioAlbums].filter((a) => Boolean(a?.trim()))
    )
  ].slice(0, 3);
  const lastfmP = ctx.lastfmKey ? withTimeout(
    (async () => {
      for (const alb of lastfmAlbums) {
        const hit = await resolveLastFmTrack(
          ctx.lastfmKey,
          artist,
          lookupTitle,
          alb
        ).catch(() => null);
        if (!hit) continue;
        if (extractKeyFromText(hit.wikiText) || hit.tags.some((t) => extractKeyFromText(t))) {
          return hit;
        }
        if (hit.wikiText || hit.tags.length) return hit;
      }
      return resolveLastFmTrack(ctx.lastfmKey, artist, lookupTitle, albumTitle).catch(
        () => null
      );
    })(),
    5e3,
    null
  ) : Promise.resolve(null);
  const spotifyKeyP = ctx.spotifyId && ctx.spotifySecret && !isSpotifyRateLimited() ? withTimeout(
    fetchSpotifyTrackKey(ctx.spotifyId, ctx.spotifySecret, artist, lookupTitle, {
      albumTitle,
      studioAlbumHint: primaryStudio,
      genres
    }),
    4500,
    null
  ) : Promise.resolve(null);
  const releaseAlbumP = albumTitle ? Promise.all([
    compilation ? primaryStudio ? spotifyAlbum(primaryStudio) : Promise.resolve(null) : spotifyAlbum(albumTitle),
    compilation && primaryStudio ? deezerAlbum(primaryStudio) : deezerAlbum(albumTitle)
  ]) : Promise.resolve([null, null]);
  const [lastfm, releaseMaps, spotifyKeyHit] = await Promise.all([
    lastfmP,
    releaseAlbumP,
    spotifyKeyP
  ]);
  const [spotifyReleaseMap, deezerReleaseMap] = releaseMaps ?? [null, null];
  if (spotifyKeyHit?.camelotKey) {
    const onStudio = spotifyKeyHit.albumName != null && studioAlbums.some((s) => s.toLowerCase() === spotifyKeyHit.albumName.toLowerCase());
    keyCandidates.push({
      camelotKey: spotifyKeyHit.camelotKey,
      source: "spotify_track",
      matchScore: Math.max(spotifyKeyHit.matchScore, onStudio ? 0.96 : 0.9),
      albumScoped: Boolean(spotifyKeyHit.albumName),
      albumName: spotifyKeyHit.albumName,
      trackName: spotifyKeyHit.trackName,
      studioAlbum: onStudio
    });
  }
  if (lastfm?.album?.trim() && !isCompilationAlbum(lastfm.album)) {
    const fromLastFm = lastfm.album.trim();
    if (!studioAlbums.some((s) => s.toLowerCase() === fromLastFm.toLowerCase())) {
      studioAlbums.unshift(fromLastFm);
    }
  }
  const extraStudios = compilation ? studioAlbums.filter((s) => s !== primaryStudio).slice(0, 1) : [];
  const studioMaps = compilation ? await Promise.all(
    extraStudios.map(async (studio) => ({
      studio,
      sp: await spotifyAlbum(studio),
      dz: await deezerAlbum(studio)
    }))
  ) : [];
  if (spotifyReleaseMap) {
    indexAlbumMapWithDiscogsPositions(spotifyReleaseMap, ctx.discogsTracklist);
  }
  if (deezerReleaseMap) {
    indexAlbumMapWithDiscogsPositions(deezerReleaseMap, ctx.discogsTracklist);
  }
  for (const { sp, dz } of studioMaps) {
    if (sp) indexAlbumMapWithDiscogsPositions(sp, ctx.discogsTracklist);
    if (dz) indexAlbumMapWithDiscogsPositions(dz, ctx.discogsTracklist);
  }
  let hasKey = Boolean(spotifyKeyHit?.camelotKey);
  let { hasBpm, hasKey: hasKeyFromAlbum } = pushFromAlbumMap(
    bpmCandidates,
    keyCandidates,
    spotifyReleaseMap,
    deezerReleaseMap,
    lookupTitle,
    albumIndex,
    albumLookup,
    albumTitle,
    positionAnchored,
    false
  );
  hasKey = hasKey || hasKeyFromAlbum;
  for (const { studio, sp, dz } of studioMaps) {
    const studioHit = pushFromAlbumMap(
      bpmCandidates,
      keyCandidates,
      sp,
      dz,
      lookupTitle,
      albumIndex,
      albumLookup,
      studio,
      positionAnchored,
      true
    );
    if (studioHit.hasBpm) hasBpm = true;
    if (studioHit.hasKey) hasKey = true;
  }
  const needTrackSearch = !hasBpm || !hasKey;
  if (needTrackSearch && ctx.spotifyId && ctx.spotifySecret && !isSpotifyRateLimited()) {
    const studioHint = primaryStudio ?? studioAlbums[0];
    const rows = await withTimeout(
      collectSpotifyCandidates(
        ctx.spotifyId,
        ctx.spotifySecret,
        artist,
        lookupTitle,
        {
          albumTitle,
          studioAlbumHint: studioHint,
          albumIndex,
          genres
        }
      ),
      5e3,
      []
    );
    const seenIds = /* @__PURE__ */ new Set();
    for (const row of rows) {
      if (row.spotifyTrackId && seenIds.has(row.spotifyTrackId)) continue;
      if (row.spotifyTrackId) seenIds.add(row.spotifyTrackId);
      const name = row.spotifyTrackName ?? lookupTitle;
      if (isExtraVariant(lookupTitle, name)) continue;
      const match = streamingMatchScore(
        wanted,
        { title: name, artist, album: row.albumName },
        { minTitle: 0.92 }
      );
      if (match <= 0) continue;
      const onStudio = row.albumName != null && studioAlbums.some(
        (s) => s.toLowerCase() === row.albumName.toLowerCase()
      );
      pushSpotifyAudio(bpmCandidates, keyCandidates, row, "spotify_track", match, {
        albumScoped: Boolean(row.albumName),
        positionAnchored: false,
        albumName: row.albumName,
        trackName: name,
        studioAlbum: onStudio
      });
      if (row.bpm != null) hasBpm = true;
      if (row.camelotKey) hasKey = true;
    }
  }
  const deezerSearchAlbums = [albumTitle, ...studioAlbums].filter(
    (a) => Boolean(a?.trim())
  );
  if (!hasBpm || !hasKey) {
    const deezerTracks = await withTimeout(
      collectDeezerTrackCandidates(artist, lookupTitle, deezerSearchAlbums, genres),
      5e3,
      []
    );
    for (const row of deezerTracks) {
      if (row.bpm != null) {
        bpmCandidates.push({
          bpm: row.bpm,
          source: "deezer_track",
          matchScore: row.matchScore,
          albumName: row.albumName,
          trackName: row.trackName
        });
        hasBpm = true;
      }
    }
  }
  if (lastfm) {
    for (const vibe of mapTagsToVibeHints(lastfm.tags, genres)) {
      if (!vibeHints.includes(vibe)) vibeHints.push(vibe);
    }
    const wikiBpm = extractBpmFromText(lastfm.wikiText);
    if (wikiBpm != null) {
      bpmCandidates.push({
        bpm: wikiBpm,
        source: "lastfm",
        matchScore: 0.82,
        albumName: lastfm.album,
        trackName: lastfm.name
      });
    }
    const wikiKey = extractKeyFromText(lastfm.wikiText);
    if (wikiKey) {
      keyCandidates.push({
        camelotKey: wikiKey,
        source: "lastfm",
        matchScore: 0.8
      });
    }
    for (const tag of lastfm.tags) {
      const tagBpm = extractBpmFromText(tag);
      if (tagBpm != null) {
        bpmCandidates.push({ bpm: tagBpm, source: "lastfm", matchScore: 0.65 });
      }
      const tagKey = extractKeyFromText(tag);
      if (tagKey) {
        keyCandidates.push({ camelotKey: tagKey, source: "lastfm", matchScore: 0.62 });
      }
    }
  }
  let spotifyPreviewUrl;
  let spotifyTrackId;
  if (spotifyReleaseMap) {
    const hit = lookupInAlbumMap(
      spotifyReleaseMap,
      lookupTitle,
      albumIndex,
      albumLookup
    );
    if (hit?.previewUrl && hit.spotifyTrackId && hit.spotifyTrackName && albumTitle && strictCatalogTrackMatch(
      { artist, title: lookupTitle, album: albumTitle },
      {
        title: hit.spotifyTrackName,
        artist,
        album: hit.albumName ?? albumTitle
      }
    )) {
      spotifyPreviewUrl = hit.previewUrl;
      spotifyTrackId = hit.spotifyTrackId;
    }
  }
  if (!spotifyPreviewUrl && albumTitle && ctx.spotifyId && ctx.spotifySecret && !isSpotifyRateLimited()) {
    const previewHit = await withTimeout(
      resolveTrackPreview(ctx.spotifyId, ctx.spotifySecret, artist, lookupTitle, albumTitle, {
        albumIndex,
        fetchRetries: 0
      }),
      5e3,
      null
    );
    if (previewHit?.previewUrl) {
      spotifyPreviewUrl = previewHit.previewUrl;
      spotifyTrackId = previewHit.spotifyTrackId;
    }
  }
  if (!vibeHints.length) {
    for (const vibe of mapTagsToVibeHints([], genres)) {
      vibeHints.push(vibe);
    }
  }
  return { bpm: bpmCandidates, key: keyCandidates, vibeHints, spotifyPreviewUrl, spotifyTrackId };
}

// server/enrich-track.ts
async function resolveTrackEnrichment(opts) {
  const albumTitle = (opts.discogsReleaseTitle ?? opts.albumTitle)?.trim();
  const genres = opts.genres ?? [];
  const keyFallback = opts.keyFallback === true;
  const usedKeys = opts.usedKeys ?? [];
  const {
    bpm: bpmCandidates,
    key: keyCandidates,
    vibeHints,
    spotifyPreviewUrl,
    spotifyTrackId
  } = await collectEnrichmentCandidates({
    artist: opts.artist,
    trackTitle: opts.trackTitle,
    albumTitle,
    trackPosition: opts.trackPosition,
    genres,
    discogsTracklist: opts.discogsTracklist,
    spotifyId: opts.spotifyId,
    spotifySecret: opts.spotifySecret,
    lastfmKey: opts.lastfmKey,
    usedKeys
  });
  const bestBpm = pickBestBpm(bpmCandidates, genres);
  const bestKey = pickBestKey(keyCandidates, genres, usedKeys);
  let camelotKey = bestKey ? toCamelotKey(bestKey.camelotKey) : void 0;
  let keyEstimated = false;
  if (!camelotKey && keyFallback && genres.length) {
    camelotKey = pickEstimatedCamelotKey(
      opts.artist,
      opts.trackTitle,
      genres,
      usedKeys,
      opts.trackPosition
    );
    if (camelotKey) keyEstimated = true;
  }
  let bpm = bestBpm?.bpm;
  let bpmEstimated = false;
  if (bestBpm && scoreBpmCandidate(bestBpm, genres) < 0.28) {
    bpm = void 0;
  }
  if (bpm == null && genres.length) {
    bpm = pickEstimatedBpmFromProfile(
      genres,
      opts.artist,
      opts.trackTitle,
      opts.trackPosition
    );
    bpmEstimated = true;
  }
  return {
    bpm,
    camelotKey,
    vibeTags: vibeHints.slice(0, 6),
    bpmEstimated,
    keyEstimated,
    trackSpecific: Boolean(
      bestBpm && !bpmEstimated && bestBpm.source !== "lastfm" || bestKey && !keyEstimated
    ),
    spotifyPreviewUrl,
    spotifyTrackId
  };
}

// server/handlers/enrich.ts
var discogsReleaseCache = /* @__PURE__ */ new Map();
var DISCOGS_CACHE_MS = 15 * 60 * 1e3;
var EnrichValidationError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "EnrichValidationError";
  }
};
function parseStringList(value) {
  if (!Array.isArray(value)) return void 0;
  return value.map((item) => String(item).trim()).filter(Boolean);
}
function parseTracklist(value) {
  if (!Array.isArray(value)) return void 0;
  const rows = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const title = "title" in row ? String(row.title ?? "").trim() : "";
    if (!title) continue;
    const position = "position" in row && row.position != null ? String(row.position).trim() || void 0 : void 0;
    rows.push(position ? { title, position } : { title });
  }
  return rows.length ? rows : void 0;
}
function parseReleasePayload(value) {
  if (!value || typeof value !== "object") return void 0;
  const release = value;
  return {
    genres: parseStringList(release.genres),
    coverUrl: typeof release.coverUrl === "string" ? release.coverUrl.trim() || void 0 : void 0,
    releaseTitle: typeof release.releaseTitle === "string" ? release.releaseTitle.trim() || void 0 : typeof release.title === "string" ? release.title.trim() || void 0 : void 0,
    tracklist: parseTracklist(release.tracklist)
  };
}
function parseDiscogsId(value) {
  if (value == null || value === "") return void 0;
  const id = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isFinite(id) && id > 0 ? id : void 0;
}
function parseBoolean(value, defaultValue) {
  if (value === void 0 || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value === "1" || value.toLowerCase() === "true") return true;
    if (value === "0" || value.toLowerCase() === "false") return false;
  }
  return defaultValue;
}
function parseEnrichBody(body) {
  if (!body || typeof body !== "object") {
    throw new EnrichValidationError("Request body must be a JSON object");
  }
  const data = body;
  const artist = typeof data.artist === "string" ? data.artist.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  if (!artist || !title) {
    throw new EnrichValidationError("artist and title are required");
  }
  return {
    artist,
    title,
    album: typeof data.album === "string" ? data.album.trim() || void 0 : void 0,
    position: typeof data.position === "string" ? data.position.trim() || void 0 : void 0,
    discogsId: parseDiscogsId(data.discogsId),
    genres: parseStringList(data.genres),
    usedKeys: parseStringList(data.usedKeys),
    trackOnly: parseBoolean(data.trackOnly, true),
    keyFallback: parseBoolean(data.keyFallback, true),
    release: parseReleasePayload(data.release)
  };
}
function parseEnrichQuery(query) {
  const pick = (key) => {
    const value = query[key];
    if (Array.isArray(value)) return value[0];
    return value;
  };
  const artist = pick("artist")?.trim() ?? "";
  const title = pick("title")?.trim() ?? "";
  if (!artist || !title) {
    throw new EnrichValidationError("artist and title are required");
  }
  const genresParam = pick("genres");
  const usedKeysParam = pick("usedKeys");
  const genreFallback = pick("genreFallback") === "1";
  return {
    artist,
    title,
    album: pick("album")?.trim() || void 0,
    position: pick("position")?.trim() || void 0,
    discogsId: parseDiscogsId(pick("discogsId")),
    genres: genresParam ? genresParam.split(",").map((g) => g.trim()).filter(Boolean) : void 0,
    usedKeys: usedKeysParam ? usedKeysParam.split(",").map((k) => k.trim()).filter(Boolean) : void 0,
    trackOnly: !genreFallback,
    keyFallback: pick("keyFallback") === "1" || genreFallback
  };
}
async function getCachedDiscogsRelease(token, id) {
  const hit = discogsReleaseCache.get(id);
  if (hit && hit.expires > Date.now()) return hit;
  try {
    const release = await getRelease(token, id);
    const entry = {
      coverUrl: resolveDiscogsCoverUrl(bestCoverImage(release.images)),
      genres: [...release.genres || [], ...release.styles || []],
      releaseTitle: release.title?.trim() || void 0,
      tracklist: release.tracklist,
      expires: Date.now() + DISCOGS_CACHE_MS
    };
    discogsReleaseCache.set(id, entry);
    return entry;
  } catch {
    return null;
  }
}
async function resolveReleaseContext(input, discogsToken) {
  const fromClient = input.release;
  let coverUrl = resolveDiscogsCoverUrl(fromClient?.coverUrl);
  let genres = [...input.genres ?? [], ...fromClient?.genres ?? []].filter(Boolean);
  let discogsTracklist = fromClient?.tracklist;
  let discogsReleaseTitle = fromClient?.releaseTitle;
  if (input.discogsId && discogsToken) {
    const cached = await getCachedDiscogsRelease(discogsToken, input.discogsId);
    if (cached) {
      coverUrl = coverUrl ?? cached.coverUrl;
      genres = cached.genres.length ? cached.genres : genres;
      discogsTracklist = discogsTracklist ?? cached.tracklist;
      discogsReleaseTitle = discogsReleaseTitle ?? cached.releaseTitle;
    }
  }
  return {
    coverUrl,
    genres: [...new Set(genres)].slice(0, 12),
    discogsTracklist,
    discogsReleaseTitle
  };
}
async function handleEnrich(input, env) {
  const positionSeed = input.position;
  const usedKeys = input.usedKeys ?? [];
  const keyFallback = input.keyFallback !== false;
  const { coverUrl, genres, discogsTracklist, discogsReleaseTitle } = await resolveReleaseContext(input, env.discogsToken);
  const trackMeta = await withTimeout(
    resolveTrackEnrichment({
      artist: input.artist,
      trackTitle: input.title,
      albumTitle: input.album,
      discogsReleaseTitle,
      trackPosition: positionSeed,
      genres,
      discogsTracklist,
      spotifyId: env.spotifyId,
      spotifySecret: env.spotifySecret,
      lastfmKey: env.lastfmKey,
      trackOnly: input.trackOnly !== false,
      keyFallback,
      usedKeys
    }),
    12e3,
    {
      vibeTags: [],
      bpm: genres.length ? pickEstimatedBpmFromProfile(genres, input.artist, input.title, positionSeed) : void 0,
      bpmEstimated: genres.length > 0,
      camelotKey: genres.length ? pickEstimatedCamelotKey(input.artist, input.title, genres, usedKeys, positionSeed) : void 0,
      keyEstimated: genres.length > 0,
      trackSpecific: false
    }
  );
  return {
    coverUrl,
    genres,
    bpm: trackMeta.bpm,
    camelotKey: trackMeta.camelotKey,
    musicalKey: trackMeta.musicalKey,
    vibeTags: [...trackMeta.vibeTags],
    bpmEstimated: trackMeta.bpmEstimated,
    keyEstimated: trackMeta.keyEstimated,
    trackSpecific: trackMeta.trackSpecific,
    spotifyPreviewUrl: trackMeta.spotifyPreviewUrl,
    spotifyTrackId: trackMeta.spotifyTrackId
  };
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

// scripts/api-entries/enrich.entry.ts
var ROUTE = "api/enrich";
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
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, ROUTE, 405, { error: "Method not allowed" });
  }
  try {
    logApiEnvStatus(ROUTE);
    const env = getApiEnv();
    const input = req.method === "POST" ? parseEnrichBody(parseRequestBody(req)) : parseEnrichQuery(
      Object.fromEntries(
        Object.entries(req.query ?? {}).map(([k, v]) => [
          k,
          Array.isArray(v) ? v[0] : v
        ])
      )
    );
    const result = await handleEnrich(input, {
      discogsToken: env.discogsToken,
      spotifyId: env.spotifyId,
      spotifySecret: env.spotifySecret,
      lastfmKey: env.lastfmKey
    });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof EnrichValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method, query: req.query });
    const message = error instanceof Error ? error.message : "Internal error";
    return json(res, ROUTE, 500, { error: message });
  }
}
export {
  handler as default
};
