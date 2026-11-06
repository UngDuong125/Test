import { getDb } from './db.js';
import { mapUser, type UserRow } from './user.mapper.js';
import type { User, UserRole, UserStatus } from '../types/domain.js';

const USER_COLUMNS =
  'id, email, username, display_name, password_hash, role, status, must_change_password, temporary_password_expires_at, failed_login_attempts, locked_until, email_verified_at, last_login_at, leaderboard_hidden, created_at, updated_at';

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
  email: string | null;
  username: string;
  role: UserRole;
  passwordHash: string;
  temporaryPasswordExpiresAt: string;
  displayName?: string | null;
}): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .insert({
      email: input.email ? input.email.toLowerCase() : null,
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
  // Admin lock has no expiry; a leftover lockout timestamp would make it end on its own.
  if (status === 'locked') patch.locked_until = null;
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

/** Display fields only (no hashes, no email) for a set of users. */
export async function findUserSummariesByIds(
  ids: string[],
): Promise<{ id: string; username: string | null; displayName: string | null }[]> {
  if (ids.length === 0) return [];
  const out: { id: string; username: string | null; displayName: string | null }[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await getDb()
      .from('users')
      .select('id, username, display_name')
      .in('id', ids.slice(i, i + 200));
    if (error) throw error;
    for (const r of (data ?? []) as { id: string; username: string | null; display_name: string | null }[]) {
      out.push({ id: r.id, username: r.username, displayName: r.display_name });
    }
  }
  return out;
}

/** Which of these usernames / emails already exist (lower-cased). */
export async function findExistingIdentifiers(input: {
  usernames: string[];
  emails: string[];
}): Promise<{ usernames: Set<string>; emails: Set<string> }> {
  const usernames = new Set<string>();
  const emails = new Set<string>();
  for (let i = 0; i < input.usernames.length; i += 200) {
    const { data, error } = await getDb()
      .from('users')
      .select('username')
      .in('username', input.usernames.slice(i, i + 200).map((u) => u.toLowerCase()));
    if (error) throw error;
    for (const r of (data ?? []) as { username: string }[]) usernames.add(r.username.toLowerCase());
  }
  for (let i = 0; i < input.emails.length; i += 200) {
    const { data, error } = await getDb()
      .from('users')
      .select('email')
      .in('email', input.emails.slice(i, i + 200).map((e) => e.toLowerCase()));
    if (error) throw error;
    for (const r of (data ?? []) as { email: string | null }[]) {
      if (r.email) emails.add(r.email.toLowerCase());
    }
  }
  return { usernames, emails };
}

/**
 * New temporary password without touching the account status: an active student stays
 * active (keeps classes and assignments) but must change the password at next login.
 */
export async function setTemporaryPassword(
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
      failed_login_attempts: 0,
      locked_until: null,
    })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function setLeaderboardHidden(userId: string, hidden: boolean): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .update({ leaderboard_hidden: hidden })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function updateDisplayName(userId: string, displayName: string | null): Promise<User> {
  const { data, error } = await getDb()
    .from('users')
    .update({ display_name: displayName })
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();
  if (error) throw error;
  return mapUser(data as UserRow);
}

export async function insertAccountAuditEvents(
  rows: { actorId: string; targetUserId: string; action: 'temporary_password_reset' | 'account_imported' }[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await getDb()
    .from('account_audit_events')
    .insert(rows.map((r) => ({ actor_id: r.actorId, target_user_id: r.targetUserId, action: r.action })));
  if (error) throw error;
}
