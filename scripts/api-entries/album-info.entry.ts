import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleDiscogsSearch } from '../../api/_lib/discogs/handlers';
import { getApiEnv } from '../../api/_lib/env';
import { logApiError, logApiRequest } from '../../api/_lib/log';
import { queryRecord } from '../../api/_lib/request';
import { json } from '../../api/_lib/response';
import {
  AlbumInfoValidationError,
  handleAlbumInfo,
  parseAlbumInfoQuery,
} from '../../server/handlers/album-info';

const ROUTE = 'api/album-info';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  const query = queryRecord(req.query);
  const q = typeof query.q === 'string' ? query.q : undefined;
  const barcode = typeof query.barcode === 'string' ? query.barcode : undefined;

  if (q?.trim() || barcode?.trim()) {
    const { discogsToken } = getApiEnv();
    if (!discogsToken) {
      return json(res, ROUTE, 503, { error: 'DISCOGS_TOKEN not configured' });
    }

    const perPageRaw = typeof query.per_page === 'string' ? query.per_page : '16';
    const perPage = Math.min(50, Math.max(1, parseInt(perPageRaw, 10) || 16));

    try {
      const results = await handleDiscogsSearch(discogsToken, { q, barcode, perPage });
      return json(res, ROUTE, 200, { results });
    } catch (error) {
      logApiError(ROUTE, error, { q, barcode });
      const message = error instanceof Error ? error.message : 'Discogs search failed';
      const status = message.includes('rate limit') ? 429 : 502;
      return json(res, ROUTE, status, { error: message });
    }
  }

  try {
    const input = parseAlbumInfoQuery(req.query);
    const { lastfmKey } = getApiEnv();
    const result = await handleAlbumInfo(input, { lastfmKey });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof AlbumInfoValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Album info failed';
    return json(res, ROUTE, 502, { error: message });
  }
}