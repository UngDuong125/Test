import { z } from 'zod';

export const saveAnswerSchema = z.object({
  questionId: z.string().uuid(),
  value: z.union([
    z.string(),
    z.array(z.string()),
    z.number(),
    z.null(),
  ]),
});

export const gradeAttemptSchema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        pointsEarned: z.number().min(0),
        isCorrect: z.boolean().nullable().optional(),
        feedback: z.string().max(5000).nullable().optional(),
      }),
    )
    .min(1),
  notes: z.string().max(5000).optional(),
});

export const gradingQueueQuerySchema = z.object({
  examId: z.string().uuid().optional(),
  classId: z.string().uuid().optional(),
  subjectId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
