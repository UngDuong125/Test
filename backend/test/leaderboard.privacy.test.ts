import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMe,
  presentEntriesForViewer,
  type LeaderboardEntry,
} from '../src/modules/leaderboard/leaderboard.service.js';
import type { PublicUser } from '../src/types/domain.js';

function viewer(role: PublicUser['role'], id = `${role}-1`): PublicUser {
  return { id, role } as PublicUser;
}

const subjectExp = { math: 0, lang: 0, flang: 0, sci: 0, hist_geo: 0, civic: 0 };

const ranked: LeaderboardEntry[] = [
  { rank: 1, userId: 's1', displayName: 'An', username: 'an', email: 'an@x.vn', totalExp: 30, subjectExp },
  { rank: 2, userId: 's2', displayName: null, username: 'binh', email: 'binh@x.vn', totalExp: 20, subjectExp },
];

describe('leaderboard privacy', () => {
  it('strips email for students and anonymous viewers', () => {
    for (const actor of [viewer('student'), null]) {
      const out = presentEntriesForViewer(ranked, actor);
      assert.equal(out.length, 2);
      for (const e of out) assert.equal('email' in e, false);
      assert.equal(out[1].username, 'binh');
    }
  });

  it('keeps email for teacher and admin', () => {
    for (const actor of [viewer('teacher'), viewer('admin')]) {
      const out = presentEntriesForViewer(ranked, actor);
      assert.equal(out[0].email, 'an@x.vn');
    }
  });

  it('does not mutate the ranked list', () => {
    presentEntriesForViewer(ranked, viewer('student'));
    assert.equal(ranked[0].email, 'an@x.vn');
  });
});

describe('leaderboard me', () => {
  it('returns own rank for a ranked student, even outside the returned page', () => {
    assert.deepEqual(findMe(ranked, viewer('student', 's2')), { rank: 2, totalExp: 20 });
  });

  it('returns rank null for a student without EXP', () => {
    assert.deepEqual(findMe(ranked, viewer('student', 's9')), { rank: null, totalExp: 0 });
  });

  it('is null for staff', () => {
    assert.equal(findMe(ranked, viewer('teacher')), null);
  });
});
