import type { VercelResponse } from '@vercel/node';
import { logApiError } from './log';

export function json(
  res: VercelResponse,
  route: string,
  status: number,
  body: unknown
): void {
  try {
    res.status(status).json(body);
  } catch (error) {
    logApiError(route, error, { phase: 'send-response', status });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to send response' });
    }
  }
}