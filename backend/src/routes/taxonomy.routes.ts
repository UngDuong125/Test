import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { listSubjects, listTopics } from '../repositories/taxonomy.repository.js';
import { listTopicsQuerySchema } from '../validators/question.validators.js';

export const taxonomyRouter = Router();

// Auth only on matched routes — do NOT use router.use(requireRole) here.
// This router is mounted at `/api`, so a blanket role gate would 403 student
// requests like `/api/students/me/*` before they reach studentsRouter.
taxonomyRouter.get('/subjects', requireAuth, requireRole('admin', 'teacher'), async (_req, res, next) => {
  try {
    const subjects = await listSubjects();
    res.json({ subjects });
  } catch (err) {
    next(err);
  }
});

taxonomyRouter.get('/topics', requireAuth, requireRole('admin', 'teacher'), async (req, res, next) => {
  try {
    const query = listTopicsQuerySchema.parse(req.query);
    const topics = await listTopics(query);
    res.json({ topics });
  } catch (err) {
    next(err);
  }
});
