import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isValidEmail,
  isValidUsername,
  passwordHints,
  suggestUsernameFromEmail,
} from '@/lib/validation';

describe('form validation helpers', () => {
  it('validates emails and usernames', () => {
    assert.equal(isValidEmail(' a@b.co '), true);
    assert.equal(isValidEmail('a@b'), false);
    assert.equal(isValidUsername('nguyen.van_a'), true);
    assert.equal(isValidUsername('ab'), false);
    assert.equal(isValidUsername('.abc'), false);
  });

  it('password hints', () => {
    assert.deepEqual(passwordHints('abc12345'), []);
    assert.deepEqual(passwordHints('abc'), ['Ít nhất 8 ký tự', 'Có chữ số']);
  });

  it('suggested usernames are always valid', () => {
    for (const email of ['Nguyen.Van.A@gmail.com', 'a@x.com', '.hidden@x.com', '_x@x.com', 'đức@x.com']) {
      const suggestion = suggestUsernameFromEmail(email);
      assert.ok(isValidUsername(suggestion), `${email} → "${suggestion}" is not a valid username`);
    }
  });
});
