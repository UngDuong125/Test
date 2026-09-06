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

export function assertPasswordPolicy(password: string): void {
  if (password.length < env.PASSWORD_MIN_LENGTH) {
    throw new AppError(422, `Password must be at least ${env.PASSWORD_MIN_LENGTH} characters`, 'WEAK_PASSWORD');
  }
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    throw new AppError(422, 'Password must include at least one letter and one number', 'WEAK_PASSWORD');
  }
}
