import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateQuestionSeconds } from '../src/modules/analytics/analytics.service.js';
import { splitTransferIds } from '../src/modules/classes/classes.service.js';
import { pickOpenVocabularyTemplates } from '../src/modules/vocabulary/vocabulary.service.js';
import { computeBestStreak } from '../src/modules/vocabulary/srs.logic.js';
import { logPath } from '../src/middleware/requestLog.js';
import type { VocabularyAssignment } from '../src/types/domain.js';

function va(id: string, patch: Partial<VocabularyAssignment>): VocabularyAssignment {
  return {
    id,
    bankId: 'b1',
    targetType: 'user',
    targetId: 's',
    sourceClassId: 'c',
    assignedBy: 't',
    assignedAt: '2026-11-01T00:00:00Z',
    availableFrom: '2026-11-01T00:00:00Z',
    deadline: null,
    status: 'active',
    createdAt: '2026-11-01T00:00:00Z',
    ...patch,
  };
}

describe('pickOpenVocabularyTemplates', () => {
  it('keeps one active, unexpired assignment per bank, the most recent', () => {
    const picked = pickOpenVocabularyTemplates(
      [
        va('old', {}),
        va('new', { assignedAt: '2026-11-02T00:00:00Z' }),
        va('expired', { bankId: 'b2', deadline: '2026-11-05T00:00:00Z' }),
        va('cancelled', { bankId: 'b3', status: 'cancelled' }),
        va('open-ended', { bankId: 'b4', deadline: null }),
      ],
      new Date('2026-11-06T00:00:00Z'),
    );
    assert.deepEqual(picked.map((a) => a.id).sort(), ['new', 'open-ended']);
  });
});

describe('estimateQuestionSeconds', () => {
  const started = new Map([
    ['a1', '2026-11-06T10:00:00Z'],
    ['a2', '2026-11-06T10:00:00Z'],
  ]);

  it('uses the gap since the previous saved answer, or since the start', () => {
    const answers = [
      { attemptId: 'a1', questionId: 'q1', answeredAt: '2026-11-06T10:00:30Z' },
      { attemptId: 'a1', questionId: 'q2', answeredAt: '2026-11-06T10:01:30Z' },
      { attemptId: 'a2', questionId: 'q2', answeredAt: '2026-11-06T10:00:20Z' },
    ];
    assert.deepEqual(estimateQuestionSeconds('q2', answers, started), [60, 20]);
    assert.deepEqual(estimateQuestionSeconds('q1', answers, started), [30]);
  });

  it('drops idle gaps longer than 30 minutes', () => {
    const answers = [{ attemptId: 'a1', questionId: 'q1', answeredAt: '2026-11-06T11:00:00Z' }];
    assert.deepEqual(estimateQuestionSeconds('q1', answers, started), []);
  });
});

describe('splitTransferIds', () => {
  it('moves only current members, once each', () => {
    assert.deepEqual(splitTransferIds(['a', 'b', 'a', 'x'], new Set(['a', 'b', 'c'])), {
      movable: ['a', 'b'],
      notMembers: ['x'],
    });
  });
});

describe('computeBestStreak', () => {
  it('finds the longest run of consecutive days in any order', () => {
    assert.equal(
      computeBestStreak(['2026-10-05', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-06']),
      3,
    );
    assert.equal(computeBestStreak(['2026-10-31', '2026-11-01']), 2);
    assert.equal(computeBestStreak([]), 0);
  });
});

describe('logPath', () => {
  it('drops the query string so tokens never reach the logs', () => {
    assert.equal(logPath('/api/auth/reset-password?token=secret'), '/api/auth/reset-password');
    assert.equal(logPath('/api/x'), '/api/x');
  });
});
