import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  EnrichValidationError,
  handleEnrich,
  parseEnrichBody,
  parseEnrichQuery,
} from '../../server/handlers/enrich';
import { getApiEnv, logApiEnvStatus } from '../../api/_lib/env';
import { logApiError, logApiRequest } from '../../api/_lib/log';
import { json } from '../../api/_lib/response';

const ROUTE = 'api/enrich';

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

  if (req.method !== 'GET' && req.method !== 'POST') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    logApiEnvStatus(ROUTE);
    const env = getApiEnv();

    const input =
      req.method === 'POST'
        ? parseEnrichBody(parseRequestBody(req))
        : parseEnrichQuery(
            Object.fromEntries(
              Object.entries(req.query ?? {}).map(([k, v]) => [
                k,
                Array.isArray(v) ? v[0] : v,
              ])
            )
          );

    const result = await handleEnrich(input, {
      discogsToken: env.discogsToken,
      spotifyId: env.spotifyId,
      spotifySecret: env.spotifySecret,
      lastfmKey: env.lastfmKey,
    });

    return json(res, ROUTE, 200, result);
  } catch (error) {
    if (error instanceof EnrichValidationError) {
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method, query: req.query });
    const message = error instanceof Error ? error.message : 'Internal error';
    return json(res, ROUTE, 500, { error: message });
  }
}