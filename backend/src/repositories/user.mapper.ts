import type { User, UserRole, UserStatus } from '../types/domain.js';

/** Row shape from public.users (snake_case). */
export interface UserRow {
  id: string;
  email: string;
  username: string;
  display_name: string | null;
  password_hash: string;
  role: UserRole;
  status: UserStatus;
  must_change_password: boolean;
  temporary_password_expires_at: string | null;
  failed_login_attempts: number;
  locked_until: string | null;
  email_verified_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export function mapUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    displayName: row.display_name,
    role: row.role,
    status: row.status,
    mustChangePassword: row.must_change_password,
    temporaryPasswordExpiresAt: row.temporary_password_expires_at,
    failedLoginAttempts: row.failed_login_attempts,
    lockedUntil: row.locked_until,
    emailVerifiedAt: row.email_verified_at,
    lastLoginAt: row.last_login_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toPublicUser(user: User) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    mustChangePassword: user.mustChangePassword,
  };
}
