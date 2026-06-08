import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDiscogsSearch } from '../../server/handlers/discogs';
import { getApiEnv, logApiEnvStatus } from '../_lib/env';
import { logApiError, logApiRequest } from '../_lib/log';
import { queryRecord } from '../_lib/request';
import { json } from '../_lib/response';

const ROUTE = 'api/discogs/search';

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
    const q = typeof query.q === 'string' ? query.q : undefined;
    const barcode = typeof query.barcode === 'string' ? query.barcode : undefined;
    const perPageRaw = typeof query.per_page === 'string' ? query.per_page : undefined;
    const perPage = perPageRaw ? parseInt(perPageRaw, 10) : undefined;

    if (!q?.trim() && !barcode?.trim()) {
      return json(res, ROUTE, 400, { error: 'q or barcode required' });
    }

    const results = await handleDiscogsSearch(discogsToken, { q, barcode, perPage });
    return json(res, ROUTE, 200, { results });
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Discogs search failed';
    const status = message.includes('rate limit') ? 429 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}