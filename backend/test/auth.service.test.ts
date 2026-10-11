import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import type { User } from '../src/types/domain.js';
import { mockModule, src } from './helpers/mock-module.js';

const PASSWORD = 'matkhau123';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

const users = new Map<string, User>();
const failedLogins: { userId: string; attempts: number; lockedUntil: string | null }[] = [];

function seedUser(patch: Partial<User> = {}): User {
  const now = new Date().toISOString();
  const u: User & { passwordHash: string } = {
    id: 'u1',
    email: 'hs1@test.local',
    username: 'hs1',
    displayName: null,
    role: 'student',
    status: 'active',
    mustChangePassword: false,
    temporaryPasswordExpiresAt: null,
    failedLoginAttempts: 0,
    lockedUntil: null,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: now,
    updatedAt: now,
    passwordHash: PASSWORD_HASH,
    ...patch,
  };
  users.set(u.id, u);
  return u;
}

await mockModule(src('repositories/users.repository.js'), {
  findUserByLoginIdentifier: async (login: string) =>
    [...users.values()].find((u) => u.email === login || u.username === login) ?? null,
  findUserById: async (id: string) => users.get(id) ?? null,
  recordFailedLogin: async (userId: string, attempts: number, lockedUntil: string | null) => {
    failedLogins.push({ userId, attempts, lockedUntil });
    const u = users.get(userId)!;
    users.set(userId, {
      ...u,
      failedLoginAttempts: attempts,
      lockedUntil,
      status: lockedUntil ? 'locked' : u.status,
    });
  },
  recordSuccessfulLogin: async (userId: string) => {
    const u = users.get(userId)!;
    users.set(userId, {
      ...u,
      failedLoginAttempts: 0,
      lockedUntil: null,
      status: u.status === 'locked' ? 'active' : u.status,
    });
  },
});
await mockModule(src('services/session.service.js'), {
  issueSession: async () => ({ rawToken: 'raw-token', expiresAt: new Date(Date.now() + 3_600_000) }),
});

const { login, isAccountLocked } = await import('../src/modules/auth/auth.service.js');

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (err) {
    return (err as { code?: string }).code;
  }
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

describe('isAccountLocked', () => {
  it('distinguishes lockout, expired lockout and admin lock', () => {
    assert.equal(isAccountLocked({ status: 'locked', lockedUntil: minutes(10) }), true);
    assert.equal(isAccountLocked({ status: 'locked', lockedUntil: minutes(-1) }), false);
    assert.equal(isAccountLocked({ status: 'locked', lockedUntil: null }), true);
    assert.equal(isAccountLocked({ status: 'active', lockedUntil: null }), false);
  });
});

describe('login', () => {
  beforeEach(() => {
    users.clear();
    failedLogins.length = 0;
  });

  it('accepts email or username with the right password', async () => {
    seedUser();
    const byEmail = await login('hs1@test.local', PASSWORD);
    assert.equal(byEmail.user.id, 'u1');
    assert.equal(byEmail.rawToken, 'raw-token');
    assert.equal('passwordHash' in byEmail.user, false);
    const byUsername = await login('hs1', PASSWORD);
    assert.equal(byUsername.user.id, 'u1');
  });

  it('uses the same error for unknown users and wrong passwords', async () => {
    seedUser();
    assert.equal(await codeOf(login('nobody', PASSWORD)), 'INVALID_CREDENTIALS');
    assert.equal(await codeOf(login('hs1', 'sai-mat-khau1')), 'INVALID_CREDENTIALS');
  });

  it('locks the account after 5 wrong passwords, even for the right password', async () => {
    seedUser();
    for (let i = 0; i < 5; i += 1) {
      assert.equal(await codeOf(login('hs1', 'wrong-pass1')), 'INVALID_CREDENTIALS');
    }
    assert.equal(failedLogins.at(-1)!.attempts, 5);
    assert.ok(failedLogins.at(-1)!.lockedUntil);
    assert.equal(await codeOf(login('hs1', PASSWORD)), 'ACCOUNT_LOCKED');
  });

  it('lockout ends on its own after the lock time', async () => {
    seedUser({ status: 'locked', failedLoginAttempts: 5, lockedUntil: minutes(-1) });
    const result = await login('hs1', PASSWORD);
    assert.equal(result.user.status, 'active');
  });

  it('after a lockout ends, one wrong password does not lock again', async () => {
    seedUser({ status: 'locked', failedLoginAttempts: 5, lockedUntil: minutes(-1) });
    assert.equal(await codeOf(login('hs1', 'wrong-pass1')), 'INVALID_CREDENTIALS');
    assert.equal(failedLogins.at(-1)!.attempts, 1);
    assert.equal(failedLogins.at(-1)!.lockedUntil, null);
  });

  it('an account locked by an admin cannot log in', async () => {
    seedUser({ status: 'locked', lockedUntil: null });
    assert.equal(await codeOf(login('hs1', PASSWORD)), 'ACCOUNT_LOCKED');
    assert.equal(users.get('u1')!.status, 'locked');
  });

  it('disabled accounts and expired temporary passwords are rejected', async () => {
    seedUser({ status: 'disabled' });
    assert.equal(await codeOf(login('hs1', PASSWORD)), 'ACCOUNT_DISABLED');

    users.clear();
    seedUser({ status: 'invited', mustChangePassword: true, temporaryPasswordExpiresAt: minutes(-60) });
    assert.equal(await codeOf(login('hs1', PASSWORD)), 'INVALID_CREDENTIALS');
  });
});
