import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handlePlayAudio } from '../../../api/_lib/play-audio/handler';
import { getApiEnv, logApiEnvStatus } from '../../../api/_lib/env';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { queryRecord } from '../../../api/_lib/request';
import { json } from '../../../api/_lib/response';

const ROUTE = 'api/play/audio';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const { spotifyId, spotifySecret, youtubeApiKey } = getApiEnv();

    const query = queryRecord(req.query);
    const artist = typeof query.artist === 'string' ? query.artist.trim() : '';
    const title = typeof query.title === 'string' ? query.title.trim() : '';
    const album = typeof query.album === 'string' ? query.album.trim() : undefined;
    const albumIndexRaw = typeof query.albumIndex === 'string' ? query.albumIndex : undefined;
    const albumIndex = albumIndexRaw ? parseInt(albumIndexRaw, 10) : undefined;
    const spotifyTrackId =
      typeof query.spotifyTrackId === 'string' ? query.spotifyTrackId.trim() : undefined;

    if (!artist || !title) {
      return json(res, ROUTE, 400, { error: 'artist and title required' });
    }

    const result = await handlePlayAudio({
      artist,
      title,
      album: album || undefined,
      albumIndex:
        albumIndex != null && !Number.isNaN(albumIndex) && albumIndex > 0 ? albumIndex : undefined,
      spotifyTrackId: spotifyTrackId || undefined,
      spotifyId,
      spotifySecret,
      youtubeApiKey,
    });

    if (result.ok) {
      return json(res, ROUTE, 200, result.data);
    }

    if (result.status === 503) {
      return json(res, ROUTE, 503, {
        error: result.error,
        retryAfterSec: result.retryAfterSec,
      });
    }

    return json(res, ROUTE, 404, { error: result.error });
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : 'Internal error';
    return json(res, ROUTE, 500, { error: message });
  }
}