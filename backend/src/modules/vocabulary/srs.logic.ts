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
  return {
    intervalStep: 0,
    nextReviewAt: startOfDayAfter(now, VOCABULARY_INTERVAL_DAYS[0], timeZone),
    status: 'learning',
  };
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
