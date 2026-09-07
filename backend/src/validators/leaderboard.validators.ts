import { z } from 'zod';
import { TAG_KEYS } from '../types/domain.js';

export const leaderboardQuerySchema = z.object({
  period: z.enum(['all', 'week', 'month', 'term', 'custom']).optional(),
  periodId: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  subjectId: z.enum(TAG_KEYS as [string, ...string[]]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export const analyticsWindowSchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  examId: z.string().uuid().optional(),
});

export const adminExpAdjustSchema = z.object({
  userId: z.string().uuid(),
  subjectId: z.enum(TAG_KEYS as [string, ...string[]]),
  delta: z.number().int(),
  reason: z.string().max(500).optional(),
});
