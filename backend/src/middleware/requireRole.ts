import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../domain/errors.js';
import type { UserRole } from '../types/domain.js';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
      return;
    }
    if (!roles.includes(req.auth.user.role)) {
      next(new AppError(403, 'Forbidden', 'FORBIDDEN'));
      return;
    }
    next();
  };
}
