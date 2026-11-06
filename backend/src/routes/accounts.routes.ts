import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as accountsService from '../modules/accounts/accounts.service.js';

/** Account actions teachers may take for their own students. Mounted at /api/users. */
export const accountsRouter = Router();

accountsRouter.post(
  '/:id/temporary-password',
  requireAuth,
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const result = await accountsService.resetTemporaryPassword(req.auth!.user, req.params.id);
      res.set('Cache-Control', 'no-store');
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
