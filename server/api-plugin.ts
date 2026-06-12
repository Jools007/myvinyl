import type { IncomingMessage, ServerResponse } from 'http';
import type { Plugin } from 'vite';
import {
  AlbumInfoValidationError,
  handleAlbumInfo,
  parseAlbumInfoQuery,
} from './handlers/album-info';
import {
  EnrichValidationError,
  handleEnrich,
  parseEnrichBody,
  parseEnrichQuery,
} from './handlers/enrich';
import { handlePlayAudio } from './handlers/play-audio';
import {
  getSpotifyRateLimitRetrySec,
  isSpotifyRateLimited,
  resolveTrackPreview,
} from './spotify';
import { getSimilarArtists, getSimilarTracks, getTopTracksByTag } from './lastfm';
import {
  handleDiscogsCollectionPage,
  handleDiscogsRelease,
  handleDiscogsSearch,
} from './handlers/discogs';
import { fetchProxiedImage, parseImageProxyUrl } from './handlers/image-proxy';

type Env = Record<string, string>;

function json(res: ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function parseUrl(req: IncomingMessage) {
  return new URL(req.url ?? '/', 'http://localhost');
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new EnrichValidationError('Request body must be valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function apiPlugin(env: Env): Plugin {
  return {
    name: 'myvinyl-api',
    enforce: 'pre',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = parseUrl(req);
        const path = url.pathname;

        if (!path.startsWith('/api/')) return next();

        if (path === '/api/health' && req.method === 'GET') {
          const enrich = url.searchParams.get('enrich');
          if (enrich === '1' || enrich === 'true') {
            try {
              const input = parseEnrichQuery(Object.fromEntries(url.searchParams.entries()));
              const result = await handleEnrich(input, {
                discogsToken: env.DISCOGS_TOKEN,
                spotifyId: env.SPOTIFY_CLIENT_ID,
                spotifySecret: env.SPOTIFY_CLIENT_SECRET,
                lastfmKey: env.LASTFM_API_KEY,
              });
              return json(res, 200, result);
            } catch (e) {
              if (e instanceof EnrichValidationError) {
                return json(res, 400, { error: e.message });
              }
              throw e;
            }
          }
          return json(res, 200, { status: 'ok', environment: 'development' });
        }

        const discogsToken = env.DISCOGS_TOKEN;
        const lastfmKey = env.LASTFM_API_KEY;
        const spotifyId = env.SPOTIFY_CLIENT_ID;
        const spotifySecret = env.SPOTIFY_CLIENT_SECRET;
        const youtubeApiKey = env.YOUTUBE_API_KEY;

        try {
          // ── Album description (Discogs notes + Last.fm wiki) ──
          if (path === '/api/album-info' && req.method === 'GET') {
            const q = url.searchParams.get('q') ?? undefined;
            const barcode = url.searchParams.get('barcode') ?? undefined;
            if (q?.trim() || barcode?.trim()) {
              if (!discogsToken) {
                return json(res, 503, { error: 'DISCOGS_TOKEN not configured' });
              }
              const perPage = parseInt(url.searchParams.get('per_page') ?? '16', 10);
              const results = await handleDiscogsSearch(discogsToken, {
                q,
                barcode,
                perPage,
              });
              return json(res, 200, { results });
            }

            try {
              const input = parseAlbumInfoQuery(
                Object.fromEntries(url.searchParams.entries())
              );
              const result = await handleAlbumInfo(input, { lastfmKey });
              return json(res, 200, result);
            } catch (e) {
              if (e instanceof AlbumInfoValidationError) {
                return json(res, 400, { error: e.message });
              }
              throw e;
            }
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
            const artist = url.searchParams.get('artist')?.trim() ?? '';
            const title = url.searchParams.get('title')?.trim() ?? '';
            if (!artist || !title) {
              return json(res, 400, { error: 'artist and title required' });
            }
            const album = url.searchParams.get('album')?.trim() || undefined;
            const albumIndexRaw = url.searchParams.get('albumIndex');
            const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : undefined;
            const spotifyTrackId = url.searchParams.get('spotifyTrackId')?.trim();

            const result = await handlePlayAudio({
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

            if (result.ok) return json(res, 200, result.data);
            if (result.status === 503) {
              return json(res, 503, {
                error: result.error,
                retryAfterSec: result.retryAfterSec,
              });
            }
            return json(res, 404, { error: result.error });
          }

          // ── Enrich (Discogs + Spotify + Last.fm combined) ──
          if (path === '/api/enrich' && (req.method === 'GET' || req.method === 'POST')) {
            try {
              const input =
                req.method === 'POST'
                  ? parseEnrichBody(await readJsonBody(req))
                  : parseEnrichQuery(Object.fromEntries(url.searchParams.entries()));

              const result = await handleEnrich(input, {
                discogsToken,
                spotifyId,
                spotifySecret,
                lastfmKey,
              });
              return json(res, 200, result);
            } catch (e) {
              if (e instanceof EnrichValidationError) {
                return json(res, 400, { error: e.message });
              }
              throw e;
            }
          }

          // ── Discogs (server token — full tracklists for import & add) ──
          const discogsReleaseMatch = path.match(/^\/api\/discogs\/release\/(\d+)$/);
          if (discogsReleaseMatch && req.method === 'GET') {
            if (!discogsToken) {
              return json(res, 503, { error: 'DISCOGS_TOKEN not configured' });
            }
            const id = Number(discogsReleaseMatch[1]);
            const release = await handleDiscogsRelease(discogsToken, id);
            return json(res, 200, release);
          }

          if (path === '/api/discogs/search' && req.method === 'GET') {
            if (!discogsToken) {
              return json(res, 503, { error: 'DISCOGS_TOKEN not configured' });
            }
            const q = url.searchParams.get('q') ?? undefined;
            const barcode = url.searchParams.get('barcode') ?? undefined;
            const perPage = parseInt(url.searchParams.get('per_page') ?? '16', 10);
            if (!q?.trim() && !barcode?.trim()) {
              return json(res, 400, { error: 'q or barcode required' });
            }
            const results = await handleDiscogsSearch(discogsToken, { q, barcode, perPage });
            return json(res, 200, { results });
          }

          if (path === '/api/discogs/collection' && req.method === 'GET') {
            if (!discogsToken) {
              return json(res, 503, { error: 'DISCOGS_TOKEN not configured' });
            }
            const username = url.searchParams.get('username')?.trim();
            if (!username) return json(res, 400, { error: 'username required' });
            const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
            const perPage = Math.min(
              100,
              Math.max(1, parseInt(url.searchParams.get('per_page') ?? '100', 10))
            );
            const payload = await handleDiscogsCollectionPage(
              discogsToken,
              username,
              page,
              perPage
            );
            return json(res, 200, payload);
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

          // ── Image proxy (PDF export, CORS-safe artwork) ──
          if (path === '/api/image' && req.method === 'GET') {
            const imageUrl = parseImageProxyUrl(url.searchParams.get('url'));
            if (!imageUrl) return json(res, 400, { error: 'Valid image url required' });

            const result = await fetchProxiedImage(imageUrl);
            if (!result) return json(res, 404, { error: 'Image not found' });

            res.statusCode = 200;
            res.setHeader('Content-Type', result.contentType);
            res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.end(result.buffer);
            return;
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