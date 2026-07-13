import { Request, Response, NextFunction } from 'express';

/**
 * Controllers in this legacy service use several response helpers. This final
 * response boundary guarantees that a 5xx body never includes a database,
 * provider, filesystem, or stack error message even when a controller catches
 * an exception directly instead of delegating to the global error handler.
 */
export function sanitizeServerErrors(_req: Request, res: Response, next: NextFunction): void {
  const sendJson = res.json.bind(res);

  res.json = ((body: unknown) => {
    if (res.statusCode < 500) return sendJson(body);

    const source = body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
    const safeBody: Record<string, unknown> = {
      success: false,
      message: 'Internal server error',
      errors: [],
    };

    // Preserve only the fixed readiness markers used by this service. Do not
    // copy arbitrary controller fields such as detail, stack, query, or data
    // across the public 5xx boundary.
    if (
      source.service === 'epdg-backend-core' &&
      source.status === 'unavailable'
    ) {
      safeBody.service = source.service;
      safeBody.status = source.status;
      safeBody.message = 'Service unavailable';
    }

    return sendJson(safeBody);
  }) as Response['json'];

  next();
}
