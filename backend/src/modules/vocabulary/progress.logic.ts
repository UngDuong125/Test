import type { StudentVocabularyCard } from '../../types/domain.js';

const DAY_MS = 86_400_000;
/** A student who has not reviewed for longer than this is flagged to the teacher. */
export const INACTIVE_AFTER_DAYS = 3;
/** Words need at least this many reviews before their fail rate counts as "hard". */
export const HARD_WORD_MIN_REVIEWS = 3;

export interface StudentVocabularyProgress {
  userId: string;
  total: number;
  learning: number;
  mastered: number;
  suspended: number;
  due: number;
  passCount: number;
  failCount: number;
  lastReviewedAt: string | null;
  /** Whole days since the last review; null when the student never reviewed. */
  daysSinceReview: number | null;
  inactive: boolean;
}

export interface HardWord {
  entryId: string;
  reviews: number;
  failCount: number;
  failRate: number;
}

export interface VocabularyProgressSummary {
  students: StudentVocabularyProgress[];
  /** Students with at least one review in the last 7 days / all students with cards. */
  activeLast7Days: number;
  studentCount: number;
  hardWords: HardWord[];
}

type CardLike = Pick<
  StudentVocabularyCard,
  'assignmentId' | 'userId' | 'entryId' | 'status' | 'nextReviewAt' | 'lastReviewedAt' | 'passCount' | 'failCount'
>;

/**
 * Per-student counters, recent activity and the words with the highest fail rate.
 * `isDueEligible(card)` lets the caller exclude cards whose assignment no longer
 * produces due cards (cancelled, past deadline, not yet available).
 */
export function computeVocabularyProgress(
  cards: CardLike[],
  now: Date,
  opts: { hardWordLimit?: number; isDueEligible?: (card: CardLike) => boolean } = {},
): VocabularyProgressSummary {
  const nowMs = now.getTime();
  const byStudent = new Map<string, StudentVocabularyProgress>();
  const byWord = new Map<string, { pass: number; fail: number }>();

  for (const c of cards) {
    let s = byStudent.get(c.userId);
    if (!s) {
      s = {
        userId: c.userId,
        total: 0,
        learning: 0,
        mastered: 0,
        suspended: 0,
        due: 0,
        passCount: 0,
        failCount: 0,
        lastReviewedAt: null,
        daysSinceReview: null,
        inactive: true,
      };
      byStudent.set(c.userId, s);
    }
    s.total += 1;
    s[c.status] += 1;
    s.passCount += c.passCount;
    s.failCount += c.failCount;
    if (
      c.status === 'learning' &&
      Date.parse(c.nextReviewAt) <= nowMs &&
      (opts.isDueEligible?.(c) ?? true)
    ) {
      s.due += 1;
    }
    if (c.lastReviewedAt && (!s.lastReviewedAt || c.lastReviewedAt > s.lastReviewedAt)) {
      s.lastReviewedAt = c.lastReviewedAt;
    }

    const w = byWord.get(c.entryId) ?? { pass: 0, fail: 0 };
    w.pass += c.passCount;
    w.fail += c.failCount;
    byWord.set(c.entryId, w);
  }

  let activeLast7Days = 0;
  for (const s of byStudent.values()) {
    if (s.lastReviewedAt) {
      const days = Math.floor((nowMs - Date.parse(s.lastReviewedAt)) / DAY_MS);
      s.daysSinceReview = Math.max(0, days);
      if (nowMs - Date.parse(s.lastReviewedAt) <= 7 * DAY_MS) activeLast7Days += 1;
    }
    // Only flag students who still have something to do.
    const hasWork = s.learning > 0;
    s.inactive =
      hasWork && (s.daysSinceReview == null || s.daysSinceReview > INACTIVE_AFTER_DAYS);
  }

  const hardWords = [...byWord.entries()]
    .map(([entryId, w]) => {
      const reviews = w.pass + w.fail;
      return {
        entryId,
        reviews,
        failCount: w.fail,
        failRate: reviews > 0 ? Math.round((w.fail / reviews) * 1000) / 1000 : 0,
      };
    })
    .filter((w) => w.reviews >= HARD_WORD_MIN_REVIEWS && w.failCount > 0)
    .sort((a, b) => b.failRate - a.failRate || b.failCount - a.failCount)
    .slice(0, opts.hardWordLimit ?? 10);

  const students = [...byStudent.values()].sort(
    (a, b) =>
      Number(b.inactive) - Number(a.inactive) ||
      (b.daysSinceReview ?? Infinity) - (a.daysSinceReview ?? Infinity),
  );

  return { students, activeLast7Days, studentCount: students.length, hardWords };
}
