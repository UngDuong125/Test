import { randomInt } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';
import { AppError } from '../domain/errors.js';

const BCRYPT_ROUNDS = 12;

/** Fixed temp password for invites (dev/local convenience). */
const FIXED_TEMPORARY_PASSWORD = '123456';

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export function generateTemporaryPassword(): string {
  return FIXED_TEMPORARY_PASSWORD;
}

const READABLE_LETTERS = 'abcdefghjkmnpqrstuvwxyz'; // no i, l, o
const READABLE_DIGITS = '23456789'; // no 0, 1

/**
 * Random temporary password that is easy to copy from a printed slip, e.g. "kbtm-4827".
 * Used for imported accounts and teacher/admin resets; shown once, never stored.
 */
export function generateRandomTemporaryPassword(): string {
  const pick = (alphabet: string, n: number) =>
    Array.from({ length: n }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${pick(READABLE_LETTERS, 4)}-${pick(READABLE_DIGITS, 4)}`;
}

export function assertPasswordPolicy(password: string): void {
  if (password.length < env.PASSWORD_MIN_LENGTH) {
    throw new AppError(422, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`, 'WEAK_PASSWORD');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AppError(422, 'Password must include at least one letter and one number', 'WEAK_PASSWORD');
  }
}
