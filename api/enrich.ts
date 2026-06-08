import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  EnrichValidationError,
  handleEnrich,
  parseEnrichBody,
  parseEnrichQuery,
} from './_lib/enrich/handler';
import { InvalidJsonBodyError, parseJsonBody, queryRecord } from './_lib/request';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use POST or GET.' });
  }

  try {
    const env = {
      spotifyId: process.env.SPOTIFY_CLIENT_ID?.trim(),
      spotifySecret: process.env.SPOTIFY_CLIENT_SECRET?.trim(),
    };

    const input =
      req.method === 'POST'
        ? parseEnrichBody(parseJsonBody(req))
        : parseEnrichQuery(queryRecord(req.query));

    const result = await handleEnrich(input, env);
    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof EnrichValidationError || error instanceof InvalidJsonBodyError) {
      return res.status(400).json({ error: error.message });
    }
    const message = error instanceof Error ? error.message : 'Enrichment failed';
    return res.status(500).json({ error: message });
  }
}