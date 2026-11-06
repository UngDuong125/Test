import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeOptionStats } from '../src/modules/analytics/analytics.service.js';
import { pickOpenClassTemplates } from '../src/modules/assignments/assignments.service.js';
import { toStudentHistoryItems } from '../src/modules/attempts/attempts.service.js';
import { computeVocabularyProgress } from '../src/modules/vocabulary/progress.logic.js';
import type { Attempt, ExamAssignment, StudentVocabularyCard } from '../src/types/domain.js';

describe('computeOptionStats', () => {
  it('counts picks per option and ignores blanks', () => {
    const stats = computeOptionStats(['A', 'B', 'C'], ['A', 'A', 'B', '', null, 'Z']);
    // 'Z' is answered but not an option: it counts in the denominator only.
    assert.deepEqual(
      stats.map((s) => [s.optionId, s.selectedCount]),
      [
        ['A', 2],
        ['B', 1],
        ['C', 0],
      ],
    );
    assert.equal(stats[0].selectedRate, 0.5);
  });

  it('counts each option once per multi-select answer', () => {
    const stats = computeOptionStats(['A', 'B'], [['A', 'B'], ['A', 'A']]);
    assert.deepEqual(
      stats.map((s) => s.selectedRate),
      [1, 0.5],
    );
  });
});

function attempt(patch: Partial<Attempt>): Attempt {
  return {
    id: 'att',
    assignmentId: 'asg',
    userId: 's',
    examId: 'e',
    examVersion: 1,
    status: 'graded',
    startedAt: '2026-11-01T00:00:00Z',
    submittedAt: '2026-11-01T00:10:00Z',
    expiresAt: null,
    score: 7,
    maxScore: 10,
    percentage: 70,
    ...patch,
  };
}

describe('toStudentHistoryItems', () => {
  const base = { examTitle: 'T', subjectId: 'math', examType: 'quiz', wrongCount: 3 };

  it('hides score and wrong count when results are not shown', () => {
    const [hidden, shown] = toStudentHistoryItems([
      { ...base, attempt: attempt({ id: 'a' }), showResult: false },
      { ...base, attempt: attempt({ id: 'b' }), showResult: true },
    ]);
    assert.equal(hidden.score, null);
    assert.equal(hidden.percentage, null);
    assert.equal(hidden.wrongCount, null);
    assert.equal(shown.score, 7);
    assert.equal(shown.wrongCount, 3);
  });

  it('does not report wrong answers before grading is final', () => {
    const [item] = toStudentHistoryItems([
      { ...base, attempt: attempt({ status: 'needs_grading' }), showResult: true },
    ]);
    assert.equal(item.wrongCount, null);
  });
});

function asg(id: string, patch: Partial<ExamAssignment>): ExamAssignment {
  return {
    id,
    examId: 'e1',
    targetType: 'user',
    targetId: 's',
    sourceClassId: 'c',
    assignedBy: 't',
    assignedAt: '2026-11-01T00:00:00Z',
    availableFrom: '2026-11-01T00:00:00Z',
    deadline: '2026-11-10T00:00:00Z',
    attemptLimit: 1,
    status: 'available',
    settings: {},
    createdAt: '2026-11-01T00:00:00Z',
    ...patch,
  } as ExamAssignment;
}

describe('pickOpenClassTemplates', () => {
  it('keeps one open assignment per exam, the most recent', () => {
    const picked = pickOpenClassTemplates(
      [
        asg('old', { assignedAt: '2026-11-01T00:00:00Z' }),
        asg('new', { assignedAt: '2026-11-02T00:00:00Z', attemptLimit: 2 }),
        asg('past', { examId: 'e2', deadline: '2026-11-05T00:00:00Z' }),
        asg('cancel', { examId: 'e3', status: 'cancelled' }),
      ],
      new Date('2026-11-06T00:00:00Z'),
    );
    assert.deepEqual(
      picked.map((a) => a.id),
      ['new'],
    );
  });
});

function card(patch: Partial<StudentVocabularyCard>): StudentVocabularyCard {
  return {
    id: 'c',
    assignmentId: 'va',
    userId: 'u1',
    entryId: 'w1',
    intervalStep: 0,
    nextReviewAt: '2026-11-05T00:00:00Z',
    lastReviewedAt: null,
    reviewCount: 0,
    passCount: 0,
    failCount: 0,
    status: 'learning',
    createdAt: '2026-11-01T00:00:00Z',
    updatedAt: '2026-11-01T00:00:00Z',
    ...patch,
  };
}

describe('computeVocabularyProgress', () => {
  const now = new Date('2026-11-06T12:00:00Z');

  it('flags students who stopped reviewing and finds hard words', () => {
    const res = computeVocabularyProgress(
      [
        card({ userId: 'u1', entryId: 'w1', lastReviewedAt: '2026-11-06T08:00:00Z', passCount: 1, failCount: 3 }),
        card({ userId: 'u1', entryId: 'w2', status: 'mastered', passCount: 5 }),
        card({ userId: 'u2', entryId: 'w1', lastReviewedAt: '2026-10-30T00:00:00Z', failCount: 1 }),
        card({ userId: 'u3', entryId: 'w1' }),
      ],
      now,
    );
    const byId = Object.fromEntries(res.students.map((s) => [s.userId, s]));
    assert.equal(byId.u1.inactive, false);
    assert.equal(byId.u1.mastered, 1);
    assert.equal(byId.u1.due, 1);
    assert.equal(byId.u2.inactive, true);
    assert.equal(byId.u2.daysSinceReview, 7);
    assert.equal(byId.u3.inactive, true);
    assert.equal(byId.u3.daysSinceReview, null);
    assert.equal(res.activeLast7Days, 1);
    assert.deepEqual(
      res.hardWords.map((w) => [w.entryId, w.failCount]),
      [['w1', 4]],
    );
    // Inactive students are listed first.
    assert.equal(res.students[res.students.length - 1].userId, 'u1');
  });

  it('does not count due cards of closed assignments', () => {
    const res = computeVocabularyProgress([card({ assignmentId: 'closed' })], now, {
      isDueEligible: (c) => c.assignmentId !== 'closed',
    });
    assert.equal(res.students[0].due, 0);
  });
});
