import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { badgesFor, nextBadges } from '@/lib/badges';

describe('badges', () => {
  it('earns every milestone at or below the value', () => {
    const earned = badgesFor({ expTotal: 100, bestStreak: 7, mastered: 9 })
      .filter((b) => b.earned)
      .map((b) => b.id);
    assert.deepEqual(earned, ['expTotal-10', 'expTotal-50', 'expTotal-100', 'bestStreak-3', 'bestStreak-7']);
  });

  it('shows the next milestone per kind, none after the last', () => {
    assert.deepEqual(nextBadges({ expTotal: 600, bestStreak: 2, mastered: 9 }), [
      { label: 'Chuỗi ôn 3', remaining: 1 },
      { label: 'Từ đã thuộc 10', remaining: 1 },
    ]);
  });
});
