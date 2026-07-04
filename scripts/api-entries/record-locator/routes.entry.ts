import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { json } from '../../../api/_lib/response';
import {
  handleWalkingRoute,
  parseWalkingRouteBody,
} from '../../../features/record-locator/server/routesHandler';

const ROUTE = 'api/record-locator/routes';

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
    const input = parseWalkingRouteBody(parseRequestBody(req));
    const route = await handleWalkingRoute(readApiKey(), input, { useFixture: useFixtureMode() });
    return json(res, ROUTE, 200, { route });
  } catch (error) {
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Walking route failed';
    if (message.includes('not configured')) {
      return json(res, ROUTE, 503, { error: message });
    }
    const status = /required|at least/i.test(message) ? 400 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}