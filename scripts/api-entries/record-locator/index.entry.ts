import type { VercelRequest, VercelResponse } from '@vercel/node';
import { logApiError, logApiRequest } from '../../../api/_lib/log';
import { json } from '../../../api/_lib/response';
import {
  resolveRecordLocatorApiKey,
  resolveRecordLocatorFetch,
} from '../../../features/record-locator/server/googleFetch';
import {
  RecordLocatorPhotoError,
  parsePhotoNameParam,
  resolvePlacePhoto,
} from '../../../features/record-locator/server/photoHandler';
import {
  RecordLocatorValidationError,
  handleNearbyRecordStores,
  parsePlacesSearchBody,
} from '../../../features/record-locator/server/placesHandler';
import {
  handleWalkingRoute,
  parseWalkingRouteBody,
} from '../../../features/record-locator/server/routesHandler';

const ROUTE = 'api/record-locator';

type LocatorSubRoute = 'places' | 'routes' | 'photo';

function resolveSubRoute(req: VercelRequest): LocatorSubRoute | null {
  const path = req.url?.split('?')[0] ?? '';
  if (path.endsWith('/places')) return 'places';
  if (path.endsWith('/routes')) return 'routes';
  if (path.endsWith('/photo')) return 'photo';
  return null;
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

async function handlePlaces(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    return json(res, `${ROUTE}/places`, 405, { error: 'Method not allowed' });
  }

  try {
    const input = parsePlacesSearchBody(parseRequestBody(req));
    const result = await handleNearbyRecordStores(resolveRecordLocatorApiKey(), input, {
      fetchFn: resolveRecordLocatorFetch(),
    });
    return json(res, `${ROUTE}/places`, 200, result);
  } catch (error) {
    if (error instanceof RecordLocatorValidationError) {
      return json(res, `${ROUTE}/places`, 400, { error: error.message });
    }
    logApiError(`${ROUTE}/places`, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Places search failed';
    const status = message.includes('not configured') ? 503 : 502;
    return json(res, `${ROUTE}/places`, status, { error: message });
  }
}

async function handleRoutes(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    return json(res, `${ROUTE}/routes`, 405, { error: 'Method not allowed' });
  }

  try {
    const input = parseWalkingRouteBody(parseRequestBody(req));
    const route = await handleWalkingRoute(resolveRecordLocatorApiKey(), input, {
      fetchFn: resolveRecordLocatorFetch(),
    });
    return json(res, `${ROUTE}/routes`, 200, { route });
  } catch (error) {
    logApiError(`${ROUTE}/routes`, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Walking route failed';
    if (message.includes('not configured')) {
      return json(res, `${ROUTE}/routes`, 503, { error: message });
    }
    const status = /required|at least/i.test(message) ? 400 : 502;
    return json(res, `${ROUTE}/routes`, status, { error: message });
  }
}

async function handlePhoto(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'GET') {
    return json(res, `${ROUTE}/photo`, 405, { error: 'Method not allowed' });
  }

  try {
    const photoName = parsePhotoNameParam(
      typeof req.query.n === 'string' ? req.query.n : undefined
    );
    const result = await resolvePlacePhoto(
      resolveRecordLocatorApiKey(),
      photoName,
      resolveRecordLocatorFetch()
    );

    if (result.kind === 'redirect') {
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      res.redirect(302, result.location);
      return;
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.status(200).send(result.body);
  } catch (error) {
    if (error instanceof RecordLocatorPhotoError) {
      return json(res, `${ROUTE}/photo`, 400, { error: error.message });
    }
    logApiError(`${ROUTE}/photo`, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Photo lookup failed';
    const status = message.includes('not configured') ? 503 : 502;
    return json(res, `${ROUTE}/photo`, status, { error: message });
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const subRoute = resolveSubRoute(req);
  logApiRequest(`${ROUTE}/${subRoute ?? 'unknown'}`, req, 'start');

  switch (subRoute) {
    case 'places':
      return handlePlaces(req, res);
    case 'routes':
      return handleRoutes(req, res);
    case 'photo':
      return handlePhoto(req, res);
    default:
      return json(res, ROUTE, 404, { error: 'Record locator endpoint not found' });
  }
}