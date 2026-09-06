import { env } from '../../config/env.js';
import { AppError } from '../../domain/errors.js';
import { toPublicUser } from '../../repositories/user.mapper.js';
import {
  createAuthToken,
  findValidAuthToken,
  invalidateUnusedTokens,
  markAuthTokenUsed,
} from '../../repositories/sessions.repository.js';
import {
  createInvitedUser,
  findUserByEmail,
  findUserById,
  findUserByLoginIdentifier,
  recordFailedLogin,
  recordSuccessfulLogin,
  refreshInviteCredentials,
  updateUserPassword,
  usernameExists,
} from '../../repositories/users.repository.js';
import { sendInviteEmail, sendPasswordResetEmail } from '../../services/email.service.js';
import {
  assertPasswordPolicy,
  generateTemporaryPassword,
  hashPassword,
  verifyPassword,
} from '../../services/password.service.js';
import {
  destroyAllUserSessions,
  destroySession,
  issueSession,
} from '../../services/session.service.js';
import { isValidUsername, normalizeUsername } from '../../services/username.service.js';
import type { PublicUser, UserRole } from '../../types/domain.js';

const GENERIC_LOGIN_ERROR = 'Invalid login or password';

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function isTemporarilyLocked(user: { lockedUntil: string | null; status: string }): boolean {
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) return true;
  return user.status === 'locked' && Boolean(user.lockedUntil);
}

export async function login(loginIdentifier: string, password: string): Promise<{
  user: PublicUser;
  rawToken: string;
  expiresAt: string;
}> {
  const user = await findUserByLoginIdentifier(loginIdentifier);

  // Uniform error — never reveal whether account exists
  if (!user) {
    throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  if (user.status === 'disabled') {
    throw new AppError(403, 'Account is disabled', 'ACCOUNT_DISABLED');
  }

  if (isTemporarilyLocked(user)) {
    throw new AppError(403, 'Account is temporarily locked. Try again later or contact admin.', 'ACCOUNT_LOCKED');
  }

  if (
    user.mustChangePassword &&
    user.temporaryPasswordExpiresAt &&
    new Date(user.temporaryPasswordExpiresAt).getTime() < Date.now()
  ) {
    throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    let lockedUntil: string | null = null;
    if (attempts >= env.MAX_FAILED_LOGINS) {
      lockedUntil = new Date(Date.now() + env.LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    await recordFailedLogin(user.id, attempts, lockedUntil);
    throw new AppError(401, GENERIC_LOGIN_ERROR, 'INVALID_CREDENTIALS');
  }

  await recordSuccessfulLogin(user.id);
  const refreshed = await findUserById(user.id);
  if (!refreshed) throw new AppError(500, 'User missing after login');

  const { rawToken, expiresAt } = await issueSession(refreshed.id);
  return {
    user: toPublicUser(refreshed),
    rawToken,
    expiresAt: expiresAt.toISOString(),
  };
}

export async function logout(sessionId: string): Promise<void> {
  await destroySession(sessionId);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<PublicUser> {
  const user = await findUserById(userId);
  if (!user) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) throw new AppError(401, 'Current password is incorrect', 'INVALID_PASSWORD');

  assertPasswordPolicy(newPassword);
  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError(422, 'New password must be different from the current password', 'PASSWORD_REUSED');
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await updateUserPassword(userId, passwordHash, {
    clearMustChange: true,
    activate: true,
  });
  await destroyAllUserSessions(userId);
  return toPublicUser(updated);
}

export async function forgotPassword(email: string): Promise<{ ok: true }> {
  const user = await findUserByEmail(email);
  // Always return ok to avoid email enumeration
  if (!user || user.status === 'disabled') return { ok: true };

  await invalidateUnusedTokens(user.id, 'password_reset');
  const rawToken = await createAuthToken(user.id, 'password_reset', hoursFromNow(env.RESET_TOKEN_TTL_HOURS));
  const resetUrl = `${env.FRONTEND_ORIGIN}/reset-password?token=${encodeURIComponent(rawToken)}`;
  await sendPasswordResetEmail({ to: user.email, resetUrl });
  return { ok: true };
}

export async function resetPassword(token: string, newPassword: string): Promise<PublicUser> {
  const record = await findValidAuthToken(token, 'password_reset');
  if (!record) throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');

  assertPasswordPolicy(newPassword);
  const user = await findUserById(record.userId);
  if (!user || user.status === 'disabled') {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
  }

  if (await verifyPassword(newPassword, user.passwordHash)) {
    throw new AppError(422, 'New password must be different from the current password', 'PASSWORD_REUSED');
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await updateUserPassword(user.id, passwordHash, {
    clearMustChange: true,
    activate: true,
  });
  await markAuthTokenUsed(record.id);
  await destroyAllUserSessions(user.id);
  return toPublicUser(updated);
}

export async function inviteUser(input: {
  email: string;
  username: string;
  role: UserRole;
  displayName?: string | null;
}): Promise<{ user: PublicUser; emailDelivered: boolean }> {
  const username = normalizeUsername(input.username);
  if (!isValidUsername(username)) {
    throw new AppError(422, 'Invalid username format', 'INVALID_USERNAME');
  }

  const existingEmail = await findUserByEmail(input.email);
  if (existingEmail) throw new AppError(409, 'Email already registered', 'EMAIL_EXISTS');

  if (await usernameExists(username)) {
    throw new AppError(409, 'Username already taken', 'USERNAME_EXISTS');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const expiresAt = hoursFromNow(env.TEMP_PASSWORD_TTL_HOURS);

  const user = await createInvitedUser({
    email: input.email,
    username,
    role: input.role,
    passwordHash,
    temporaryPasswordExpiresAt: expiresAt.toISOString(),
    displayName: input.displayName ?? null,
  });

  await invalidateUnusedTokens(user.id, 'invite');
  await createAuthToken(user.id, 'invite', hoursFromNow(env.INVITE_TOKEN_TTL_HOURS));

  const { delivered } = await sendInviteEmail({
    to: user.email,
    username: user.username,
    temporaryPassword,
    loginUrl: `${env.FRONTEND_ORIGIN}/login`,
  });

  return { user: toPublicUser(user), emailDelivered: delivered };
}

export async function resendInvite(userId: string): Promise<{ emailDelivered: boolean }> {
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (user.status !== 'invited' && !user.mustChangePassword) {
    throw new AppError(422, 'User is already activated', 'ALREADY_ACTIVE');
  }

  const temporaryPassword = generateTemporaryPassword();
  const passwordHash = await hashPassword(temporaryPassword);
  const expiresAt = hoursFromNow(env.TEMP_PASSWORD_TTL_HOURS);

  await refreshInviteCredentials(user.id, passwordHash, expiresAt.toISOString());

  await invalidateUnusedTokens(user.id, 'invite');
  await createAuthToken(user.id, 'invite', hoursFromNow(env.INVITE_TOKEN_TTL_HOURS));
  await destroyAllUserSessions(user.id);

  const { delivered } = await sendInviteEmail({
    to: user.email,
    username: user.username,
    temporaryPassword,
    loginUrl: `${env.FRONTEND_ORIGIN}/login`,
  });

  return { emailDelivered: delivered };
}
