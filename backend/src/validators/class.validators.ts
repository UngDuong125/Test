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
    usernames: z.array(z.string().min(1).max(64)).max(100).optional(),
    /** Also give new members the class's exams that are still open. */
    syncAssignments: z.boolean().optional(),
  })
  .refine(
    (data) =>
      (data.userIds?.length ?? 0) + (data.emails?.length ?? 0) + (data.usernames?.length ?? 0) > 0,
    { message: 'Provide userIds, emails or usernames' },
  );

export const transferMembersSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1).max(200),
  targetClassId: z.string().uuid(),
  removeFromSource: z.boolean().default(true),
});
