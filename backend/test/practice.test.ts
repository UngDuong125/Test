import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Attempt, AttemptSnapshotPayload, SnapshotQuestion } from '../src/types/domain.js';
import { mockModule, src } from './helpers/mock-module.js';
import { user } from './helpers/fake-exam-db.js';

let attempt: Attempt;
let snapshot: AttemptSnapshotPayload;
let attemptLimit: number;
let used: number;

// Only reads are mocked: any write (updateAttempt, upsertAttemptAnswer, insertExpLedger, …)
// throws "Unmocked call", so these tests also prove the check endpoint is read-only.
await mockModule(src('repositories/attempts.repository.js'), {
  findAttemptById: async (id: string) => (id === attempt.id ? { ...attempt } : null),
  getAttemptSnapshot: async () => snapshot,
  countAttemptsForLimit: async () => used,
});
await mockModule(src('repositories/assignments.repository.js'), {
  findAssignmentById: async () => ({ id: 'asg1', attemptLimit }),
});

const { pickPracticeQuestions, practiceAllowed } = await import('../src/modules/practice/practice.logic.js');
const { checkPracticeAnswer } = await import('../src/modules/practice/practice.service.js');

const student = user('student', 'student-1');

function q(id: string, patch: Partial<SnapshotQuestion> = {}): SnapshotQuestion {
  return {
    id,
    type: 'multiple_choice',
    content: [],
    options: [
      { id: 'A', content: [], order: 0 },
      { id: 'B', content: [], order: 1 },
    ],
    answer: { type: 'single', value: 'A' },
    explanation: { text: 'Vì A' },
    points: 1,
    version: 1,
    sectionId: null,
    order: 0,
    ...patch,
  } as SnapshotQuestion;
}

function snap(questions: SnapshotQuestion[], showExplanation = true): AttemptSnapshotPayload {
  return {
    exam: { id: 'e1', title: 'Đề 1', subjectId: 'math', type: 'quiz' },
    sections: [],
    questions,
    effectiveSettings: { shuffleQuestions: false, shuffleOptions: false, showResult: true, showExplanation },
  } as unknown as AttemptSnapshotPayload;
}

function att(id: string, patch: Partial<Attempt> = {}): Attempt {
  return {
    id,
    assignmentId: 'asg1',
    userId: student.id,
    examId: 'e1',
    examVersion: 1,
    status: 'graded',
    startedAt: '2026-11-01T00:00:00Z',
    submittedAt: '2026-11-01T00:10:00Z',
    expiresAt: null,
    score: 0,
    maxScore: 2,
    percentage: 0,
    ...patch,
  };
}

describe('pickPracticeQuestions', () => {
  it('returns wrong auto-graded questions without answer keys, newest attempt first, once each', () => {
    const items = pickPracticeQuestions([
      {
        attempt: att('old', { submittedAt: '2026-11-01T00:00:00Z' }),
        snapshot: snap([q('q1'), q('q2')]),
        remainingAttempts: 0,
        wrongQuestionIds: new Set(['q1', 'q2']),
      },
      {
        attempt: att('new', { submittedAt: '2026-11-03T00:00:00Z' }),
        snapshot: snap([q('q1'), q('essay', { type: 'essay', answer: { type: 'manual' } })]),
        remainingAttempts: 0,
        wrongQuestionIds: new Set(['q1', 'essay']),
      },
    ]);
    assert.deepEqual(
      items.map((i) => [i.attemptId, i.question.id]),
      [
        ['new', 'q1'],
        ['old', 'q2'],
      ],
    );
    for (const i of items) {
      assert.equal('answer' in i.question, false);
      assert.equal('explanation' in i.question, false);
    }
  });

  it('skips attempts whose keys are still locked', () => {
    const base = { snapshot: snap([q('q1')]), wrongQuestionIds: new Set(['q1']) };
    assert.equal(pickPracticeQuestions([{ ...base, attempt: att('a'), remainingAttempts: 1 }]).length, 0);
    assert.equal(
      pickPracticeQuestions([{ ...base, snapshot: snap([q('q1')], false), attempt: att('a'), remainingAttempts: 0 }])
        .length,
      0,
    );
    assert.equal(
      practiceAllowed({ attempt: att('a', { status: 'needs_grading' }), snapshot: snap([]), remainingAttempts: 0 }),
      false,
    );
  });
});

describe('checkPracticeAnswer', () => {
  beforeEach(() => {
    attempt = att('a1');
    snapshot = snap([q('q1'), q('essay', { type: 'essay', answer: { type: 'manual' } })]);
    attemptLimit = 1;
    used = 1;
  });

  it('grades without writing and reveals the key afterwards', async () => {
    const wrong = await checkPracticeAnswer(student, { attemptId: 'a1', questionId: 'q1', value: 'B' });
    assert.equal(wrong.isCorrect, false);
    assert.deepEqual(wrong.answer, { type: 'single', value: 'A' });
    assert.equal(wrong.explanation?.text, 'Vì A');
    const right = await checkPracticeAnswer(student, { attemptId: 'a1', questionId: 'q1', value: 'A' });
    assert.equal(right.isCorrect, true);
  });

  it('refuses while attempts remain, for other students, and for manual questions', async () => {
    const codeOf = async (p: Promise<unknown>) => {
      try {
        await p;
        return undefined;
      } catch (err) {
        return (err as { code?: string }).code;
      }
    };
    used = 0;
    assert.equal(
      await codeOf(checkPracticeAnswer(student, { attemptId: 'a1', questionId: 'q1', value: 'A' })),
      'PRACTICE_LOCKED',
    );
    used = 1;
    assert.equal(
      await codeOf(checkPracticeAnswer(user('student', 'other'), { attemptId: 'a1', questionId: 'q1', value: 'A' })),
      'NOT_FOUND',
    );
    assert.equal(
      await codeOf(checkPracticeAnswer(student, { attemptId: 'a1', questionId: 'essay', value: 'x' })),
      'NOT_PRACTICABLE',
    );
    assert.equal(
      await codeOf(checkPracticeAnswer(user('teacher'), { attemptId: 'a1', questionId: 'q1', value: 'A' })),
      'FORBIDDEN',
    );
  });
});
