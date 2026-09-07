import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as assignmentsService from '../modules/assignments/assignments.service.js';
import * as attemptsService from '../modules/attempts/attempts.service.js';
import {
  assignExamSchema,
  createAssignmentSchema,
  listAssignmentsQuerySchema,
  updateAssignmentSchema,
} from '../validators/assignment.validators.js';

export const assignmentsRouter = Router();

assignmentsRouter.use(requireAuth);

assignmentsRouter.get('/', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const query = listAssignmentsQuerySchema.parse(req.query);
    const result = await assignmentsService.listAssignmentsForTeacher(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post('/', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = createAssignmentSchema.parse(req.body);
    const result = await assignmentsService.createAssignmentForUser(req.auth!.user, body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.get('/:id', async (req, res, next) => {
  try {
    const assignment = await assignmentsService.getAssignmentForUser(
      req.auth!.user,
      req.params.id,
    );
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.patch('/:id', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = updateAssignmentSchema.parse(req.body);
    const assignment = await assignmentsService.updateAssignmentForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.delete('/:id', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const assignment = await assignmentsService.deleteAssignmentForUser(
      req.auth!.user,
      req.params.id,
    );
    res.json({ assignment });
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.post(
  '/:id/cancel',
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      const assignment = await assignmentsService.cancelAssignmentForUser(
        req.auth!.user,
        req.params.id,
      );
      res.json({ assignment });
    } catch (err) {
      next(err);
    }
  },
);

assignmentsRouter.post('/:id/attempts', requireRole('student'), async (req, res, next) => {
  try {
    const result = await attemptsService.startAttemptForAssignment(
      req.auth!.user,
      req.params.id,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

assignmentsRouter.get('/:id/attempts', async (req, res, next) => {
  try {
    const result = await attemptsService.listAssignmentAttemptsSummary(
      req.auth!.user,
      req.params.id,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/** Nested on exams router as well — shared handler export */
export async function assignExamHandler(req: import('express').Request, res: import('express').Response, next: import('express').NextFunction) {
  try {
    const body = assignExamSchema.parse(req.body);
    const result = await assignmentsService.assignExamForUser(
      req.auth!.user,
      req.params.id,
      body,
    );
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function listExamAssignmentsHandler(
  req: import('express').Request,
  res: import('express').Response,
  next: import('express').NextFunction,
) {
  try {
    const query = listAssignmentsQuerySchema.parse(req.query);
    const result = await assignmentsService.listExamAssignmentsForUser(
      req.auth!.user,
      req.params.id,
      query,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}
