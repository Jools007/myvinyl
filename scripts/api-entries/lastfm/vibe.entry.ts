import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTopTracksByTag } from '../../../api/_lib/lastfm';
import { getApiEnv, logApiEnvStatus } from '../../../api/_lib/env';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { queryRecord } from '../../../api/_lib/request';
import { json } from '../../../api/_lib/response';

const ROUTE = 'api/lastfm/vibe';

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
    const tag = typeof query.tag === 'string' ? query.tag.trim() : '';
    if (!tag) {
      return json(res, ROUTE, 400, { error: 'tag required' });
    }

    const tracks = await getTopTracksByTag(lastfmKey, tag, 20);
    return json(res, ROUTE, 200, { tracks });
  } catch (error) {
    logApiError(ROUTE, error, { query: req.query });
    const message = error instanceof Error ? error.message : 'Last.fm vibe failed';
    return json(res, ROUTE, 500, { error: message });
  }
}