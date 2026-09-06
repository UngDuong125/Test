import { createHash, randomBytes } from 'node:crypto';
import { getDb } from './db.js';
import type { AuthTokenType, SessionRecord } from '../types/domain.js';

export function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

export function generateRawToken(bytes = 32): string {
  return randomBytes(bytes).toString('hex');
}

interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

function mapSession(row: SessionRow): SessionRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export async function createSession(userId: string, expiresAt: Date): Promise<{ rawToken: string; session: SessionRecord }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const { data, error } = await getDb()
    .from('sessions')
    .insert({
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, user_id, token_hash, expires_at, revoked_at, created_at')
    .single();

  if (error) throw error;
  return { rawToken, session: mapSession(data as SessionRow) };
}

export async function findValidSessionByRawToken(rawToken: string): Promise<SessionRecord | null> {
  const tokenHash = hashToken(rawToken);
  const { data, error } = await getDb()
    .from('sessions')
    .select('id, user_id, token_hash, expires_at, revoked_at, created_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  const session = mapSession(data as SessionRow);
  if (session.revokedAt) return null;
  if (new Date(session.expiresAt).getTime() <= Date.now()) return null;
  return session;
}

export async function revokeSessionById(sessionId: string): Promise<void> {
  const { error } = await getDb()
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', sessionId)
    .is('revoked_at', null);
  if (error) throw error;
}

export async function revokeAllSessionsForUser(userId: string): Promise<void> {
  const { error } = await getDb()
    .from('sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (error) throw error;
}

export async function createAuthToken(
  userId: string,
  type: AuthTokenType,
  expiresAt: Date,
): Promise<string> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);
  const { error } = await getDb().from('auth_tokens').insert({
    user_id: userId,
    token_hash: tokenHash,
    type,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw error;
  return rawToken;
}

export async function findValidAuthToken(
  rawToken: string,
  type: AuthTokenType,
): Promise<{ id: string; userId: string } | null> {
  const tokenHash = hashToken(rawToken);
  const { data, error } = await getDb()
    .from('auth_tokens')
    .select('id, user_id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .eq('type', type)
    .maybeSingle();

  if (error) throw error;
  if (!data || data.used_at) return null;
  if (new Date(data.expires_at).getTime() <= Date.now()) return null;
  return { id: data.id as string, userId: data.user_id as string };
}

export async function markAuthTokenUsed(tokenId: string): Promise<void> {
  const { error } = await getDb()
    .from('auth_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', tokenId)
    .is('used_at', null);
  if (error) throw error;
}

export async function invalidateUnusedTokens(userId: string, type: AuthTokenType): Promise<void> {
  const { error } = await getDb()
    .from('auth_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('type', type)
    .is('used_at', null);
  if (error) throw error;
}
