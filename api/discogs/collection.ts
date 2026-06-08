import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDiscogsCollectionPage } from '../../server/handlers/discogs';
import { getApiEnv, logApiEnvStatus } from '../_lib/env';
import { logApiError, logApiRequest } from '../_lib/log';
import { queryRecord } from '../_lib/request';
import { json } from '../_lib/response';

const ROUTE = 'api/discogs/collection';

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

    const query = queryRecord(req.query);
    const username = typeof query.username === 'string' ? query.username.trim() : '';
    if (!username) {
      return json(res, ROUTE, 400, { error: 'username required' });
    }

    const pageRaw = typeof query.page === 'string' ? query.page : '1';
    const perPageRaw = typeof query.per_page === 'string' ? query.per_page : '100';
    const page = Math.max(1, parseInt(pageRaw, 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(perPageRaw, 10) || 100));

    const payload = await handleDiscogsCollectionPage(discogsToken, username, page, perPage);
    return json(res, ROUTE, 200, payload);
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Discogs collection failed';
    const status = message.includes('not found')
      ? 404
      : message.includes('rate limit')
        ? 429
        : 502;
    return json(res, ROUTE, status, { error: message });
  }
}