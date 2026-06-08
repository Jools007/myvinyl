import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDiscogsRelease } from '../../_lib/discogs/handlers';
import { getApiEnv, logApiEnvStatus } from '../../_lib/env';
import { logApiError, logApiRequest } from '../../_lib/log';
import { json } from '../../_lib/response';

const ROUTE = 'api/discogs/release/[id]';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const { discogsToken } = getApiEnv();
    if (!discogsToken) {
      return json(res, ROUTE, 503, { error: 'DISCOGS_TOKEN not configured' });
    }

    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) {
      return json(res, ROUTE, 400, { error: 'Valid release id required' });
    }

    const release = await handleDiscogsRelease(discogsToken, id);
    return json(res, ROUTE, 200, release);
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Discogs release failed';
    const status = message.includes('rate limit') ? 429 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}