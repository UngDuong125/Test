import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  currentTimeWarning,
  isAnswered,
  isRetryableSaveError,
  saveRetryDelay,
} from '@/lib/attempt-ux';
import { ApiError } from '@/lib/api-client';

describe('isAnswered', () => {
  it('treats empty values as unanswered', () => {
    for (const v of [null, undefined, '', '   ', [], {}]) {
      assert.equal(isAnswered(v as never), false, JSON.stringify(v));
    }
  });

  it('treats real answers as answered', () => {
    for (const v of ['A', 0, 3.5, ['A'], { L1: 'R2' }]) {
      assert.equal(isAnswered(v), true, JSON.stringify(v));
    }
  });
});

describe('save retry', () => {
  it('backs off and caps the delay', () => {
    assert.equal(saveRetryDelay(1), 2_000);
    assert.equal(saveRetryDelay(2), 5_000);
    assert.equal(saveRetryDelay(4), 20_000);
    assert.equal(saveRetryDelay(99), 20_000);
  });

  it('retries network and server errors only', () => {
    assert.equal(isRetryableSaveError(new TypeError('Failed to fetch')), true);
    assert.equal(isRetryableSaveError(new ApiError(503, 'down')), true);
    assert.equal(isRetryableSaveError(new ApiError(429, 'slow down')), true);
    assert.equal(isRetryableSaveError(new ApiError(422, 'locked', 'ATTEMPT_LOCKED')), false);
    assert.equal(isRetryableSaveError(new ApiError(401, 'login')), false);
  });
});

describe('currentTimeWarning', () => {
  it('fires at 5 minutes and 1 minute', () => {
    assert.equal(currentTimeWarning(null), null);
    assert.equal(currentTimeWarning(10 * 60_000), null);
    assert.equal(currentTimeWarning(5 * 60_000), 'five');
    assert.equal(currentTimeWarning(2 * 60_000), 'five');
    assert.equal(currentTimeWarning(60_000), 'one');
    assert.equal(currentTimeWarning(1_000), 'one');
    assert.equal(currentTimeWarning(0), null);
  });
});
