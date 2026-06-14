import type { VercelRequest, VercelResponse } from '@vercel/node';
import { fetchDiscogsPriceSuggestions } from '../../../api/_lib/discogs/priceSuggestions';
import { getApiEnv, logApiEnvStatus } from '../../../api/_lib/env';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { queryRecord } from '../../../api/_lib/request';
import { json } from '../../../api/_lib/response';

const ROUTE = 'api/discogs/price-suggestions';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const env = getApiEnv();

    if (!env.discogsOAuth && !env.discogsToken) {
      return json(res, ROUTE, 503, {
        error: 'Discogs OAuth not configured (DISCOGS_CONSUMER_KEY / DISCOGS_CONSUMER_SECRET)',
      });
    }

    const query = queryRecord(req.query);
    const releaseIdRaw =
      typeof query.releaseId === 'string'
        ? query.releaseId
        : typeof query.release_id === 'string'
          ? query.release_id
          : '';
    const releaseId = parseInt(releaseIdRaw, 10);

    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return json(res, ROUTE, 400, { error: 'Valid releaseId required' });
    }

    const suggestions = await fetchDiscogsPriceSuggestions(releaseId, {
      oauth: env.discogsOAuth,
      token: env.discogsToken,
    });

    return json(res, ROUTE, 200, {
      releaseId,
      suggestions,
      currency: Object.values(suggestions)[0]?.currency ?? 'USD',
    });
  } catch (error) {
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Price suggestions failed';
    const status = message.includes('rate limit')
      ? 429
      : message.includes('not found')
        ? 404
        : message.includes('not configured')
          ? 503
          : 502;
    return json(res, ROUTE, status, { error: message });
  }
}