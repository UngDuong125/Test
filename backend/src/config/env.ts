import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Prefer process.env (Render/Vercel). .env only fills missing keys (dotenv default).
loadEnv({ path: path.resolve(__dirname, '../../.env') });
loadEnv({ path: path.resolve(__dirname, '../../../.env') });

const trimEmpty = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s.length ? s : undefined;
};

/** cloudinary://API_KEY:API_SECRET@CLOUD_NAME */
function parseCloudinaryUrl(url: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'cloudinary:') return null;
    const cloudName = parsed.hostname.trim();
    const apiKey = decodeURIComponent(parsed.username).trim();
    const apiSecret = decodeURIComponent(parsed.password).trim();
    if (!cloudName || !apiKey || !apiSecret) return null;
    return { cloudName, apiKey, apiSecret };
  } catch {
    return null;
  }
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().default('ta_session'),
  SESSION_TTL_HOURS: z.coerce.number().positive().default(168),
  COOKIE_SECURE: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      return v === 'true' || v === '1';
    }),
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
  CLOUDINARY_URL: z.preprocess(trimEmpty, z.string().optional()),
  CLOUDINARY_CLOUD_NAME: z.preprocess(trimEmpty, z.string().optional()),
  CLOUDINARY_API_KEY: z.preprocess(trimEmpty, z.string().optional()),
  CLOUDINARY_API_SECRET: z.preprocess(trimEmpty, z.string().optional()),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const fromUrl = parsed.data.CLOUDINARY_URL
  ? parseCloudinaryUrl(parsed.data.CLOUDINARY_URL)
  : null;

const cloudinaryCloudName =
  fromUrl?.cloudName ?? parsed.data.CLOUDINARY_CLOUD_NAME ?? '';
const cloudinaryApiKey = fromUrl?.apiKey ?? parsed.data.CLOUDINARY_API_KEY ?? '';
const cloudinaryApiSecret =
  fromUrl?.apiSecret ?? parsed.data.CLOUDINARY_API_SECRET ?? '';

const cloudinaryConfigured = Boolean(
  cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret,
);

if (parsed.data.CLOUDINARY_URL && !fromUrl) {
  console.warn('[cloudinary] CLOUDINARY_URL is set but could not be parsed (expected cloudinary://KEY:SECRET@CLOUD_NAME)');
}

export const env = {
  ...parsed.data,
  CLOUDINARY_CLOUD_NAME: cloudinaryCloudName,
  CLOUDINARY_API_KEY: cloudinaryApiKey,
  CLOUDINARY_API_SECRET: cloudinaryApiSecret,
  cloudinaryConfigured,
  isProd: parsed.data.NODE_ENV === 'production',
  cookieSecure: parsed.data.COOKIE_SECURE ?? parsed.data.NODE_ENV === 'production',
};
