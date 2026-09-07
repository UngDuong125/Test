import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as leaderboardService from '../modules/leaderboard/leaderboard.service.js';
import {
  adminExpAdjustSchema,
  leaderboardQuerySchema,
} from '../validators/leaderboard.validators.js';

export const leaderboardRouter = Router();

leaderboardRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const query = leaderboardQuerySchema.parse(req.query);
    const result = await leaderboardService.getLeaderboard(req.auth!.user, {
      ...query,
      subjectId: query.subjectId as import('../types/domain.js').TagKey | undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

leaderboardRouter.get('/periods', requireAuth, async (req, res, next) => {
  try {
    const result = await leaderboardService.listPeriods();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Admin EXP tools mounted under /api/admin/exp via separate paths in app, or here: */
export const adminExpRouter = Router();
adminExpRouter.use(requireAuth, requireRole('admin'));

adminExpRouter.post('/rebuild-projections', async (req, res, next) => {
  try {
    const result = await leaderboardService.rebuildProjections(req.auth!.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

adminExpRouter.post('/adjust', async (req, res, next) => {
  try {
    const body = adminExpAdjustSchema.parse(req.body);
    const result = await leaderboardService.adminAdjustExp(req.auth!.user, {
      ...body,
      subjectId: body.subjectId as import('../types/domain.js').TagKey,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
