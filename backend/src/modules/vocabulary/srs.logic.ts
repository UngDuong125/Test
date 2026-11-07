import { VOCABULARY_INTERVAL_DAYS } from '../../types/domain.js';
import type { VocabularyCardStatus, VocabularyReviewResult } from '../../types/domain.js';

export const DEFAULT_SRS_TIME_ZONE = 'Asia/Ho_Chi_Minh';

const MAX_STEP = VOCABULARY_INTERVAL_DAYS.length - 1;

/**
 * Due dates snap to 00:00 in `timeZone`, so a card reviewed at any hour becomes due
 * at the start of the target calendar day. Passing at the last step (after the 30-day gap)
 * marks the card `mastered`.
 */
export function nextIntervalAfterReview(
  currentStep: number,
  result: VocabularyReviewResult,
  now = new Date(),
  timeZone = DEFAULT_SRS_TIME_ZONE,
): { intervalStep: number; nextReviewAt: Date; status: VocabularyCardStatus } {
  const step = Math.max(0, Math.min(MAX_STEP, Math.floor(currentStep)));
  if (result === 'pass') {
    if (step === MAX_STEP) {
      return { intervalStep: MAX_STEP, nextReviewAt: now, status: 'mastered' };
    }
    const nextStep = step + 1;
    return {
      intervalStep: nextStep,
      nextReviewAt: startOfDayAfter(now, VOCABULARY_INTERVAL_DAYS[nextStep], timeZone),
      status: 'learning',
    };
  }
  if (result === 'hard') {
    return {
      intervalStep: step,
      nextReviewAt: startOfDayAfter(now, VOCABULARY_INTERVAL_DAYS[step], timeZone),
      status: 'learning',
    };
  }
  return {
    intervalStep: 0,
    nextReviewAt: startOfDayAfter(now, VOCABULARY_INTERVAL_DAYS[0], timeZone),
    status: 'learning',
  };
}

/** YYYY-MM-DD of `date` in `timeZone`. */
export function localDayKey(date: Date, timeZone = DEFAULT_SRS_TIME_ZONE): string {
  const { year, month, day } = zonedParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 1, d - 1));
  return prev.toISOString().slice(0, 10);
}

/**
 * Consecutive review days ending today, or ending yesterday if the student has not
 * reviewed yet today (the streak is still alive until the day is over).
 */
export function computeStreak(dayKeys: Iterable<string>, todayKey: string): number {
  const days = new Set(dayKeys);
  let cursor = days.has(todayKey) ? todayKey : previousDayKey(todayKey);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayKey(cursor);
  }
  return streak;
}

export function initialCardSchedule(availableFrom: Date, now = new Date()): Date {
  return availableFrom > now ? availableFrom : now;
}

/** 00:00 in `timeZone` of the calendar day `days` after the local day containing `from`. */
export function startOfDayAfter(from: Date, days: number, timeZone: string): Date {
  const { year, month, day } = zonedParts(from, timeZone);
  const localMidnightAsUtc = Date.UTC(year, month - 1, day + days);
  let instant = localMidnightAsUtc - zoneOffsetMs(new Date(localMidnightAsUtc), timeZone);
  // Re-check offset at the resolved instant (handles DST transitions near midnight).
  instant = localMidnightAsUtc - zoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Longest run of consecutive review days (badges keep it even after a streak breaks). */
export function computeBestStreak(dayKeys: Iterable<string>): number {
  const days = [...new Set(dayKeys)].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const day of days) {
    run = prev != null && previousDayKey(day) === prev ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}
