import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '@/lib/api-client';
import { isSessionExpiredError } from '@/lib/attempt-ux';
import { groupAssignmentsForStudent } from '@/lib/dashboard-reminders';
import { speechLangForSubject } from '@/lib/speech';
import type { ExamAssignment } from '@/types/content';

const now = Date.parse('2026-11-07T10:00:00Z');
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
    deadline: hours(72),
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

describe('groupAssignmentsForStudent', () => {
  it('drops cancelled work and separates finished from current', () => {
    const { current, finished } = groupAssignmentsForStudent(
      [
        asg('open'),
        asg('upcoming', { status: 'assigned', availableFrom: hours(24) }),
        asg('doing', { status: 'in_progress', inProgressAttemptId: 'x' }),
        asg('done', { status: 'completed', remainingAttempts: 0, deadline: hours(10) }),
        asg('expired', { status: 'expired', deadline: hours(-5) }),
        asg('cancelled', { status: 'cancelled' }),
      ],
      now,
    );
    assert.deepEqual(current.map((a) => a.id), ['doing', 'open', 'upcoming']);
    // Finished: latest deadline first.
    assert.deepEqual(finished.map((a) => a.id), ['done', 'expired']);
  });
});

describe('speechLangForSubject', () => {
  it('reads foreign-language banks in English, others in Vietnamese', () => {
    assert.equal(speechLangForSubject('flang'), 'en-US');
    assert.equal(speechLangForSubject('lang'), 'vi-VN');
    assert.equal(speechLangForSubject('math'), 'vi-VN');
  });
});

describe('isSessionExpiredError', () => {
  it('is true only for 401', () => {
    assert.equal(isSessionExpiredError(new ApiError(401, 'x')), true);
    assert.equal(isSessionExpiredError(new ApiError(403, 'x')), false);
    assert.equal(isSessionExpiredError(new TypeError('Failed to fetch')), false);
  });
});
