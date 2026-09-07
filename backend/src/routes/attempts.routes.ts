import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as attemptsService from '../modules/attempts/attempts.service.js';
import * as gradingService from '../modules/grading/grading.service.js';
import { gradeAttemptSchema, saveAnswerSchema } from '../validators/attempt.validators.js';

export const attemptsRouter = Router();

attemptsRouter.use(requireAuth);

attemptsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await attemptsService.getAttemptForUser(req.auth!.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

attemptsRouter.patch('/:id/answers', requireRole('student'), async (req, res, next) => {
  try {
    const body = saveAnswerSchema.parse(req.body);
    const result = await attemptsService.saveAnswerForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

attemptsRouter.post('/:id/submit', requireRole('student', 'admin'), async (req, res, next) => {
  try {
    const result = await attemptsService.submitAttemptForUser(req.auth!.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

attemptsRouter.get('/:id/result', async (req, res, next) => {
  try {
    const result = await attemptsService.getAttemptResultForUser(
      req.auth!.user,
      req.params.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

attemptsRouter.post('/:id/grade', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = gradeAttemptSchema.parse(req.body);
    const result = await gradingService.gradeAttemptForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

attemptsRouter.post('/:id/regrade', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = gradeAttemptSchema.parse(req.body);
    const result = await gradingService.gradeAttemptForUser(
      req.auth!.user,
      req.params.id,
      body,
      { regrade: true },
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});
