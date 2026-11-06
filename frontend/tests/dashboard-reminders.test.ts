import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deadlineUrgency,
  hasNewGrade,
  nextSeenGrades,
  sortAssignmentsForStudent,
} from '@/lib/dashboard-reminders';
import type { ExamAssignment } from '@/types/content';

const now = Date.parse('2026-11-06T10:00:00Z');
const hours = (h: number) => new Date(now + h * 3_600_000).toISOString();

function asg(id: string, patch: Partial<ExamAssignment> = {}): ExamAssignment {
  return {
    id,
    examId: 'e',
    targetType: 'user',
    targetId: 's',
    sourceClassId: null,
    assignedBy: 't',
    assignedAt: hours(-48),
    availableFrom: hours(-48),
    deadline: hours(24 * 7),
    attemptLimit: 1,
    status: 'available',
    settings: {},
    createdAt: hours(-48),
    remainingAttempts: 1,
    inProgressAttemptId: null,
    latestFinishedAttempt: null,
    ...patch,
  };
}

describe('deadlineUrgency', () => {
  it('labels deadlines within 48h, urgent within 6h', () => {
    assert.equal(deadlineUrgency(asg('a', { deadline: hours(72) }), now), null);
    assert.deepEqual(deadlineUrgency(asg('a', { deadline: hours(30) }), now), {
      level: 'soon',
      label: 'Còn 1 ngày',
    });
    assert.deepEqual(deadlineUrgency(asg('a', { deadline: hours(5) }), now), {
      level: 'urgent',
      label: 'Còn 5 giờ',
    });
    assert.equal(deadlineUrgency(asg('a', { deadline: hours(0.5) }), now)?.label, 'Còn 30 phút');
  });

  it('ignores finished or expired work', () => {
    assert.equal(
      deadlineUrgency(asg('a', { deadline: hours(3), remainingAttempts: 0, status: 'completed' }), now),
      null,
    );
    assert.equal(deadlineUrgency(asg('a', { deadline: hours(-1) }), now), null);
  });
});

describe('sortAssignmentsForStudent', () => {
  it('puts in-progress, then due soon, then open, then upcoming, then done', () => {
    const items = [
      asg('done', { status: 'completed', remainingAttempts: 0 }),
      asg('upcoming', { status: 'assigned', availableFrom: hours(24) }),
      asg('open', { deadline: hours(24 * 5) }),
      asg('soon', { deadline: hours(10) }),
      asg('doing', { status: 'in_progress', inProgressAttemptId: 'x' }),
    ];
    assert.deepEqual(
      sortAssignmentsForStudent(items, now).map((a) => a.id),
      ['doing', 'soon', 'open', 'upcoming', 'done'],
    );
  });
});

describe('new grade marker', () => {
  const graded = asg('a', {
    latestFinishedAttempt: { id: 'att1', status: 'graded', percentage: 80 },
  });

  it('marks a result that was waiting for grading last time', () => {
    assert.equal(hasNewGrade(graded, { att1: 'needs_grading' }), true);
    assert.equal(hasNewGrade(graded, { att1: 'graded' }), false);
    assert.equal(hasNewGrade(graded, {}), false);
  });

  it('keeps the marker until the result is opened', () => {
    const seen = nextSeenGrades([graded], { att1: 'needs_grading' });
    assert.equal(hasNewGrade(graded, seen), true);
  });
});
