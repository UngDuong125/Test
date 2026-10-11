// Loaded via `--import` before any test so `config/env.ts` validates without a real .env.
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL ??= 'http://localhost:54321';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';
process.env.TZ ??= 'UTC';
