import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as analyticsService from '../modules/analytics/analytics.service.js';
import * as banksService from '../modules/question-banks/questionBanks.service.js';
import { analyticsWindowSchema } from '../validators/leaderboard.validators.js';
import {
  bankAddQuestionsSchema,
  bankRandomSchema,
  createQuestionBankSchema,
  listQuestionBanksQuerySchema,
  listQuestionsQuerySchema,
  updateQuestionBankSchema,
} from '../validators/question.validators.js';

export const questionBanksRouter = Router();

questionBanksRouter.use(requireAuth, requireRole('admin', 'teacher'));

questionBanksRouter.get('/', async (req, res, next) => {
  try {
    const query = listQuestionBanksQuerySchema.parse(req.query);
    const result = await banksService.listBanksForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.post('/', async (req, res, next) => {
  try {
    const body = createQuestionBankSchema.parse(req.body);
    const bank = await banksService.createBankForUser(req.auth!.user, body);
    res.status(201).json({ bank });
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.get('/:id', async (req, res, next) => {
  try {
    const bank = await banksService.getBankForUser(req.auth!.user, req.params.id);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateQuestionBankSchema.parse(req.body);
    const bank = await banksService.updateBankForUser(req.auth!.user, req.params.id, body);
    res.json({ bank });
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.delete('/:id', async (req, res, next) => {
  try {
    await banksService.deleteBankForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.get('/:id/questions', async (req, res, next) => {
  try {
    const query = listQuestionsQuerySchema
      .pick({ status: true, difficulty: true, type: true, limit: true, offset: true })
      .parse(req.query);
    const result = await banksService.listBankQuestions(req.auth!.user, req.params.id, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.post('/:id/questions', async (req, res, next) => {
  try {
    const body = bankAddQuestionsSchema.parse(req.body);
    const result = await banksService.addQuestionsToBankForUser(
      req.auth!.user,
      req.params.id,
      body.questionIds,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.delete('/:id/questions/:questionId', async (req, res, next) => {
  try {
    await banksService.removeQuestionFromBankForUser(
      req.auth!.user,
      req.params.id,
      req.params.questionId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.post('/:id/random', async (req, res, next) => {
  try {
    const body = bankRandomSchema.parse(req.body);
    const result = await banksService.randomFromBank(req.auth!.user, req.params.id, body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

questionBanksRouter.get('/:id/stats', async (req, res, next) => {
  try {
    const query = analyticsWindowSchema.parse(req.query);
    const stats = await analyticsService.getQuestionBankStats(
      req.auth!.user,
      req.params.id,
      query,
    );
    res.json(stats);
  } catch (err) {
    next(err);
  }
});
