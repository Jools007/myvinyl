import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiEnv } from '../../api/_lib/env';
import { logApiError, logApiRequest } from '../../api/_lib/log';
import { queryRecord } from '../../api/_lib/request';
import { json } from '../../api/_lib/response';
import {
  AlbumCharacterValidationError,
  handleAlbumCharacter,
  parseAlbumCharacterQuery,
} from '../../server/handlers/album-character';

const ROUTE = 'api/album-character';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    const input = parseAlbumCharacterQuery(queryRecord(req.query));
    const { lastfmKey } = getApiEnv();
    const result = await handleAlbumCharacter(input, { lastfmKey });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof AlbumCharacterValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error);
    const message = error instanceof Error ? error.message : 'Album character failed';
    return json(res, ROUTE, 502, { error: message });
  }
}