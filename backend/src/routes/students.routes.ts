import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as assignmentsService from '../modules/assignments/assignments.service.js';
import * as classesService from '../modules/classes/classes.service.js';
import { listAssignmentsQuerySchema } from '../validators/assignment.validators.js';

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

studentsRouter.get('/me/classes', requireRole('student'), async (req, res, next) => {
  try {
    const items = await classesService.listMyClasses(req.auth!.user);
    res.json({ items });
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
