import { Router } from 'express';
import type { CookieOptions, Response } from 'express';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { forgotPasswordRateLimit, loginRateLimit } from '../middleware/rateLimit.js';
import * as authService from '../modules/auth/auth.service.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '../validators/auth.validators.js';

export const authRouter = Router();

function sessionCookieOptions(expiresAt: Date): CookieOptions {
  return {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

function clearSessionCookie(res: Response) {
  res.clearCookie(env.SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: 'lax',
    path: '/',
  });
}

authRouter.post('/login', loginRateLimit, async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await authService.login(body.login, body.password);
    res.cookie(env.SESSION_COOKIE_NAME, result.rawToken, sessionCookieOptions(new Date(result.expiresAt)));
    res.json({
      user: result.user,
      expiresAt: result.expiresAt,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await authService.logout(req.auth!.session.id);
    clearSessionCookie(res);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.auth!.user });
});

authRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const body = changePasswordSchema.parse(req.body);
    const user = await authService.changePassword(
      req.auth!.user.id,
      body.currentPassword,
      body.newPassword,
    );
    // Sessions revoked — clear cookie; client must login again
    clearSessionCookie(res);
    res.json({ user, requireLogin: true });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/forgot-password', forgotPasswordRateLimit, async (req, res, next) => {
  try {
    const body = forgotPasswordSchema.parse(req.body);
    const result = await authService.forgotPassword(body.email);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const body = resetPasswordSchema.parse(req.body);
    const user = await authService.resetPassword(body.token, body.newPassword);
    clearSessionCookie(res);
    res.json({ user, requireLogin: true });
  } catch (err) {
    next(err);
  }
});
