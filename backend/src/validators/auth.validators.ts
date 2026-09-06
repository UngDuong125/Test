import { z } from 'zod';
import { env } from '../config/env.js';
import { USERNAME_PATTERN } from '../services/username.service.js';

export const loginSchema = z
  .object({
    /** Preferred: email hoặc username */
    login: z.string().trim().min(1).max(254).optional(),
    /** Backward-compatible aliases */
    email: z.string().trim().min(1).max(254).optional(),
    username: z.string().trim().min(1).max(32).optional(),
    password: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (!data.login && !data.email && !data.username) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Provide login, email, or username',
        path: ['login'],
      });
    }
  })
  .transform((data) => ({
    login: (data.login ?? data.email ?? data.username)!.trim(),
    password: data.password,
  }));

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(env.PASSWORD_MIN_LENGTH),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(env.PASSWORD_MIN_LENGTH),
});

export const inviteUserSchema = z.object({
  email: z.string().email().transform((e) => e.trim().toLowerCase()),
  username: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(USERNAME_PATTERN, 'Username must be 3–32 chars: letters, digits, . _ -')
    .transform((u) => u.toLowerCase()),
  role: z.enum(['admin', 'teacher', 'student']),
  displayName: z.string().trim().min(1).max(120).optional().nullable(),
});

export const updateStatusSchema = z.object({
  status: z.enum(['invited', 'active', 'locked', 'disabled']),
});

export const updateRoleSchema = z.object({
  role: z.enum(['admin', 'teacher', 'student']),
});
