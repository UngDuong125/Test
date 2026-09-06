import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError, isAppError } from '../domain/errors.js';
import { env } from '../config/env.js';

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
      message: env.isProd ? 'Internal server error' : String(err),
    },
  });
}
