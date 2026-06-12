import { extractBpmFromText } from './bpm';
import { extractBpmKey } from './discogs';
import { collectDeezerTrackCandidates, getDeezerAlbumBpmMap } from './deezer';
import { extractKeyFromText, toCamelotKey } from './key';
import { resolveLastFmTrack } from './lastfm';
import { withTimeout } from './enrich-timeout';
import {
  collectSpotifyCandidates,
  fetchSpotifyTrackKey,
  getSpotifyAlbumTrackMap,
  isSpotifyRateLimited,
  resolveTrackPreview,
  type SpotifyTrackAudio,
} from './spotify';
import { resolveStudioAlbumTitles } from './studio-album';
import {
  lookupInAlbumMap,
  resolveDiscogsHint,
  strictCatalogTrackMatch,
  storeInAlbumMap,
  type DiscogsTrackRow,
} from './track-match';
import {
  type BpmCandidate,
  type KeyCandidate,
  isCompilationAlbum,
  streamingMatchScore,
} from './enrich-scoring';
import { normalizeTrackTitle } from './track-title';
import { isExtraVariant } from './track-match';
import { mapTagsToVibeHints } from './vibe-tags';


export type CollectContext = {
  artist: string;
  trackTitle: string;
  albumTitle?: string;
  trackPosition?: string;
  genres: string[];
  discogsTracklist?: DiscogsTrackRow[];
  spotifyId?: string;
  spotifySecret?: string;
  lastfmKey?: string;
  /** Camelot codes already used on this release — de-prioritize repeats */
  usedKeys?: string[];
};

function indexAlbumMapWithDiscogsPositions<T>(
  map: Map<string, T>,
  tracklist: DiscogsTrackRow[] | undefined
): void {
  if (!tracklist?.length) return;
  const playable = tracklist.filter((t) => t.title?.trim());
  for (let i = 0; i < playable.length; i++) {
    const row = playable[i];
    const hit = lookupInAlbumMap(map, row.title, i + 1);
    if (hit == null) continue;
    storeInAlbumMap(map, row.title, i + 1, hit, row.position);
  }
}

function pushSpotifyAudio(
  bpmOut: BpmCandidate[],
  keyOut: KeyCandidate[],
  audio: SpotifyTrackAudio | null | undefined,
  source: 'spotify_album' | 'spotify_track',
  matchScore: number,
  ctx: {
    albumScoped: boolean;
    positionAnchored: boolean;
    albumName?: string;
    trackName?: string;
    studioAlbum?: boolean;
  }
): void {
  if (!audio) return;
  if (audio.bpm != null) {
    bpmOut.push({
      bpm: audio.bpm,
      source,
      matchScore,
      albumScoped: ctx.albumScoped,
      positionAnchored: ctx.positionAnchored,
      albumName: ctx.albumName,
      trackName: ctx.trackName ?? audio.spotifyTrackName,
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
      studioAlbum: ctx.studioAlbum,
    });
  }
}

function pushFromAlbumMap(
  bpmOut: BpmCandidate[],
  keyOut: KeyCandidate[],
  spotifyMap: Map<string, SpotifyTrackAudio> | null,
  deezerMap: Map<string, number> | null,
  lookupTitle: string,
  albumIndex: number | undefined,
  albumLookup: { vinylPosition?: string },
  albumTitle: string | undefined,
  positionAnchored: boolean,
  studioAlbum?: boolean
): { hasBpm: boolean; hasKey: boolean } {
  let hasBpm = false;
  let hasKey = false;

  if (spotifyMap) {
    const hit = lookupInAlbumMap(spotifyMap, lookupTitle, albumIndex, albumLookup);
    if (hit) {
      pushSpotifyAudio(bpmOut, keyOut, hit, 'spotify_album', studioAlbum ? 0.98 : 0.94, {
        albumScoped: true,
        positionAnchored,
        albumName: albumTitle,
        trackName: hit.spotifyTrackName,
        studioAlbum,
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
        source: 'deezer_album',
        matchScore: studioAlbum ? 0.96 : 0.9,
        albumScoped: true,
        positionAnchored,
        albumName: albumTitle,
        trackName: lookupTitle,
      });
      hasBpm = true;
    }
  }

  return { hasBpm, hasKey };
}

/** Gather BPM + key candidates from all APIs; caller scores and picks best. */
export async function collectEnrichmentCandidates(
  ctx: CollectContext
): Promise<{
  bpm: BpmCandidate[];
  key: KeyCandidate[];
  vibeHints: string[];
  spotifyPreviewUrl?: string;
  spotifyTrackId?: string;
}> {
  const artist = ctx.artist.trim();
  const searchTitle = normalizeTrackTitle(ctx.trackTitle.trim());
  const albumTitle = ctx.albumTitle?.trim();
  const genres = ctx.genres;
  const vinylPosition = ctx.trackPosition?.trim();
  const vibeHints: string[] = [];

  const bpmCandidates: BpmCandidate[] = [];
  const keyCandidates: KeyCandidate[] = [];

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
    const meta = extractBpmKey(undefined, [hint.row]);
    if (meta.bpm != null) {
      bpmCandidates.push({
        bpm: meta.bpm,
        source: 'discogs',
        matchScore: 1,
        positionAnchored: true,
        albumScoped: true,
        albumName: albumTitle,
        trackName: hint.row.title,
      });
    }
    const dk = meta.key ? toCamelotKey(meta.key) : undefined;
    if (dk) {
      keyCandidates.push({
        camelotKey: dk,
        source: 'discogs',
        matchScore: 1,
        positionAnchored: true,
        albumScoped: true,
        albumName: albumTitle,
        trackName: hint.row.title,
      });
    }
  }

  const SPOTIFY_ALBUM_MS = 4500;
  const DEEZER_ALBUM_MS = 5000;

  const spotifyAlbum = (
    album: string
  ): Promise<Map<string, SpotifyTrackAudio> | null> => {
    if (!ctx.spotifyId || !ctx.spotifySecret || isSpotifyRateLimited()) {
      return Promise.resolve(null);
    }
    return withTimeout(
      getSpotifyAlbumTrackMap(ctx.spotifyId, ctx.spotifySecret, artist, album, genres),
      SPOTIFY_ALBUM_MS,
      null
    );
  };

  const deezerAlbum = (album: string): Promise<Map<string, number> | null> =>
    withTimeout(getDeezerAlbumBpmMap(artist, album, genres), DEEZER_ALBUM_MS, null);

  let studioAlbums = resolveStudioAlbumTitles(artist, albumTitle, undefined).slice(0, 2);
  const primaryStudio = compilation ? studioAlbums[0] : undefined;

  const lastfmAlbums = [
    ...new Set(
      [primaryStudio, albumTitle, ...studioAlbums].filter((a): a is string => Boolean(a?.trim()))
    ),
  ].slice(0, 3);

  const lastfmP = ctx.lastfmKey
    ? withTimeout(
        (async () => {
          for (const alb of lastfmAlbums) {
            const hit = await resolveLastFmTrack(
              ctx.lastfmKey!,
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
          return resolveLastFmTrack(ctx.lastfmKey!, artist, lookupTitle, albumTitle).catch(
            () => null
          );
        })(),
        5000,
        null
      )
    : Promise.resolve(null);

  const spotifyKeyP =
    ctx.spotifyId && ctx.spotifySecret && !isSpotifyRateLimited()
      ? withTimeout(
          fetchSpotifyTrackKey(ctx.spotifyId, ctx.spotifySecret, artist, lookupTitle, {
            albumTitle,
            studioAlbumHint: primaryStudio,
            genres,
          }),
          4500,
          null
        )
      : Promise.resolve(null);

  const releaseAlbumP = albumTitle
    ? Promise.all([
        compilation
          ? primaryStudio
            ? spotifyAlbum(primaryStudio)
            : Promise.resolve(null)
          : spotifyAlbum(albumTitle),
        compilation && primaryStudio
          ? deezerAlbum(primaryStudio)
          : deezerAlbum(albumTitle),
      ])
    : Promise.resolve([null, null] as const);

  const [lastfm, releaseMaps, spotifyKeyHit] = await Promise.all([
    lastfmP,
    releaseAlbumP,
    spotifyKeyP,
  ]);
  const [spotifyReleaseMap, deezerReleaseMap] = releaseMaps ?? [null, null];

  if (spotifyKeyHit?.camelotKey) {
    const onStudio =
      spotifyKeyHit.albumName != null &&
      studioAlbums.some((s) => s.toLowerCase() === spotifyKeyHit.albumName!.toLowerCase());
    keyCandidates.push({
      camelotKey: spotifyKeyHit.camelotKey,
      source: 'spotify_track',
      matchScore: Math.max(spotifyKeyHit.matchScore, onStudio ? 0.96 : 0.9),
      albumScoped: Boolean(spotifyKeyHit.albumName),
      albumName: spotifyKeyHit.albumName,
      trackName: spotifyKeyHit.trackName,
      studioAlbum: onStudio,
    });
  }

  if (lastfm?.album?.trim() && !isCompilationAlbum(lastfm.album)) {
    const fromLastFm = lastfm.album.trim();
    if (!studioAlbums.some((s) => s.toLowerCase() === fromLastFm.toLowerCase())) {
      studioAlbums.unshift(fromLastFm);
    }
  }

  const extraStudios = compilation
    ? studioAlbums.filter((s) => s !== primaryStudio).slice(0, 1)
    : [];

  const studioMaps = compilation
    ? await Promise.all(
        extraStudios.map(async (studio) => ({
          studio,
          sp: await spotifyAlbum(studio),
          dz: await deezerAlbum(studio),
        }))
      )
    : [];

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
        genres,
      }
      ),
      5000,
      [] as SpotifyTrackAudio[]
    );
    const seenIds = new Set<string>();
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

      const onStudio =
        row.albumName != null &&
        studioAlbums.some(
          (s) => s.toLowerCase() === row.albumName!.toLowerCase()
        );

      pushSpotifyAudio(bpmCandidates, keyCandidates, row, 'spotify_track', match, {
        albumScoped: Boolean(row.albumName),
        positionAnchored: false,
        albumName: row.albumName,
        trackName: name,
        studioAlbum: onStudio,
      });
      if (row.bpm != null) hasBpm = true;
      if (row.camelotKey) hasKey = true;
    }
  }

  const deezerSearchAlbums = [albumTitle, ...studioAlbums].filter((a): a is string =>
    Boolean(a?.trim())
  );
  if (!hasBpm || !hasKey) {
    const deezerTracks = await withTimeout(
      collectDeezerTrackCandidates(artist, lookupTitle, deezerSearchAlbums, genres),
      5000,
      []
    );
    for (const row of deezerTracks) {
      if (row.bpm != null) {
        bpmCandidates.push({
          bpm: row.bpm,
          source: 'deezer_track',
          matchScore: row.matchScore,
          albumName: row.albumName,
          trackName: row.trackName,
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
        source: 'lastfm',
        matchScore: 0.82,
        albumName: lastfm.album,
        trackName: lastfm.name,
      });
    }
    const wikiKey = extractKeyFromText(lastfm.wikiText);
    if (wikiKey) {
      keyCandidates.push({
        camelotKey: wikiKey,
        source: 'lastfm',
        matchScore: 0.8,
      });
    }
    for (const tag of lastfm.tags) {
      const tagBpm = extractBpmFromText(tag);
      if (tagBpm != null) {
        bpmCandidates.push({ bpm: tagBpm, source: 'lastfm', matchScore: 0.65 });
      }
      const tagKey = extractKeyFromText(tag);
      if (tagKey) {
        keyCandidates.push({ camelotKey: tagKey, source: 'lastfm', matchScore: 0.62 });
      }
    }
  }

  let spotifyPreviewUrl: string | undefined;
  let spotifyTrackId: string | undefined;
  if (spotifyReleaseMap) {
    const hit = lookupInAlbumMap(
      spotifyReleaseMap,
      lookupTitle,
      albumIndex,
      albumLookup
    );
    if (
      hit?.previewUrl &&
      hit.spotifyTrackId &&
      hit.spotifyTrackName &&
      albumTitle &&
      strictCatalogTrackMatch(
        { artist, title: lookupTitle, album: albumTitle },
        {
          title: hit.spotifyTrackName,
          artist,
          album: hit.albumName ?? albumTitle,
        }
      )
    ) {
      spotifyPreviewUrl = hit.previewUrl;
      spotifyTrackId = hit.spotifyTrackId;
    }
  }

  if (
    !spotifyPreviewUrl &&
    albumTitle &&
    ctx.spotifyId &&
    ctx.spotifySecret &&
    !isSpotifyRateLimited()
  ) {
    const previewHit = await withTimeout(
      resolveTrackPreview(ctx.spotifyId, ctx.spotifySecret, artist, lookupTitle, albumTitle, {
        albumIndex,
        fetchRetries: 0,
      }),
      5000,
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