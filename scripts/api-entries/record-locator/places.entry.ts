import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { json } from '../../../api/_lib/response';
import {
  RecordLocatorValidationError,
  handleNearbyRecordStores,
  parsePlacesSearchBody,
} from '../../../features/record-locator/server/placesHandler';

const ROUTE = 'api/record-locator/places';

function useFixtureMode(): boolean {
  return process.env.RECORD_LOCATOR_FIXTURE === '1';
}

function readApiKey(): string | undefined {
  return process.env.GOOGLE_PLACES_API_KEY?.trim();
}

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
    const result = await handleNearbyRecordStores(readApiKey(), input, {
      useFixture: useFixtureMode(),
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