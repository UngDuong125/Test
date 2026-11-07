import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

const INCOMING_ID = /^[A-Za-z0-9._-]{8,64}$/;

/** Path without the query string: tokens (reset links) must never reach the logs. */
export function logPath(originalUrl: string): string {
  return originalUrl.split('?')[0] || '/';
}

/**
 * One JSON line per request: requestId, method, path, status, duration, userId.
 * No bodies, headers or query strings are logged.
 */
export function requestLog(req: Request, res: Response, next: NextFunction) {
  const incoming = req.get('x-request-id');
  const requestId = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  const started = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    const line = {
      level: res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
      msg: 'request',
      requestId,
      method: req.method,
      path: logPath(req.originalUrl),
      status: res.statusCode,
      durationMs: Math.round(durationMs * 10) / 10,
      userId: req.auth?.user.id ?? null,
    };
    console.log(JSON.stringify(line));
  });
  next();
}
