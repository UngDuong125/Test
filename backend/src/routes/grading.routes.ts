import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as gradingService from '../modules/grading/grading.service.js';
import { gradingQueueQuerySchema } from '../validators/attempt.validators.js';

export const gradingRouter = Router();

gradingRouter.use(requireAuth);
gradingRouter.use(requireRole('admin', 'teacher'));

gradingRouter.get('/queue', async (req, res, next) => {
  try {
    const query = gradingQueueQuerySchema.parse(req.query);
    const result = await gradingService.listGradingQueue(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

gradingRouter.get('/:attemptId', async (req, res, next) => {
  try {
    const result = await gradingService.getGradingDetail(
      req.auth!.user,
      req.params.attemptId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
