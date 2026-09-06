import { z } from 'zod';
import { gradeSchema } from './content.validators.js';

export const createClassSchema = z.object({
  name: z.string().trim().min(1).max(100),
  grade: gradeSchema,
});

export const updateClassSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    grade: gradeSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'No fields to update' });

export const listClassesQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const addMembersSchema = z
  .object({
    userIds: z.array(z.string().uuid()).max(100).optional(),
    emails: z.array(z.string().email()).max(100).optional(),
  })
  .refine(
    (data) =>
      (data.userIds && data.userIds.length > 0) || (data.emails && data.emails.length > 0),
    { message: 'Provide userIds or emails' },
  );
