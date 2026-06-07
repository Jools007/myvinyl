import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import { resolveDiscogsCoverUrl } from '../src/lib/discogsCover';
import { bestCoverImage, getRelease } from './discogs';
import { pickEstimatedBpmFromProfile, pickEstimatedCamelotKey } from './enrich-scoring';
import { withTimeout } from './enrich-timeout';
import { resolveTrackEnrichment } from './enrich-track';
import { resolvePlayableAudio } from './play-audio';
import {
  getSpotifyRateLimitRetrySec,
  isSpotifyRateLimited,
  resolveTrackPreview,
} from './spotify';
import { getAlbumInfo, getSimilarArtists, getSimilarTracks, getTopTracksByTag } from './lastfm';

type Env = Record<string, string>;

type CachedDiscogsRelease = {
  coverUrl?: string;
  genres: string[];
  notes?: string;
  releaseTitle?: string;
  tracklist?: { title: string; position?: string }[];
  expires: number;
};

const discogsReleaseCache = new Map<number, CachedDiscogsRelease>();
const DISCOGS_CACHE_MS = 15 * 60 * 1000;

async function getCachedDiscogsRelease(token: string, id: number): Promise<CachedDiscogsRelease | null> {
  const hit = discogsReleaseCache.get(id);
  if (hit && hit.expires > Date.now()) return hit;

  try {
    const release = await getRelease(token, id);
    const entry: CachedDiscogsRelease = {
      coverUrl: resolveDiscogsCoverUrl(bestCoverImage(release.images)),
      genres: [...(release.genres || []), ...(release.styles || [])],
      notes: release.notes,
      releaseTitle: release.title?.trim() || undefined,
      tracklist: release.tracklist,
      expires: Date.now() + DISCOGS_CACHE_MS,
    };
    discogsReleaseCache.set(id, entry);
    return entry;
  } catch {
    return null;
  }
}

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost');
}

export function apiPlugin(env: Env): Plugin {
  return {
    name: 'myvinyl-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = parseUrl(req);
        const path = url.pathname;

        if (!path.startsWith('/api/')) return next();

        const discogsToken = env.DISCOGS_TOKEN;
        const lastfmKey = env.LASTFM_API_KEY;
        const spotifyId = env.SPOTIFY_CLIENT_ID;
        const spotifySecret = env.SPOTIFY_CLIENT_SECRET;
        const youtubeApiKey = env.YOUTUBE_API_KEY;

        try {
          // ── Album description (Discogs notes + Last.fm wiki) ──
          if (path === '/api/album-info' && req.method === 'GET') {
            const artist = url.searchParams.get('artist')?.trim();
            const album = url.searchParams.get('album')?.trim();
            const discogsNotes = url.searchParams.get('discogsNotes')?.trim();
            if (!artist || !album) return json(res, 400, { error: 'artist and album required' });

            let description = discogsNotes?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? '';

            if (lastfmKey) {
              try {
                const info = await withTimeout(getAlbumInfo(lastfmKey, artist, album), 6000, null);
                const wiki = info?.wikiText?.replace(/\s+/g, ' ').trim();
                if (wiki && wiki.length > (description?.length ?? 0)) {
                  description = wiki;
                }
              } catch {
                /* optional */
              }
            }

            if (description.length > 520) {
              description = `${description.slice(0, 517).trim()}…`;
            }

            return json(res, 200, { description: description || null });
          }

          // ── Spotify audio features ──
          if (path === '/api/spotify/audio' && req.method === 'GET') {
            if (!spotifyId || !spotifySecret) {
              return json(res, 503, { error: 'Spotify credentials not configured' });
            }
            const artist = url.searchParams.get('artist');
            const title = url.searchParams.get('title') || url.searchParams.get('album');
            if (!artist?.trim() || !title?.trim()) {
              return json(res, 400, { error: 'artist and title required' });
            }
            const album = url.searchParams.get('album')?.trim();
            if (!album) {
              return json(res, 400, {
                error: 'album is required — use the release title from the collection',
              });
            }
            const albumIndexRaw = url.searchParams.get('albumIndex');
            const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : undefined;
            const spotifyTrackId = url.searchParams.get('spotifyTrackId')?.trim();
            const audio = await resolveTrackPreview(
              spotifyId,
              spotifySecret,
              artist.trim(),
              title.trim(),
              album,
              {
                fetchRetries: 2,
                spotifyTrackId: spotifyTrackId || undefined,
                albumIndex:
                  albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0
                    ? albumIndex
                    : undefined,
              }
            );
            if (!audio?.previewUrl) {
              if (isSpotifyRateLimited()) {
                return json(res, 503, {
                  error: 'Spotify is temporarily rate-limited — try again in a few seconds',
                  retryAfterSec: getSpotifyRateLimitRetrySec(),
                });
              }
              return json(res, 404, { error: 'No Spotify preview found' });
            }
            return json(res, 200, audio);
          }

          // ── Play audio: aggressive Spotify + YouTube lookup ──
          if (path === '/api/play/audio' && req.method === 'GET') {
            const artist = url.searchParams.get('artist')?.trim();
            const title = url.searchParams.get('title')?.trim();
            if (!artist || !title) {
              return json(res, 400, { error: 'artist and title required' });
            }
            const album = url.searchParams.get('album')?.trim() || undefined;
            const albumIndexRaw = url.searchParams.get('albumIndex');
            const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : undefined;
            const spotifyTrackId = url.searchParams.get('spotifyTrackId')?.trim();

            const playback = await resolvePlayableAudio({
              artist,
              title,
              album,
              albumIndex:
                albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0
                  ? albumIndex
                  : undefined,
              spotifyTrackId: spotifyTrackId || undefined,
              spotifyId,
              spotifySecret,
              youtubeApiKey,
            });

            if (playback) return json(res, 200, playback);

            if (isSpotifyRateLimited()) {
              return json(res, 503, {
                error: 'Spotify is temporarily rate-limited — try again in a few seconds',
                retryAfterSec: getSpotifyRateLimitRetrySec(),
              });
            }

            return json(res, 404, { error: 'No playable audio found' });
          }

          // ── Enrich (Discogs + Spotify + Last.fm combined) ──
          if (path === '/api/enrich' && req.method === 'GET') {
            const artist = url.searchParams.get('artist')?.trim();
            const title = url.searchParams.get('title')?.trim();
            const album = url.searchParams.get('album')?.trim();
            const trackPosition = url.searchParams.get('position')?.trim();
            const positionSeed = trackPosition || undefined;
            const usedKeysParam = url.searchParams.get('usedKeys');
            const usedKeys = usedKeysParam
              ? usedKeysParam.split(',').map((k) => k.trim()).filter(Boolean)
              : undefined;
            const discogsId = url.searchParams.get('discogsId');
            const genresParam = url.searchParams.get('genres');
            if (!artist || !title) return json(res, 400, { error: 'artist and title required' });

            let coverUrl: string | undefined;
            let genres: string[] = genresParam
              ? genresParam
                  .split(',')
                  .map((g) => g.trim())
                  .filter(Boolean)
              : [];
            let discogsTracklist: { title: string; position?: string }[] | undefined;
            let discogsReleaseTitle: string | undefined;

            if (discogsId && discogsToken) {
              const cached = await getCachedDiscogsRelease(
                discogsToken,
                parseInt(discogsId, 10)
              );
              if (cached) {
                coverUrl = cached.coverUrl;
                genres = cached.genres.length ? cached.genres : genres;
                discogsTracklist = cached.tracklist;
                discogsReleaseTitle = cached.releaseTitle;
              }
            }

            const genreFallback = url.searchParams.get('genreFallback') === '1';
            const keyFallback =
              url.searchParams.get('keyFallback') === '1' || genreFallback;
            const trackMeta = await withTimeout(
              resolveTrackEnrichment({
                artist,
                trackTitle: title,
                albumTitle: album || undefined,
                discogsReleaseTitle,
                trackPosition: positionSeed,
                genres,
                discogsTracklist,
                spotifyId,
                spotifySecret,
                lastfmKey,
                trackOnly: !genreFallback,
                keyFallback,
                usedKeys,
              }),
              8_000,
              {
                vibeTags: [],
                bpm: genres.length
                  ? pickEstimatedBpmFromProfile(genres, artist, title, positionSeed)
                  : undefined,
                bpmEstimated: genres.length > 0,
                camelotKey: genres.length
                  ? pickEstimatedCamelotKey(artist, title, genres, usedKeys, positionSeed)
                  : undefined,
                keyEstimated: genres.length > 0,
                trackSpecific: false,
              }
            );

            const vibeTags = [...trackMeta.vibeTags];

            return json(res, 200, {
              coverUrl,
              genres,
              bpm: trackMeta.bpm,
              camelotKey: trackMeta.camelotKey,
              musicalKey: trackMeta.musicalKey,
              vibeTags,
              bpmEstimated: trackMeta.bpmEstimated,
              keyEstimated: trackMeta.keyEstimated,
              trackSpecific: trackMeta.trackSpecific,
              spotifyPreviewUrl: trackMeta.spotifyPreviewUrl,
              spotifyTrackId: trackMeta.spotifyTrackId,
            });
          }

          // ── Last.fm similar ──
          if (path === '/api/lastfm/similar' && req.method === 'GET') {
            if (!lastfmKey) return json(res, 503, { error: 'LASTFM_API_KEY not configured' });
            const artist = url.searchParams.get('artist');
            const track = url.searchParams.get('track');
            if (!artist?.trim()) return json(res, 400, { error: 'artist required' });

            const [artists, tracks] = await Promise.all([
              getSimilarArtists(lastfmKey, artist.trim(), 10),
              track?.trim()
                ? getSimilarTracks(lastfmKey, artist.trim(), track.trim(), 12)
                : Promise.resolve([]),
            ]);
            return json(res, 200, { artists, tracks });
          }

          // ── Last.fm vibe discovery ──
          if (path === '/api/lastfm/vibe' && req.method === 'GET') {
            if (!lastfmKey) return json(res, 503, { error: 'LASTFM_API_KEY not configured' });
            const tag = url.searchParams.get('tag');
            if (!tag?.trim()) return json(res, 400, { error: 'tag required' });
            const tracks = await getTopTracksByTag(lastfmKey, tag.trim(), 20);
            return json(res, 200, { tracks });
          }

          return json(res, 404, { error: 'Not found' });
        } catch (e) {
          const message = e instanceof Error ? e.message : 'API error';
          return json(res, 502, { error: message });
        }
      });
    },
  };
}