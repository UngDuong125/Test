import { z } from 'zod';
import { gradeSchema, tagKeySchema } from './content.validators.js';

export const vocabularyEntryStatusSchema = z.enum(['draft', 'published', 'archived']);
export const vocabularyReviewResultSchema = z.enum(['pass', 'fail']);

export const createVocabularyEntrySchema = z.object({
  subjectId: tagKeySchema,
  grade: gradeSchema,
  term: z.string().trim().min(1).max(500),
  reading: z.string().trim().max(500).nullable().optional(),
  definition: z.string().trim().min(1).max(2000),
  example: z.string().trim().max(2000).nullable().optional(),
  mediaId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
  status: vocabularyEntryStatusSchema.default('draft'),
  bankId: z.string().uuid().optional(),
});

export const updateVocabularyEntrySchema = z
  .object({
    subjectId: tagKeySchema.optional(),
    grade: gradeSchema.optional(),
    term: z.string().trim().min(1).max(500).optional(),
    reading: z.string().trim().max(500).nullable().optional(),
    definition: z.string().trim().min(1).max(2000).optional(),
    example: z.string().trim().max(2000).nullable().optional(),
    mediaId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
    status: vocabularyEntryStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const listVocabularyEntriesQuerySchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: z.coerce.number().int().min(6).max(9).optional(),
  status: vocabularyEntryStatusSchema.optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const createVocabularyBankSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).default(''),
  subjectId: tagKeySchema,
  grade: gradeSchema,
});

export const updateVocabularyBankSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    subjectId: tagKeySchema.optional(),
    grade: gradeSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const listVocabularyBanksQuerySchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: z.coerce.number().int().min(6).max(9).optional(),
  ownerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const bankAddEntriesSchema = z.object({
  entryIds: z.array(z.string().uuid()).min(1).max(100),
});

export const assignVocabularyBankSchema = z
  .object({
    targetType: z.enum(['user', 'class']),
    targetId: z.string().uuid(),
    availableFrom: z.string().datetime(),
    deadline: z.string().datetime().nullable().optional(),
  })
  .refine(
    (data) =>
      data.deadline == null || new Date(data.availableFrom) < new Date(data.deadline),
    { message: 'availableFrom must be before deadline', path: ['deadline'] },
  );

export const createVocabularyAssignmentSchema = z
  .object({
    bankId: z.string().uuid(),
    targetType: z.enum(['user', 'class']),
    targetId: z.string().uuid(),
    availableFrom: z.string().datetime(),
    deadline: z.string().datetime().nullable().optional(),
  })
  .refine(
    (data) =>
      data.deadline == null || new Date(data.availableFrom) < new Date(data.deadline),
    { message: 'availableFrom must be before deadline', path: ['deadline'] },
  );

export const listVocabularyAssignmentsQuerySchema = z.object({
  bankId: z.string().uuid().optional(),
  targetId: z.string().uuid().optional(),
  status: z.enum(['active', 'completed', 'cancelled']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const reviewVocabularyCardSchema = z.object({
  result: vocabularyReviewResultSchema,
});
