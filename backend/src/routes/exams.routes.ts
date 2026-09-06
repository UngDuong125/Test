import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as examsService from '../modules/exams/exams.service.js';
import {
  assignExamHandler,
  listExamAssignmentsHandler,
} from './assignments.routes.js';
import {
  addExamQuestionsSchema,
  createExamQuestionSchema,
  createExamSchema,
  createSectionSchema,
  generateExamSchema,
  listExamsQuerySchema,
  publishExamSchema,
  updateExamQuestionSchema,
  updateExamSchema,
  updateSectionSchema,
} from '../validators/exam.validators.js';

export const examsRouter = Router();

examsRouter.use(requireAuth, requireRole('admin', 'teacher'));

examsRouter.get('/', async (req, res, next) => {
  try {
    const query = listExamsQuerySchema.parse(req.query);
    const result = await examsService.listExamsForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/generate', async (req, res, next) => {
  try {
    const body = generateExamSchema.parse(req.body);
    const result = await examsService.generateExamForUser(req.auth!.user, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/', async (req, res, next) => {
  try {
    const body = createExamSchema.parse(req.body);
    const exam = await examsService.createExamForUser(req.auth!.user, body);
    res.status(201).json({ exam });
  } catch (err) {
    next(err);
  }
});

examsRouter.get('/:id', async (req, res, next) => {
  try {
    const detail = await examsService.getExamForUser(req.auth!.user, req.params.id);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

examsRouter.patch('/:id', async (req, res, next) => {
  try {
    const body = updateExamSchema.parse(req.body);
    const exam = await examsService.updateExamForUser(req.auth!.user, req.params.id, body);
    res.json({ exam });
  } catch (err) {
    next(err);
  }
});

examsRouter.delete('/:id', async (req, res, next) => {
  try {
    await examsService.deleteExamForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/sections', async (req, res, next) => {
  try {
    const body = createSectionSchema.parse(req.body);
    const section = await examsService.addSectionForUser(req.auth!.user, req.params.id, body);
    res.status(201).json({ section });
  } catch (err) {
    next(err);
  }
});

examsRouter.patch('/:id/sections/:sectionId', async (req, res, next) => {
  try {
    const body = updateSectionSchema.parse(req.body);
    const section = await examsService.updateSectionForUser(
      req.auth!.user,
      req.params.id,
      req.params.sectionId,
      body,
    );
    res.json({ section });
  } catch (err) {
    next(err);
  }
});

examsRouter.delete('/:id/sections/:sectionId', async (req, res, next) => {
  try {
    await examsService.deleteSectionForUser(
      req.auth!.user,
      req.params.id,
      req.params.sectionId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

/** Composer: create Question draft + attach (must be registered before /:id/questions/:questionId). */
examsRouter.post('/:id/questions/create', async (req, res, next) => {
  try {
    const body = createExamQuestionSchema.parse(req.body);
    const result = await examsService.createQuestionOnExamForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/questions', async (req, res, next) => {
  try {
    const body = addExamQuestionsSchema.parse(req.body);
    const result = await examsService.addQuestionsToExamForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

examsRouter.patch('/:id/questions/:questionId', async (req, res, next) => {
  try {
    const body = updateExamQuestionSchema.parse(req.body);
    const question = await examsService.updateExamQuestionForUser(
      req.auth!.user,
      req.params.id,
      req.params.questionId,
      body,
    );
    res.json({ question });
  } catch (err) {
    next(err);
  }
});

examsRouter.delete('/:id/questions/:questionId', async (req, res, next) => {
  try {
    await examsService.removeExamQuestionForUser(
      req.auth!.user,
      req.params.id,
      req.params.questionId,
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/validate', async (req, res, next) => {
  try {
    const result = await examsService.validateExamForPublish(req.auth!.user, req.params.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/publish', async (req, res, next) => {
  try {
    const body = publishExamSchema.parse(req.body ?? {});
    const detail = await examsService.publishExam(req.auth!.user, req.params.id, body);
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/archive', async (req, res, next) => {
  try {
    const exam = await examsService.archiveExam(req.auth!.user, req.params.id);
    res.json({ exam });
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/duplicate', async (req, res, next) => {
  try {
    const detail = await examsService.duplicateExam(req.auth!.user, req.params.id);
    res.status(201).json(detail);
  } catch (err) {
    next(err);
  }
});

examsRouter.post('/:id/assign', assignExamHandler);
examsRouter.get('/:id/assignments', listExamAssignmentsHandler);
