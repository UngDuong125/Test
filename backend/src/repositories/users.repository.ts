import { getDb } from './db.js';
import { mapUser, type UserRow } from './user.mapper.js';
import type { User, UserRole, UserStatus } from '../types/domain.js';

const USER_COLUMNS =
  'id, email, username, display_name, password_hash, role, status, must_change_password, temporary_password_expires_at, failed_login_attempts, locked_until, email_verified_at, last_login_at, created_at, updated_at';

type UserWithHash = User & { passwordHash: string };

function withHash(row: UserRow): UserWithHash {
  return { ...mapUser(row), passwordHash: row.password_hash };
}

export async function findUserByEmail(email: string): Promise<UserWithHash | null> {
  const { data, error } = await getDb()
    .from('users')
    .select(USER_COLUMNS)
    .eq('email', email.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return withHash(data as UserRow);
}

export async function findUserByUsername(username: string): Promise<UserWithHash | null> {
  const { data, error } = await getDb()
    .from('users')
    .select(USER_COLUMNS)
    .eq('username', username.toLowerCase())
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return withHash(data as UserRow);
}

/** Resolve login identifier: email if it contains `@`, otherwise username. */
export async function findUserByLoginIdentifier(identifier: string): Promise<UserWithHash | null> {
  const trimmed = identifier.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) {
    return findUserByEmail(trimmed.toLowerCase());
  }
  return findUserByUsername(trimmed.toLowerCase());
}

export async function findUserById(id: string): Promise<UserWithHash | null> {
  const { data, error } = await getDb()
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return withHash(data as UserRow);
}

export async function usernameExists(username: string, excludeUserId?: string): Promise<boolean> {
  let query = getDb().from('users').select('id').eq('username', username.toLowerCase());
  if (excludeUserId) query = query.neq('id', excludeUserId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function createInvitedUser(input: {
  email: string;
  username: string;
  role: UserRole;
  passwordHash: string;
  temporaryPasswordExpiresAt: string;
  displayName?: string | null;
}): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .insert({
      email: input.email.toLowerCase(),
      username: input.username.toLowerCase(),
      display_name: input.displayName ?? null,
      password_hash: input.passwordHash,
      role: input.role,
      status: 'invited' satisfies UserStatus,
      must_change_password: true,
      temporary_password_expires_at: input.temporaryPasswordExpiresAt,
    })
    .select(USER_COLUMNS)
    .single();

  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function updateUserPassword(
  userId: string,
  passwordHash: string,
  opts: { clearMustChange: boolean; activate: boolean },
): Promise<User> {
  const patch: Record<string, unknown> = {
    password_hash: passwordHash,
    temporary_password_expires_at: null,
    failed_login_attempts: 0,
    locked_until: null,
  };
  if (opts.clearMustChange) patch.must_change_password = false;
  if (opts.activate) {
    patch.status = 'active';
    patch.email_verified_at = new Date().toISOString();
  }

  const { data, error } = await getDb()
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();

  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function refreshInviteCredentials(
  userId: string,
  passwordHash: string,
  temporaryPasswordExpiresAt: string,
): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .update({
      password_hash: passwordHash,
      must_change_password: true,
      temporary_password_expires_at: temporaryPasswordExpiresAt,
      status: 'invited',
      failed_login_attempts: 0,
      locked_until: null,
    })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();

  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function recordFailedLogin(userId: string, attempts: number, lockedUntil: string | null) {
  const patch: Record<string, unknown> = {
    failed_login_attempts: attempts,
    locked_until: lockedUntil,
  };
  if (lockedUntil) patch.status = 'locked';

  const { error } = await getDb().from('users').update(patch).eq('id', userId);
  if (error) throw error;
}

export async function recordSuccessfulLogin(userId: string) {
  const user = await findUserById(userId);
  if (!user) return;

  const nextStatus = user.status === 'locked' ? 'active' : user.status;
  const { error } = await getDb()
    .from('users')
    .update({
      failed_login_attempts: 0,
      locked_until: null,
      last_login_at: new Date().toISOString(),
      status: nextStatus,
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateUserStatus(userId: string, status: UserStatus): Promise<User> {
  const patch: Record<string, unknown> = { status };
  if (status === 'active') {
    patch.locked_until = null;
    patch.failed_login_attempts = 0;
  }
  const { data, error } = await getDb()
    .from('users')
    .update(patch)
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function updateUserRole(userId: string, role: UserRole): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .update({ role })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function listUsers(): Promise<User[]> {
  const { data, error } = await getDb()
    .from('users')
    .select(USER_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as UserRow[]).map(mapUser);
}

const EXP_COLUMN_BY_SUBJECT: Record<string, string> = {
  math: 'math_exp',
  lang: 'lang_exp',
  flang: 'flang_exp',
  sci: 'sci_exp',
  hist_geo: 'hist_geo_exp',
  civic: 'civic_exp',
};

/** Adjust subject EXP projection by delta (can be negative for regrade). Clamps at 0. */
export async function adjustSubjectExp(
  userId: string,
  subjectId: string,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const column = EXP_COLUMN_BY_SUBJECT[subjectId];
  if (!column) throw new Error(`Unknown subject for EXP: ${subjectId}`);

  const { data, error } = await getDb()
    .from('users')
    .select(column)
    .eq('id', userId)
    .single();
  if (error) throw error;

  const current = Number((data as unknown as Record<string, number | string>)[column] ?? 0);
  const next = Math.max(0, current + delta);
  const { error: updateError } = await getDb()
    .from('users')
    .update({ [column]: next })
    .eq('id', userId);
  if (updateError) throw updateError;
}
