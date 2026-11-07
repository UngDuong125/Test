import type { StudentAnswerValue } from '@/types/content';

/** A value counts as answered when the student has put something in it. */
export function isAnswered(value: StudentAnswerValue | undefined): boolean {
  if (value == null) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

/** Backoff schedule for failed answer saves (ms). The last value repeats. */
export const SAVE_RETRY_DELAYS_MS = [2_000, 5_000, 10_000, 20_000] as const;

export function saveRetryDelay(failures: number): number {
  const i = Math.min(Math.max(failures, 1), SAVE_RETRY_DELAYS_MS.length) - 1;
  return SAVE_RETRY_DELAYS_MS[i];
}

/**
 * Network failures, timeouts, rate limits and server errors are worth retrying.
 * Other 4xx (attempt already submitted, expired, validation) will not get better.
 */
export function isRetryableSaveError(err: unknown): boolean {
  if (err && typeof err === 'object' && 'status' in err) {
    const status = Number((err as { status: unknown }).status);
    return status === 0 || status === 408 || status === 429 || status >= 500;
  }
  // fetch() rejects with TypeError when offline / DNS / CORS failure.
  return true;
}

export type TimeWarning = 'five' | 'one';

/** Time-left warnings in descending order of remaining time. */
export const TIME_WARNINGS: { key: TimeWarning; thresholdMs: number; label: string }[] = [
  { key: 'five', thresholdMs: 5 * 60_000, label: 'Còn 5 phút' },
  { key: 'one', thresholdMs: 60_000, label: 'Còn 1 phút' },
];

/**
 * The most urgent warning whose threshold has been crossed, or null.
 * Warnings only apply while time remains.
 */
export function currentTimeWarning(remainingMs: number | null): TimeWarning | null {
  if (remainingMs == null || remainingMs <= 0) return null;
  let hit: TimeWarning | null = null;
  for (const w of TIME_WARNINGS) {
    if (remainingMs <= w.thresholdMs) hit = w.key;
  }
  return hit;
}

/** The session ended (logout elsewhere, expiry): ask to log in again, keep the answers. */
export function isSessionExpiredError(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'status' in err && (err as { status: unknown }).status === 401);
}
