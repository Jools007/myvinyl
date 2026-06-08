import type { VercelRequest } from '@vercel/node';

export type ApiLogContext = Record<string, unknown>;

/** Serialize any thrown value for Vercel Logs (full detail, no secrets). */
export function serializeError(error: unknown): ApiLogContext {
  if (error == null) {
    return { type: 'null', value: String(error) };
  }

  if (error instanceof Error) {
    const serialized: ApiLogContext = {
      type: 'Error',
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    if ('cause' in error && error.cause !== undefined) {
      serialized.cause = serializeError(error.cause);
    }

    for (const key of Object.getOwnPropertyNames(error)) {
      if (key === 'name' || key === 'message' || key === 'stack' || key === 'cause') {
        continue;
      }
      try {
        serialized[key] = (error as Record<string, unknown>)[key];
      } catch {
        serialized[key] = '[unreadable]';
      }
    }

    return serialized;
  }

  if (typeof error === 'object') {
    try {
      return {
        type: 'object',
        value: JSON.parse(JSON.stringify(error)) as unknown,
      };
    } catch {
      return { type: 'object', value: String(error) };
    }
  }

  return { type: typeof error, value: String(error) };
}

export function logApiInfo(route: string, message: string, context?: ApiLogContext): void {
  console.error(`[${route}] ${message}`, context ?? {});
}

export function logApiError(
  route: string,
  error: unknown,
  context?: ApiLogContext
): void {
  console.error(`[${route}] ERROR`, {
    ...context,
    error: serializeError(error),
  });
}

/** Safe request metadata for debugging (never log tokens or full bodies). */
export function logApiRequest(route: string, req: VercelRequest, phase: string): void {
  const body = req.body;
  let bodyKind = 'none';
  if (body != null && body !== '') {
    if (Buffer.isBuffer(body)) bodyKind = 'buffer';
    else if (typeof body === 'string') bodyKind = 'string';
    else if (typeof body === 'object') bodyKind = 'object';
    else bodyKind = typeof body;
  }

  console.error(`[${route}] request`, {
    phase,
    method: req.method,
    url: req.url,
    query: req.query,
    bodyKind,
    contentType: req.headers['content-type'],
    userAgent: req.headers['user-agent'],
  });
}