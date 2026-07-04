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

const ROUTE = 'api/record-locator/photo';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  logApiRequest(ROUTE, req, 'start');

  if (req.method !== 'GET') {
    return json(res, ROUTE, 405, { error: 'Method not allowed' });
  }

  try {
    const photoName = parsePhotoNameParam(
      typeof req.query.n === 'string' ? req.query.n : undefined
    );
    const result = await resolvePlacePhoto(resolveRecordLocatorApiKey(), photoName, resolveRecordLocatorFetch());

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
      return json(res, ROUTE, 400, { error: error.message });
    }
    logApiError(ROUTE, error, { method: req.method });
    const message = error instanceof Error ? error.message : 'Photo lookup failed';
    const status = message.includes('not configured') ? 503 : 502;
    return json(res, ROUTE, status, { error: message });
  }
}