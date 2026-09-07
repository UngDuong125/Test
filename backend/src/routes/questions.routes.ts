import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as analyticsService from '../modules/analytics/analytics.service.js';
import * as questionsService from '../modules/questions/questions.service.js';
import { analyticsWindowSchema } from '../validators/leaderboard.validators.js';
import {
  createQuestionSchema,
  listQuestionsQuerySchema,
  updateQuestionSchema,
} from '../validators/question.validators.js';

export const questionsRouter = Router();

questionsRouter.use(requireAuth, requireRole('admin', 'teacher'));

questionsRouter.get('/', async (req, res, next) => {
  try {
    const query = listQuestionsQuerySchema.parse(req.query);
    const result = await questionsService.listQuestionsForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/', async (req, res, next) => {
  try {
    const body = createQuestionSchema.parse(req.body);
    const question = await questionsService.createQuestionForUser(req.auth!.user, body);
    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.get('/:id', async (req, res, next) => {
  try {
    const question = await questionsService.getQuestionForUser(req.auth!.user, req.params.id);
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateQuestionSchema.parse(req.body);
    const question = await questionsService.updateQuestionForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.delete('/:id', async (req, res, next) => {
  try {
    await questionsService.deleteQuestionForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/:id/submit-review', async (req, res, next) => {
  try {
    const question = await questionsService.submitQuestionReview(req.auth!.user, req.params.id);
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const question = await questionsService.publishQuestion(req.auth!.user, req.params.id);
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/:id/archive', async (req, res, next) => {
  try {
    const question = await questionsService.archiveQuestion(req.auth!.user, req.params.id);
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/:id/reject-review', async (req, res, next) => {
  try {
    const question = await questionsService.rejectQuestionReview(req.auth!.user, req.params.id);
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const question = await questionsService.duplicateQuestion(req.auth!.user, req.params.id);
    res.status(201).json({ question });
  } catch (err) {
    next(err);
  }
});

questionsRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const query = analyticsWindowSchema.parse(req.query);
    const stats = await analyticsService.getQuestionStats(
      req.auth!.user,
      req.params.id,
      query,
    );
    res.json(stats);
  } catch (err) {
    next(err);
  }
});
