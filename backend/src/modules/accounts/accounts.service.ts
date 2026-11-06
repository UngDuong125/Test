import { env } from '../../config/env.js';
import { AppError } from '../../domain/errors.js';
import { addMembers, isStudentInTeacherClass, listClasses } from '../../repositories/classes.repository.js';
import { toPublicUser } from '../../repositories/user.mapper.js';
import {
  createInvitedUser,
  findExistingIdentifiers,
  findUserById,
  insertAccountAuditEvents,
  setLeaderboardHidden,
  setTemporaryPassword,
  updateDisplayName,
} from '../../repositories/users.repository.js';
import { sendInviteEmail } from '../../services/email.service.js';
import { generateRandomTemporaryPassword, hashPassword } from '../../services/password.service.js';
import { destroyAllUserSessions } from '../../services/session.service.js';
import type { PublicUser, User } from '../../types/domain.js';
import { validateImportRows, type ImportRowInput } from './import.logic.js';

/** bcrypt is slow on purpose; keep one request well under the platform timeout. */
export const IMPORT_MAX_ROWS = 50;

function printedPasswordExpiry(): string {
  return new Date(Date.now() + env.PRINTED_TEMP_PASSWORD_TTL_DAYS * 86_400_000).toISOString();
}

async function classIndex() {
  const { items } = await listClasses({ limit: 1000 });
  const byName = new Map<string, { id: string; name: string }[]>();
  for (const c of items) {
    const key = c.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), { id: c.id, name: c.name }]);
  }
  return byName;
}

/**
 * Admin bulk account creation. `dryRun` only validates. On a real run every valid row is
 * created with a random temporary password, returned once so the admin can print slips;
 * passwords are never logged or stored in clear. Rows with errors are not created.
 */
export async function importAccounts(
  actor: PublicUser,
  input: { rows: ImportRowInput[]; dryRun: boolean; sendEmail: boolean },
) {
  if (actor.role !== 'admin') throw new AppError(403, 'Admin only', 'FORBIDDEN');
  if (input.rows.length === 0) throw new AppError(422, 'No rows', 'EMPTY_IMPORT');
  if (input.rows.length > IMPORT_MAX_ROWS) {
    throw new AppError(422, `At most ${IMPORT_MAX_ROWS} rows per request`, 'IMPORT_TOO_LARGE');
  }

  const existing = await findExistingIdentifiers({
    usernames: input.rows.map((r) => r.username ?? '').filter(Boolean),
    emails: input.rows.map((r) => r.email ?? '').filter(Boolean),
  });
  const { valid, errors } = validateImportRows(input.rows, existing, await classIndex());

  if (input.dryRun) {
    return {
      dryRun: true,
      valid: valid.map(({ line, username, displayName, role, email, className }) => ({
        line,
        username,
        displayName,
        role,
        email,
        className,
      })),
      errors,
      created: [],
    };
  }

  const expiresAt = printedPasswordExpiry();
  const created: {
    line: number;
    userId: string;
    username: string;
    displayName: string | null;
    className: string | null;
    temporaryPassword: string;
    emailDelivered: boolean | null;
  }[] = [];

  for (const row of valid) {
    const temporaryPassword = generateRandomTemporaryPassword();
    try {
      const user = await createInvitedUser({
        email: row.email,
        username: row.username,
        role: row.role,
        passwordHash: await hashPassword(temporaryPassword),
        temporaryPasswordExpiresAt: expiresAt,
        displayName: row.displayName,
      });
      if (row.classId) await addMembers(row.classId, [user.id]);
      let emailDelivered: boolean | null = null;
      if (input.sendEmail && row.email) {
        emailDelivered = (
          await sendInviteEmail({
            to: row.email,
            username: user.username,
            temporaryPassword,
            loginUrl: `${env.FRONTEND_ORIGIN}/login`,
          })
        ).delivered;
      }
      created.push({
        line: row.line,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        className: row.className,
        temporaryPassword,
        emailDelivered,
      });
    } catch (err) {
      errors.push({
        line: row.line,
        username: row.username,
        message: err instanceof Error ? `Không tạo được: ${err.message}` : 'Không tạo được',
      });
    }
  }

  await insertAccountAuditEvents(
    created.map((c) => ({ actorId: actor.id, targetUserId: c.userId, action: 'account_imported' as const })),
  );

  return { dryRun: false, valid: [], errors, created, expiresAt };
}

/**
 * Issue a new temporary password for a student. Admins: anyone except themselves.
 * Teachers: only students in a class they own. The account keeps its status, all
 * sessions end, and the student must choose a new password at next login.
 */
export async function resetTemporaryPassword(actor: PublicUser, userId: string) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (actor.id === userId) {
    throw new AppError(422, 'Use change password for your own account', 'SELF_RESET');
  }
  const user = await findUserById(userId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (actor.role === 'teacher') {
    if (user.role !== 'student' || !(await isStudentInTeacherClass(userId, actor.id))) {
      throw new AppError(403, 'Student is not in your classes', 'FORBIDDEN');
    }
  }
  if (user.status === 'disabled') {
    throw new AppError(422, 'Account is disabled', 'ACCOUNT_DISABLED');
  }

  const temporaryPassword = generateRandomTemporaryPassword();
  const expiresAt = printedPasswordExpiry();
  const updated = await setTemporaryPassword(userId, await hashPassword(temporaryPassword), expiresAt);
  await destroyAllUserSessions(userId);
  await insertAccountAuditEvents([
    { actorId: actor.id, targetUserId: userId, action: 'temporary_password_reset' },
  ]);

  return {
    user: toPublicUser(updated),
    temporaryPassword,
    expiresAt,
  };
}

/** Student profile settings shown on the leaderboard. */
export async function updateMyProfile(
  actor: PublicUser,
  patch: { displayName?: string | null; leaderboardHidden?: boolean },
) {
  const current = await findUserById(actor.id);
  if (!current) throw new AppError(401, 'Unauthorized', 'UNAUTHORIZED');
  let user: User = current;
  if (patch.displayName !== undefined) {
    const name = patch.displayName?.trim() || null;
    user = await updateDisplayName(actor.id, name);
  }
  if (patch.leaderboardHidden !== undefined) {
    if (actor.role !== 'student') {
      throw new AppError(422, 'Only students appear on the leaderboard', 'NOT_STUDENT');
    }
    user = await setLeaderboardHidden(actor.id, patch.leaderboardHidden);
  }
  return toPublicUser(user);
}
