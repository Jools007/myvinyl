import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getApiEnv } from '../../api/_lib/env';
import {
  fetchProxiedImage,
  parseImageProxyUrl,
} from '../../server/handlers/image-proxy';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawUrl = typeof req.query.url === 'string' ? req.query.url : undefined;
  const imageUrl = parseImageProxyUrl(rawUrl);

  if (!imageUrl) {
    return res.status(400).json({ error: 'Valid image url required' });
  }

  try {
    const { discogsToken } = getApiEnv();
    const result = await fetchProxiedImage(imageUrl, { discogsToken });
    if (!result) {
      return res.status(404).json({ error: 'Image not found' });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).send(result.buffer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image proxy failed';
    return res.status(502).json({ error: message });
  }
}