import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { env } from './config/env.js';
import { authMiddleware, enforcePasswordChangeGate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { assignmentsRouter } from './routes/assignments.routes.js';
import { attemptsRouter } from './routes/attempts.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { classesRouter } from './routes/classes.routes.js';
import { examsRouter } from './routes/exams.routes.js';
import { gradingRouter } from './routes/grading.routes.js';
import { adminExpRouter, leaderboardRouter } from './routes/leaderboard.routes.js';
import { questionBanksRouter } from './routes/questionBanks.routes.js';
import { questionsRouter } from './routes/questions.routes.js';
import { studentsRouter } from './routes/students.routes.js';
import { taxonomyRouter } from './routes/taxonomy.routes.js';
import { uploadRouter } from './routes/upload.routes.js';
import { usersRouter } from './routes/users.routes.js';
import {
  vocabularyAssignmentsRouter,
  vocabularyBanksRouter,
  vocabularyCardsRouter,
  vocabularyEntriesRouter,
} from './routes/vocabulary.routes.js';

export function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(authMiddleware);
  app.use(enforcePasswordChangeGate);

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      service: 'test-archive-api',
      cloudinaryConfigured: env.cloudinaryConfigured,
    });
  });


  app.use('/api/auth', authRouter);
  app.use('/api/admin/users', usersRouter);
  app.use('/api/admin/exp', adminExpRouter);
  app.use('/api', taxonomyRouter);
  app.use('/api/questions', questionsRouter);
  app.use('/api/question-banks', questionBanksRouter);
  app.use('/api/vocabulary-banks', vocabularyBanksRouter);
  app.use('/api/vocabulary-entries', vocabularyEntriesRouter);
  app.use('/api/vocabulary-assignments', vocabularyAssignmentsRouter);
  app.use('/api/vocabulary-cards', vocabularyCardsRouter);
  app.use('/api/exams', examsRouter);
  app.use('/api/classes', classesRouter);
  app.use('/api/exam-assignments', assignmentsRouter);
  app.use('/api/attempts', attemptsRouter);
  app.use('/api/grading', gradingRouter);
  app.use('/api/leaderboard', leaderboardRouter);
  app.use('/api/students', studentsRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/media', uploadRouter);

  app.use(errorHandler);
  return app;
}
