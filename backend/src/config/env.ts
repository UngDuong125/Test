import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(__dirname, '../../.env') });
loadEnv({ path: path.resolve(__dirname, '../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default('ta_session'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).default(8),
  MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
  LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
  TEMP_PASSWORD_TTL_HOURS: z.coerce.number().positive().default(72),
  RESET_TOKEN_TTL_HOURS: z.coerce.number().positive().default(2),
  INVITE_TOKEN_TTL_HOURS: z.coerce.number().positive().default(72),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  EMAIL_FROM: z.string().default('TestArchive <noreply@testarchive.local>'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === 'production',
  cookieSecure: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production',
};
