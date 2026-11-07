import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as analyticsService from '../modules/analytics/analytics.service.js';
import * as assignmentsService from '../modules/assignments/assignments.service.js';
import * as attemptsService from '../modules/attempts/attempts.service.js';
import * as classesService from '../modules/classes/classes.service.js';
import * as leaderboardService from '../modules/leaderboard/leaderboard.service.js';
import { listAssignmentsQuerySchema } from '../validators/assignment.validators.js';
import * as vocabularyService from '../modules/vocabulary/vocabulary.service.js';
import * as practiceService from '../modules/practice/practice.service.js';
import { listVocabularyAssignmentsQuerySchema } from '../validators/vocabulary.validators.js';
import { saveAnswerSchema } from '../validators/attempt.validators.js';

export const studentsRouter = Router();

studentsRouter.use(requireAuth);

studentsRouter.get('/me/assignments', requireRole('student'), async (req, res, next) => {
  try {
    const query = listAssignmentsQuerySchema.parse(req.query);
    const result = await assignmentsService.listMyAssignments(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/vocabulary-assignments', requireRole('student'), async (req, res, next) => {
  try {
    const query = listVocabularyAssignmentsQuerySchema
      .pick({ status: true, limit: true, offset: true })
      .parse(req.query);
    const result = await vocabularyService.listMyVocabularyAssignments(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/vocabulary/due', requireRole('student'), async (req, res, next) => {
  try {
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(30).optional(),
        after: z.string().min(1).optional(),
        afterId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const result = await vocabularyService.listDueForStudent(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/vocabulary/extra', requireRole('student'), async (req, res, next) => {
  try {
    res.json(await vocabularyService.listExtraPracticeForStudent(req.auth!.user));
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/vocabulary/stats', requireRole('student'), async (req, res, next) => {
  try {
    const stats = await vocabularyService.getMyVocabularyStats(req.auth!.user);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/classes', requireRole('student'), async (req, res, next) => {
  try {
    const items = await classesService.listMyClasses(req.auth!.user);
    res.json({ items });
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/results', requireRole('student'), async (req, res, next) => {
  try {
    const result = await attemptsService.listStudentResults(req.auth!.user, req.auth!.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/history', requireRole('student'), async (req, res, next) => {
  try {
    const query = z.object({ subjectId: z.string().min(1).optional() }).parse(req.query);
    const result = await attemptsService.getMyHistory(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/practice', requireRole('student'), async (req, res, next) => {
  try {
    res.json(await practiceService.listPracticeQuestions(req.auth!.user));
  } catch (err) {
    next(err);
  }
});

studentsRouter.post('/me/practice/check', requireRole('student'), async (req, res, next) => {
  try {
    const body = saveAnswerSchema
      .extend({ attemptId: z.string().uuid() })
      .parse(req.body);
    res.json(await practiceService.checkPracticeAnswer(req.auth!.user, body));
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/stats', requireRole('student'), async (req, res, next) => {
  try {
    const stats = await analyticsService.getMyStats(req.auth!.user);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get('/me/exp', requireRole('student'), async (req, res, next) => {
  try {
    const result = await leaderboardService.getStudentExp(req.auth!.user, req.auth!.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

studentsRouter.get(
  '/:id/assignments',
  requireRole('admin', 'teacher', 'student'),
  async (req, res, next) => {
    try {
      const query = listAssignmentsQuerySchema.parse(req.query);
      const result = await assignmentsService.listStudentAssignments(
        req.auth!.user,
        req.params.id,
        query,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.get(
  '/:id/vocabulary-assignments',
  requireRole('admin', 'teacher', 'student'),
  async (req, res, next) => {
    try {
      const query = listVocabularyAssignmentsQuerySchema
        .pick({ status: true, limit: true, offset: true })
        .parse(req.query);
      const result = await vocabularyService.listStudentVocabularyAssignments(
        req.auth!.user,
        req.params.id,
        query,
      );
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.get(
  '/:id/results',
  requireRole('admin', 'teacher', 'student'),
  async (req, res, next) => {
    try {
      const result = await attemptsService.listStudentResults(req.auth!.user, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

studentsRouter.get(
  '/:id/exp',
  requireRole('admin', 'teacher', 'student'),
  async (req, res, next) => {
    try {
      const result = await leaderboardService.getStudentExp(req.auth!.user, req.params.id);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);
