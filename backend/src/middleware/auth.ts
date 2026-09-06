import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { AppError } from '../domain/errors.js';
import { findUserById } from '../repositories/users.repository.js';
import { toPublicUser } from '../repositories/user.mapper.js';
import { resolveSession } from '../services/session.service.js';
import type { PublicUser, SessionRecord } from '../types/domain.js';

export interface AuthContext {
  user: PublicUser;
  session: SessionRecord;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function authMiddleware(req: Request, _res: Response, next: NextFunction) {
  try {
    const raw = req.cookies?.[env.SESSION_COOKIE_NAME] as string | undefined;
    const session = await resolveSession(raw);
    if (!session) {
      next();
      return;
    }

    const user = await findUserById(session.userId);
    if (!user || user.status === 'disabled') {
      next();
      return;
    }

    if (user.status === 'locked' && user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
      next();
      return;
    }

    req.auth = { user: toPublicUser(user), session };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new AppError(401, 'Unauthorized', 'UNAUTHORIZED'));
    return;
  }
  next();
}

/** When mustChangePassword, only allow change-password, logout, and me. */
export function enforcePasswordChangeGate(req: Request, _res: Response, next: NextFunction) {
  const auth = req.auth;
  if (!auth?.user.mustChangePassword) {
    next();
    return;
  }

  const url = (req.originalUrl.split('?')[0] ?? '').replace(/\/$/, '') || '/';

  // Still allow public auth endpoints (re-login, reset flows)
  if (
    url === '/api/auth/login' ||
    url === '/api/auth/forgot-password' ||
    url === '/api/auth/reset-password' ||
    url === '/api/health'
  ) {
    next();
    return;
  }

  const allowed =
    url === '/api/auth/change-password' ||
    url === '/api/auth/logout' ||
    url === '/api/auth/me';

  if (!allowed) {
    next(new AppError(403, 'Password change required', 'MUST_CHANGE_PASSWORD'));
    return;
  }
  next();
}
