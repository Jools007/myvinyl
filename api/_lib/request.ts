import type { VercelRequest } from '@vercel/node';

export class InvalidJsonBodyError extends Error {
  constructor(message = 'Invalid JSON body') {
    super(message);
    this.name = 'InvalidJsonBodyError';
  }
}

export function parseJsonBody(req: VercelRequest): unknown {
  const raw = req.body;

  if (raw == null || raw === '') {
    return {};
  }

  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      throw new InvalidJsonBodyError();
    }
  }

  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8')) as unknown;
    } catch {
      throw new InvalidJsonBodyError();
    }
  }

  if (typeof raw === 'object') {
    return raw;
  }

  throw new InvalidJsonBodyError('Unsupported request body type');
}

export function queryRecord(
  query: VercelRequest['query']
): Record<string, string | string[] | undefined> {
  if (!query || typeof query !== 'object') {
    return {};
  }
  return query as Record<string, string | string[] | undefined>;
}