import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deriveStatusAfterUpdate } from '../src/modules/assignments/assignments.service.js';
import type { ExamAssignment } from '../src/types/domain.js';

const now = new Date('2026-11-06T10:00:00Z');

function assignment(patch: Partial<ExamAssignment>): ExamAssignment {
  return {
    id: 'a1',
    examId: 'e1',
    targetType: 'user',
    targetId: 's1',
    sourceClassId: null,
    assignedBy: 't1',
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

describe('deriveStatusAfterUpdate', () => {
  it('reopens a completed assignment when the attempt limit grows', () => {
    const a = assignment({ status: 'completed', attemptLimit: 2 });
    assert.equal(deriveStatusAfterUpdate(a, 1, now), 'available');
  });

  it('keeps completed when every attempt is still used', () => {
    const a = assignment({ status: 'completed', attemptLimit: 2 });
    assert.equal(deriveStatusAfterUpdate(a, 2, now), 'completed');
  });

  it('reopens an expired assignment when the deadline moves into the future', () => {
    const a = assignment({ status: 'expired', deadline: '2026-11-12T00:00:00Z' });
    assert.equal(deriveStatusAfterUpdate(a, 0, now), 'available');
  });

  it('stays expired while the deadline is still in the past', () => {
    const a = assignment({ status: 'expired', deadline: '2026-11-05T00:00:00Z' });
    assert.equal(deriveStatusAfterUpdate(a, 0, now), 'expired');
  });

  it('keeps an in-progress assignment in progress', () => {
    const a = assignment({ status: 'in_progress', attemptLimit: 3 });
    assert.equal(deriveStatusAfterUpdate(a, 1, now), 'in_progress');
  });
});
