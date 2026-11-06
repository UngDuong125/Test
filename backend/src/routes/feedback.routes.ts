import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import * as feedbackService from '../modules/feedback/feedback.service.js';

export const feedbackTemplatesRouter = Router();

feedbackTemplatesRouter.use(requireAuth, requireRole('admin', 'teacher'));

feedbackTemplatesRouter.get('/', async (req, res, next) => {
  try {
    res.json({ items: await feedbackService.listMyTemplates(req.auth!.user) });
  } catch (err) {
    next(err);
  }
});

feedbackTemplatesRouter.post('/', async (req, res, next) => {
  try {
    const body = z.object({ text: z.string().min(1).max(300) }).parse(req.body);
    const template = await feedbackService.addMyTemplate(req.auth!.user, body.text);
    res.status(201).json({ template });
  } catch (err) {
    next(err);
  }
});

feedbackTemplatesRouter.delete('/:id', async (req, res, next) => {
  try {
    z.string().uuid().parse(req.params.id);
    await feedbackService.removeMyTemplate(req.auth!.user, req.params.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});
