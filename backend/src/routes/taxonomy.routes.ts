import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listSubjects, listTopics } from '../repositories/taxonomy.repository.js';
import { listTopicsQuerySchema } from '../validators/question.validators.js';

export const taxonomyRouter = Router();

taxonomyRouter.use(requireAuth, requireRole('admin', 'teacher'));

taxonomyRouter.get('/subjects', async (_req, res, next) => {
  try {
    const subjects = await listSubjects();
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
});

taxonomyRouter.get('/topics', async (req, res, next) => {
  try {
    const query = listTopicsQuerySchema.parse(req.query);
    const topics = await listTopics(query);
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});
