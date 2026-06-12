import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSimilarArtists, getSimilarTracks } from '../../../api/_lib/lastfm';
import { getApiEnv, logApiEnvStatus } from '../../../api/_lib/env';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { queryRecord } from '../../../api/_lib/request';
import { json } from '../../../api/_lib/response';

const ROUTE = 'api/lastfm/similar';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const { lastfmKey } = getApiEnv();
    if (!lastfmKey) {
      return json(res, ROUTE, 503, { error: 'LASTFM_API_KEY not configured' });
    }

    const query = queryRecord(req.query);
    const artist = typeof query.artist === 'string' ? query.artist.trim() : '';
    const track = typeof query.track === 'string' ? query.track.trim() : '';

    if (!artist) {
      return json(res, ROUTE, 400, { error: 'artist required' });
    }

    const [artists, tracks] = await Promise.all([
      getSimilarArtists(lastfmKey, artist, 10),
      track ? getSimilarTracks(lastfmKey, artist, track, 12) : Promise.resolve([]),
    ]);

    return json(res, ROUTE, 200, { artists, tracks });
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : 'Last.fm similar failed';
    return json(res, ROUTE, 500, { error: message });
  }
}