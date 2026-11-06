import { z } from 'zod';
import {
  answerSchema,
  contentSchema,
  difficultySchema,
  explanationSchema,
  gradeSchema,
  questionOptionSchema,
  questionStatusSchema,
  questionTypeSchema,
  tagKeySchema,
} from './content.validators.js';

export const createQuestionSchema = z.object({
  type: questionTypeSchema,
  subjectId: tagKeySchema,
  grade: gradeSchema,
  topicIds: z.array(z.string().uuid()).default([]),
  difficulty: difficultySchema.default('medium'),
  content: contentSchema,
  options: z.array(questionOptionSchema).default([]),
  answer: answerSchema,
  explanation: explanationSchema,
  points: z.number().positive().max(100).default(1),
  tags: z.array(z.string().trim().min(1).max(64)).max(30).default([]),
});

export const updateQuestionSchema = z
  .object({
    type: questionTypeSchema.optional(),
    subjectId: tagKeySchema.optional(),
    grade: gradeSchema.optional(),
    topicIds: z.array(z.string().uuid()).optional(),
    difficulty: difficultySchema.optional(),
    content: contentSchema.optional(),
    options: z.array(questionOptionSchema).optional(),
    answer: answerSchema.optional(),
    explanation: explanationSchema.optional(),
    points: z.number().positive().max(100).optional(),
    tags: z.array(z.string().trim().min(1).max(64)).max(30).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const listQuestionsQuerySchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: z.coerce.number().int().min(6).max(9).optional(),
  topicId: z.string().uuid().optional(),
  difficulty: difficultySchema.optional(),
  type: questionTypeSchema.optional(),
  status: questionStatusSchema.optional(),
  createdBy: z.string().uuid().optional(),
  tag: z.string().trim().min(1).max(64).optional(),
  q: z.string().trim().min(1).max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const listTopicsQuerySchema = z.object({
  subjectId: tagKeySchema.optional(),
  grade: z.coerce.number().int().min(6).max(9).optional(),
});

const topicNameSchema = z.string().trim().min(1).max(100);

export const createTopicSchema = z.object({
  subjectId: tagKeySchema,
  name: topicNameSchema,
  grade: gradeSchema.nullable().optional(),
});

export const updateTopicSchema = z
  .object({
    name: topicNameSchema.optional(),
    grade: gradeSchema.nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });
