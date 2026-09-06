import {
  createSession,
  findValidSessionByRawToken,
  revokeAllSessionsForUser,
  revokeSessionById,
} from '../repositories/sessions.repository.js';
import { env } from '../config/env.js';
import type { SessionRecord } from '../types/domain.js';

export async function issueSession(userId: string): Promise<{ rawToken: string; expiresAt: Date; session: SessionRecord }> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 60 * 60 * 1000);
  const { rawToken, session } = await createSession(userId, expiresAt);
  return { rawToken, expiresAt, session };
}

export async function resolveSession(rawToken: string | undefined): Promise<SessionRecord | null> {
  if (!rawToken) return null;
  return findValidSessionByRawToken(rawToken);
}

export async function destroySession(sessionId: string): Promise<void> {
  await revokeSessionById(sessionId);
}

export async function destroyAllUserSessions(userId: string): Promise<void> {
  await revokeAllSessionsForUser(userId);
}
