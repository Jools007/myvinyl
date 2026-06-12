import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSpotifyRateLimitRetrySec,
  isSpotifyRateLimited,
  resolveTrackPreview,
} from '../../../api/_lib/play-audio/spotify';
import { getApiEnv, logApiEnvStatus } from '../../../api/_lib/env';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { queryRecord } from '../../../api/_lib/request';
import { json } from '../../../api/_lib/response';

const ROUTE = 'api/spotify/audio';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const { spotifyId, spotifySecret } = getApiEnv();
    if (!spotifyId || !spotifySecret) {
      return json(res, ROUTE, 503, { error: 'Spotify credentials not configured' });
    }

    const query = queryRecord(req.query);
    const artist = typeof query.artist === 'string' ? query.artist.trim() : '';
    const title =
      (typeof query.title === 'string' ? query.title : typeof query.album === 'string' ? query.album : '')
        .trim();
    const album = typeof query.album === 'string' ? query.album.trim() : '';

    if (!artist || !title) {
      return json(res, ROUTE, 400, { error: 'artist and title required' });
    }
    if (!album) {
      return json(res, ROUTE, 400, {
        error: 'album is required — use the release title from the collection',
      });
    }

    const albumIndexRaw = typeof query.albumIndex === 'string' ? query.albumIndex : undefined;
    const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : undefined;
    const spotifyTrackId =
      typeof query.spotifyTrackId === 'string' ? query.spotifyTrackId.trim() : undefined;

    const audio = await resolveTrackPreview(
      spotifyId,
      spotifySecret,
      artist,
      title,
      album,
      {
        fetchRetries: 2,
        spotifyTrackId: spotifyTrackId || undefined,
        albumIndex:
          albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0 ? albumIndex : undefined,
      }
    );

    if (!audio?.previewUrl) {
      if (isSpotifyRateLimited()) {
        return json(res, ROUTE, 503, {
          error: 'Spotify is temporarily rate-limited — try again in a few seconds',
          retryAfterSec: getSpotifyRateLimitRetrySec(),
        });
      }
      return json(res, ROUTE, 404, { error: 'No Spotify preview found' });
    }

    return json(res, ROUTE, 200, audio);
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : 'Spotify preview failed';
    return json(res, ROUTE, 500, { error: message });
  }
}