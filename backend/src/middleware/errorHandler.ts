import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../domain/errors.js';
import { env } from '../config/env.js';

/** PostgREST / plain objects stringify as "[object Object]" — prefer .message. */
function unknownErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const rec = err as { message?: unknown; code?: unknown; details?: unknown; hint?: unknown };
    if (typeof rec.message === 'string' && rec.message.trim()) {
      const bits = [rec.message];
      if (typeof rec.code === 'string' && rec.code) bits.push(`(${rec.code})`);
      if (typeof rec.details === 'string' && rec.details) bits.push(rec.details);
      if (typeof rec.hint === 'string' && rec.hint) bits.push(rec.hint);
      return bits.join(' ');
    }
    try {
      return JSON.stringify(err);
    } catch {
      return 'Unknown error';
    }
  }
  return String(err);
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    res.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request',
        details: err.flatten(),
      },
    });
    return;
  }

  if (isAppError(err)) {
    res.status(err.statusCode).json({
      error: {
        code: err.code ?? 'APP_ERROR',
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {}),
      },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: env.isProd ? 'Internal server error' : unknownErrorMessage(err),
    },
  });
}
