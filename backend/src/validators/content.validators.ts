import { z } from 'zod';

export const tagKeySchema = z.enum(['math', 'lang', 'flang', 'sci', 'hist_geo', 'civic']);
export const gradeSchema = z.number().int().min(6).max(9);
export const difficultySchema = z.enum(['easy', 'medium', 'hard']);
export const questionTypeSchema = z.enum([
  'multiple_choice',
  'true_false',
  'fill_blank',
  'short_answer',
  'essay',
  'multiple_select',
  'matching',
  'ordering',
  'numeric',
]);
export const questionStatusSchema = z.enum(['draft', 'review', 'published', 'archived']);
export const examTypeSchema = z.enum([
  'practice',
  'quiz',
  'homework',
  'worksheet',
  'midterm',
  'final',
]);
export const examStatusSchema = z.enum(['draft', 'published', 'archived']);

const textBlockSchema = z.object({
  type: z.literal('text'),
  value: z.string().min(1).max(20_000),
});

const latexBlockSchema = z.object({
  type: z.literal('latex'),
  value: z
    .string()
    .min(1)
    .max(10_000)
    .refine((v) => (v.match(/\{/g)?.length ?? 0) === (v.match(/\}/g)?.length ?? 0), {
      message: 'LaTeX braces must be balanced',
    }),
});

const imageBlockSchema = z.object({
  type: z.literal('image'),
  mediaId: z.string().uuid(),
});

export const contentBlockSchema = z.discriminatedUnion('type', [
  textBlockSchema,
  latexBlockSchema,
  imageBlockSchema,
]);

export const contentSchema = z.array(contentBlockSchema).min(1);

export const questionOptionSchema = z.object({
  id: z.string().trim().min(1).max(32),
  content: z.union([
    contentBlockSchema,
    z.array(contentBlockSchema).min(1),
    z.record(z.unknown()),
  ]),
  order: z.number().int().min(0).default(0),
});

export const answerSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single'), value: z.string().min(1) }),
  z.object({ type: z.literal('multiple'), value: z.array(z.string().min(1)).min(1) }),
  z.object({ type: z.literal('text'), value: z.array(z.string().min(1)).min(1) }),
  z.object({
    type: z.literal('numeric'),
    value: z.number(),
    tolerance: z.number().nonnegative().optional(),
  }),
  z.object({ type: z.literal('manual') }),
]);

export const explanationSchema = z
  .object({
    text: z.string().max(20_000).optional(),
    steps: z.array(z.string().max(2000)).optional(),
  })
  .default({});

export const examSettingsSchema = z
  .object({
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(true),
    showResult: z.boolean().default(true),
    showExplanation: z.boolean().default(true),
  })
  .default({
    shuffleQuestions: false,
    shuffleOptions: true,
    showResult: true,
    showExplanation: true,
  });

export const difficultyMixSchema = z
  .object({
    easy: z.number().min(0).max(1).optional(),
    medium: z.number().min(0).max(1).optional(),
    hard: z.number().min(0).max(1).optional(),
  })
  .optional();

export const randomSelectionSchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: gradeSchema.optional(),
  topicIds: z.array(z.string().uuid()).optional(),
  count: z.number().int().min(1).max(100),
  difficulty: difficultyMixSchema,
  types: z.array(questionTypeSchema).optional(),
  bankId: z.string().uuid().optional(),
  status: z.literal('published').optional(),
});
