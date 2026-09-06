import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as classesService from '../modules/classes/classes.service.js';
import {
  addMembersSchema,
  createClassSchema,
  listClassesQuerySchema,
  updateClassSchema,
} from '../validators/class.validators.js';

export const classesRouter = Router();

classesRouter.use(requireAuth);

classesRouter.get('/', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const query = listClassesQuerySchema.parse(req.query);
    const result = await classesService.listClassesForUser(req.auth!.user, query);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

classesRouter.post('/', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = createClassSchema.parse(req.body);
    const cls = await classesService.createClassForUser(req.auth!.user, body);
    res.status(201).json({ class: cls });
  } catch (err) {
    next(err);
  }
});

classesRouter.get('/:id', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const cls = await classesService.getClassForUser(req.auth!.user, req.params.id);
    res.json({ class: cls });
  } catch (err) {
    next(err);
  }
});

classesRouter.patch('/:id', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = updateClassSchema.parse(req.body);
    const cls = await classesService.updateClassForUser(req.auth!.user, req.params.id, body);
    res.json({ class: cls });
  } catch (err) {
    next(err);
  }
});

classesRouter.delete('/:id', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    await classesService.deleteClassForUser(req.auth!.user, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

classesRouter.get('/:id/members', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const members = await classesService.listMembersForUser(req.auth!.user, req.params.id);
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

classesRouter.post('/:id/members', requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const body = addMembersSchema.parse(req.body);
    const result = await classesService.addMembersForUser(req.auth!.user, req.params.id, body);
    const status = result.errors.length > 0 && result.added.length === 0 ? 422 : 200;
    res.status(status).json(result);
  } catch (err) {
    next(err);
  }
});

classesRouter.delete(
  '/:id/members/:userId',
  requireRole('admin', 'teacher'),
  async (req, res, next) => {
    try {
      await classesService.removeMemberForUser(
        req.auth!.user,
        req.params.id,
        req.params.userId,
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  },
);
