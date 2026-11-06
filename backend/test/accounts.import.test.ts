import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateImportRows } from '../src/modules/accounts/import.logic.js';
import { isManualGradingComplete } from '../src/modules/grading/grading.service.js';
import { generateRandomTemporaryPassword } from '../src/services/password.service.js';

const classes = new Map([
  ['8a1', [{ id: 'c1', name: '8A1' }]],
  [
    '9a',
    [
      { id: 'c2', name: '9A' },
      { id: 'c3', name: '9A' },
    ],
  ],
]);

describe('validateImportRows', () => {
  it('accepts students without email and resolves classes by name', () => {
    const { valid, errors } = validateImportRows(
      [{ username: ' HS01 ', displayName: 'An', className: '8a1' }],
      { usernames: new Set(), emails: new Set() },
      classes,
    );
    assert.deepEqual(errors, []);
    assert.equal(valid[0].username, 'hs01');
    assert.equal(valid[0].email, null);
    assert.equal(valid[0].role, 'student');
    assert.equal(valid[0].classId, 'c1');
    // Line numbers count the header row.
    assert.equal(valid[0].line, 2);
  });

  it('reports duplicates, bad formats, unknown or ambiguous classes', () => {
    const { valid, errors } = validateImportRows(
      [
        { username: 'hs01' },
        { username: 'HS01' },
        { username: 'taken' },
        { username: 'x' },
        { username: 'hs02', email: 'not-an-email' },
        { username: 'hs03', className: 'Không có' },
        { username: 'hs04', className: '9A' },
        { username: 'hs05', role: 'admin' },
        { username: 'gv01', role: 'teacher', className: '8A1' },
      ],
      { usernames: new Set(['taken']), emails: new Set() },
      classes,
    );
    assert.deepEqual(
      valid.map((v) => v.username),
      ['hs01'],
    );
    assert.deepEqual(
      errors.map((e) => e.line),
      [3, 4, 5, 6, 7, 8, 9, 10],
    );
  });
});

describe('isManualGradingComplete', () => {
  it('needs every manual question graded now or earlier', () => {
    const answers = [
      { questionId: 'a', manualGradedAt: '2026-11-06T00:00:00Z' },
      { questionId: 'b', manualGradedAt: null },
    ];
    assert.equal(isManualGradingComplete(['a', 'b'], answers, []), false);
    assert.equal(isManualGradingComplete(['a', 'b'], answers, ['b']), true);
    assert.equal(isManualGradingComplete([], answers, []), true);
  });
});

describe('generateRandomTemporaryPassword', () => {
  it('is readable and varies', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 50; i += 1) {
      const pw = generateRandomTemporaryPassword();
      assert.match(pw, /^[a-hj-km-np-z]{4}-[2-9]{4}$/);
      seen.add(pw);
    }
    assert.ok(seen.size > 45);
  });
});
