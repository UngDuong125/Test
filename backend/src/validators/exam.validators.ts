import { z } from 'zod';
import {
  difficultySchema,
  examSettingsSchema,
  examTypeSchema,
  gradeSchema,
  randomSelectionSchema,
  tagKeySchema,
} from './content.validators.js';
import { createQuestionSchema } from './question.validators.js';

export const createExamSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).default(''),
  subjectId: tagKeySchema,
  grade: gradeSchema,
  type: examTypeSchema.default('practice'),
  difficulty: difficultySchema.default('medium'),
  duration: z.number().int().positive().max(600),
  totalPoints: z.number().nonnegative().max(1000).default(0),
  instructions: z.string().trim().max(10_000).default(''),
  settings: examSettingsSchema,
});

export const updateExamSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(5000).optional(),
    subjectId: tagKeySchema.optional(),
    grade: gradeSchema.optional(),
    type: examTypeSchema.optional(),
    difficulty: difficultySchema.optional(),
    duration: z.number().int().positive().max(600).optional(),
    totalPoints: z.number().nonnegative().max(1000).optional(),
    instructions: z.string().trim().max(10_000).optional(),
    settings: examSettingsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const listExamsQuerySchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: z.coerce.number().int().min(6).max(9).optional(),
  type: examTypeSchema.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  ownerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createSectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  order: z.number().int().min(1).optional(),
});

export const updateSectionSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    order: z.number().int().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const addExamQuestionsSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(100),
  sectionId: z.string().uuid().nullable().optional(),
  points: z.number().positive().max(100).optional(),
});

export const updateExamQuestionSchema = z
  .object({
    sectionId: z.string().uuid().nullable().optional(),
    order: z.number().int().min(1).optional(),
    points: z.number().positive().max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const publishExamSchema = z
  .object({
    publishDraftQuestions: z.boolean().optional().default(false),
  })
  .default({});

/** Create Question draft + attach to exam (composer). */
export const createExamQuestionSchema = createQuestionSchema.extend({
  sectionId: z.string().uuid().nullable().optional(),
  examPoints: z.number().positive().max(100).optional(),
});

export const generateExamSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).default(''),
  subjectId: tagKeySchema,
  grade: gradeSchema,
  type: examTypeSchema.default('practice'),
  difficulty: difficultySchema.default('medium'),
  duration: z.number().int().positive().max(600),
  bankId: z.string().uuid().optional(),
  selection: randomSelectionSchema.omit({ bankId: true, subjectId: true, grade: true, status: true }),
  sectionTitle: z.string().trim().min(1).max(200).default('Phần 1'),
  defaultPoints: z.number().positive().max(100).optional(),
  instructions: z.string().trim().max(10_000).default(''),
  settings: examSettingsSchema,
});
