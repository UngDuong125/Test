import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  initialCardSchedule,
  nextIntervalAfterReview,
  startOfDayAfter,
} from '../src/modules/vocabulary/srs.logic.js';

// 2026-10-11 20:28 Asia/Ho_Chi_Minh (UTC+7)
const NOW = new Date('2026-10-11T13:28:00Z');

describe('startOfDayAfter', () => {
  it('snaps to local midnight in Asia/Ho_Chi_Minh', () => {
    assert.equal(startOfDayAfter(NOW, 1, 'Asia/Ho_Chi_Minh').toISOString(), '2026-10-11T17:00:00.000Z');
    assert.equal(startOfDayAfter(NOW, 3, 'Asia/Ho_Chi_Minh').toISOString(), '2026-10-13T17:00:00.000Z');
  });

  it('uses the local day, not the UTC day (just after local midnight)', () => {
    // 00:30 on 2026-10-12 in VN is still 2026-10-11 in UTC
    const justAfterMidnight = new Date('2026-10-11T17:30:00Z');
    assert.equal(
      startOfDayAfter(justAfterMidnight, 1, 'Asia/Ho_Chi_Minh').toISOString(),
      '2026-10-12T17:00:00.000Z',
    );
  });

  it('handles DST transitions', () => {
    // US DST ends 2026-11-01; midnight on Nov 2 in New York is UTC-5
    const before = new Date('2026-10-31T16:00:00Z');
    assert.equal(startOfDayAfter(before, 2, 'America/New_York').toISOString(), '2026-11-02T05:00:00.000Z');
  });
});

describe('nextIntervalAfterReview', () => {
  it('pass advances one step following 1/3/7/14/30 days', () => {
    const r = nextIntervalAfterReview(0, 'pass', NOW);
    assert.equal(r.intervalStep, 1);
    assert.equal(r.status, 'learning');
    assert.equal(r.nextReviewAt.toISOString(), '2026-10-13T17:00:00.000Z');
  });

  it('pass at the last step marks mastered', () => {
    const r = nextIntervalAfterReview(4, 'pass', NOW);
    assert.equal(r.status, 'mastered');
    assert.equal(r.intervalStep, 4);
  });

  it('fail resets to step 0, due next day', () => {
    const r = nextIntervalAfterReview(3, 'fail', NOW);
    assert.equal(r.intervalStep, 0);
    assert.equal(r.status, 'learning');
    assert.equal(r.nextReviewAt.toISOString(), '2026-10-11T17:00:00.000Z');
  });

  it('clamps out-of-range steps', () => {
    assert.equal(nextIntervalAfterReview(99, 'pass', NOW).status, 'mastered');
    assert.equal(nextIntervalAfterReview(-3, 'pass', NOW).intervalStep, 1);
  });
});

describe('initialCardSchedule', () => {
  it('uses the later of availableFrom and now', () => {
    const future = new Date('2026-12-01T00:00:00Z');
    assert.equal(initialCardSchedule(future, NOW), future);
    assert.equal(initialCardSchedule(new Date('2020-01-01T00:00:00Z'), NOW), NOW);
  });
});
