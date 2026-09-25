import { VOCABULARY_INTERVAL_DAYS } from '../../types/domain.js';
import type { VocabularyReviewResult } from '../../types/domain.js';

export function nextIntervalAfterReview(
  currentStep: number,
  result: VocabularyReviewResult,
  now = new Date(),
): { intervalStep: number; nextReviewAt: Date } {
  const step = Math.max(0, Math.min(4, Math.floor(currentStep)));
  if (result === 'pass') {
    const nextStep = Math.min(step + 1, 4);
    const days = VOCABULARY_INTERVAL_DAYS[nextStep];
    return {
      intervalStep: nextStep,
      nextReviewAt: addDays(now, days),
    };
  }
  const days = VOCABULARY_INTERVAL_DAYS[0];
  return {
    intervalStep: 0,
    nextReviewAt: addDays(now, days),
  };
}

export function initialCardSchedule(availableFrom: Date, now = new Date()): Date {
  return availableFrom > now ? availableFrom : now;
}

function addDays(from: Date, days: number): Date {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
