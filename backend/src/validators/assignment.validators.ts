import { z } from 'zod';

const assignSettingsSchema = z
  .object({
    shuffleQuestions: z.boolean().optional(),
    shuffleOptions: z.boolean().optional(),
    showResult: z.boolean().optional(),
    showExplanation: z.boolean().optional(),
  })
  .optional();

export const createAssignmentSchema = z
  .object({
    examId: z.string().uuid(),
    targetType: z.enum(['user', 'class']),
    targetId: z.string().uuid(),
    availableFrom: z.string().datetime(),
    deadline: z.string().datetime(),
    attemptLimit: z.number().int().min(1).max(50).default(1),
    settings: assignSettingsSchema,
  })
  .refine((d) => new Date(d.availableFrom) < new Date(d.deadline), {
    message: 'availableFrom must be before deadline',
    path: ['deadline'],
  });

export const assignExamSchema = z
  .object({
    targetType: z.enum(['user', 'class']),
    targetId: z.string().uuid(),
    availableFrom: z.string().datetime(),
    deadline: z.string().datetime(),
    attemptLimit: z.number().int().min(1).max(50).default(1),
    settings: assignSettingsSchema,
  })
  .refine((d) => new Date(d.availableFrom) < new Date(d.deadline), {
    message: 'availableFrom must be before deadline',
    path: ['deadline'],
  });

export const updateAssignmentSchema = z
  .object({
    availableFrom: z.string().datetime().optional(),
    deadline: z.string().datetime().optional(),
    attemptLimit: z.number().int().min(1).max(50).optional(),
    settings: assignSettingsSchema,
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' })
  .superRefine((data, ctx) => {
    if (data.availableFrom && data.deadline) {
      if (new Date(data.availableFrom) >= new Date(data.deadline)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'availableFrom must be before deadline',
          path: ['deadline'],
        });
      }
    }
  });

export const listAssignmentsQuerySchema = z.object({
  examId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  status: z
    .enum(['assigned', 'available', 'in_progress', 'completed', 'expired', 'cancelled'])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
