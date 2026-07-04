import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { json } from '../../../api/_lib/response';
import {
  resolveRecordLocatorApiKey,
  resolveRecordLocatorFetch,
} from '../../../features/record-locator/server/googleFetch';
import {
  RecordLocatorValidationError,
  handleNearbyRecordStores,
  parsePlacesSearchBody,
} from '../../../features/record-locator/server/placesHandler';

const ROUTE = 'api/record-locator/places';

function parseRequestBody(req: VercelRequest): unknown {
  const raw = req.body;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return {};
    }
  }
  return raw;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'POST') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    const input = parsePlacesSearchBody(parseRequestBody(req));
    const result = await handleNearbyRecordStores(resolveRecordLocatorApiKey(), input, {
      fetchFn: resolveRecordLocatorFetch(),
    });
    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof RecordLocatorValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Places search failed';
    const status = message.includes('not configured') ? 503 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}