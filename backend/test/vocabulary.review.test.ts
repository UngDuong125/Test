import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { StudentVocabularyCard, VocabularyAssignment } from '../src/types/domain.js';
import { mockModule, src } from './helpers/mock-module.js';
import { user } from './helpers/fake-exam-db.js';

let card: StudentVocabularyCard;
let assignment: VocabularyAssignment;
const events: { cardId: string; result: string; intervalStepBefore: number; intervalStepAfter: number }[] = [];

await mockModule(src('repositories/vocabulary.repository.js'), {
  findVocabularyCardForReview: async (id: string) => (id === card.id ? { card: { ...card }, assignment: { ...assignment } } : null),
  updateVocabularyCard: async (_id: string, patch: Record<string, unknown>) => {
    card = {
      ...card,
      intervalStep: patch.interval_step as number,
      nextReviewAt: patch.next_review_at as string,
      status: patch.status as StudentVocabularyCard['status'],
      lastReviewedAt: patch.last_reviewed_at as string,
      reviewCount: patch.review_count as number,
      passCount: patch.pass_count as number,
      failCount: patch.fail_count as number,
    };
    return { ...card };
  },
  createReviewEvent: async (e: (typeof events)[number]) => {
    events.push(e);
  },
});

const { reviewCardForStudent } = await import('../src/modules/vocabulary/vocabulary.service.js');

const student = user('student', 'student-1');
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

describe('reviewCardForStudent', () => {
  beforeEach(() => {
    events.length = 0;
    assignment = {
      id: 'va1',
      bankId: 'b1',
      targetType: 'user',
      targetId: student.id,
      sourceClassId: null,
      assignedBy: 'teacher-1',
      assignedAt: iso(-86_400_000),
      availableFrom: iso(-86_400_000),
      deadline: null,
      status: 'active',
      createdAt: iso(-86_400_000),
    };
    card = {
      id: 'c1',
      assignmentId: 'va1',
      userId: student.id,
      entryId: 'e1',
      intervalStep: 0,
      nextReviewAt: iso(-60_000),
      lastReviewedAt: null,
      reviewCount: 0,
      passCount: 0,
      failCount: 0,
      status: 'learning',
      createdAt: iso(-86_400_000),
      updatedAt: iso(-86_400_000),
    };
  });

  it('pass moves the card one step forward and logs the review', async () => {
    const { card: updated } = await reviewCardForStudent(student, 'c1', 'pass');
    assert.equal(updated.intervalStep, 1);
    assert.equal(updated.reviewCount, 1);
    assert.equal(updated.passCount, 1);
    assert.ok(new Date(updated.nextReviewAt).getTime() > Date.now() + 86_400_000);
    assert.deepEqual(events, [{ cardId: 'c1', result: 'pass', intervalStepBefore: 0, intervalStepAfter: 1 }]);
  });

  it('fail resets the step and counts the failure', async () => {
    card = { ...card, intervalStep: 3 };
    const { card: updated } = await reviewCardForStudent(student, 'c1', 'fail');
    assert.equal(updated.intervalStep, 0);
    assert.equal(updated.failCount, 1);
  });

  it('passing the last step masters the card; mastered cards cannot be reviewed again', async () => {
    card = { ...card, intervalStep: 4 };
    const { card: updated } = await reviewCardForStudent(student, 'c1', 'pass');
    assert.equal(updated.status, 'mastered');
    assert.equal(await codeOf(reviewCardForStudent(student, 'c1', 'pass')), 'CARD_NOT_LEARNING');
  });

  it('rejects cards that are not due, not owned, or in an inactive / expired assignment', async () => {
    card = { ...card, nextReviewAt: iso(3_600_000) };
    assert.equal(await codeOf(reviewCardForStudent(student, 'c1', 'pass')), 'CARD_NOT_DUE');

    card = { ...card, nextReviewAt: iso(-60_000) };
    assert.equal(await codeOf(reviewCardForStudent(user('student', 'student-2'), 'c1', 'pass')), 'NOT_FOUND');
    assert.equal(await codeOf(reviewCardForStudent(student, 'missing', 'pass')), 'NOT_FOUND');
    assert.equal(await codeOf(reviewCardForStudent(user('teacher'), 'c1', 'pass')), 'FORBIDDEN');

    assignment = { ...assignment, status: 'cancelled' };
    assert.equal(await codeOf(reviewCardForStudent(student, 'c1', 'pass')), 'ASSIGNMENT_INACTIVE');

    assignment = { ...assignment, status: 'active', deadline: iso(-60_000) };
    assert.equal(await codeOf(reviewCardForStudent(student, 'c1', 'pass')), 'ASSIGNMENT_EXPIRED');

    assignment = { ...assignment, deadline: null, availableFrom: iso(3_600_000) };
    assert.equal(await codeOf(reviewCardForStudent(student, 'c1', 'pass')), 'ASSIGNMENT_NOT_AVAILABLE');
    assert.equal(events.length, 0);
  });
});
