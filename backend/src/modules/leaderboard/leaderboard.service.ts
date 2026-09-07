import { AppError } from '../../domain/errors.js';
import type { PublicUser, TagKey } from '../../types/domain.js';
import { TAG_KEYS } from '../../types/domain.js';
import {
  aggregateLedgerExp,
  findLeaderboardPeriodById,
  findStudentExpRow,
  listActiveStudentExpRows,
  listLeaderboardPeriods,
  rebuildAllExpProjections,
  setSubjectExpAbsolute,
  sumLedgerByUser,
  type StudentExpRow,
} from '../../repositories/leaderboard.repository.js';
import { findUserById } from '../../repositories/users.repository.js';
import { isStudentInTeacherClass } from '../../repositories/classes.repository.js';
import { adjustSubjectExp } from '../../repositories/users.repository.js';

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  displayName: string | null;
  username: string;
  email: string;
  totalExp: number;
  subjectExp: Record<TagKey, number>;
}

function emptySubjectExp(): Record<TagKey, number> {
  return Object.fromEntries(TAG_KEYS.map((k) => [k, 0])) as Record<TagKey, number>;
}

function rowToSubjectExp(row: StudentExpRow): Record<TagKey, number> {
  return {
    math: row.mathExp,
    lang: row.langExp,
    flang: row.flangExp,
    sci: row.sciExp,
    hist_geo: row.histGeoExp,
    civic: row.civicExp,
  };
}

function totalOf(subjectExp: Record<TagKey, number>, subjectId?: TagKey): number {
  if (subjectId) return subjectExp[subjectId] ?? 0;
  return TAG_KEYS.reduce((sum, k) => sum + (subjectExp[k] ?? 0), 0);
}

function sortEntries(
  entries: Array<{
    userId: string;
    displayName: string | null;
    username: string;
    email: string;
    subjectExp: Record<TagKey, number>;
    updatedAt: string;
  }>,
  subjectId?: TagKey,
): LeaderboardEntry[] {
  entries.sort((a, b) => {
    const ta = totalOf(a.subjectExp, subjectId);
    const tb = totalOf(b.subjectExp, subjectId);
    if (tb !== ta) return tb - ta;
    const ua = new Date(a.updatedAt).getTime();
    const ub = new Date(b.updatedAt).getTime();
    if (ub !== ua) return ub - ua;
    return a.userId.localeCompare(b.userId);
  });
  return entries.map((e, i) => ({
    rank: i + 1,
    userId: e.userId,
    displayName: e.displayName,
    username: e.username,
    email: e.email,
    totalExp: totalOf(e.subjectExp, subjectId),
    subjectExp: e.subjectExp,
  }));
}

function startOfIsoWeekUtc(d = new Date()): Date {
  const day = d.getUTCDay() || 7; // Mon=1..Sun=7
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - (day - 1));
  return start;
}

function startOfMonthUtc(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export async function resolvePeriodWindow(input: {
  period?: string;
  periodId?: string;
  from?: string;
  to?: string;
}): Promise<{ period: string; from: string | null; to: string | null; periodId?: string }> {
  const period = input.period ?? 'all';
  const now = new Date();

  if (period === 'all') {
    return { period: 'all', from: null, to: null };
  }
  if (period === 'week') {
    const from = startOfIsoWeekUtc(now);
    const to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 7);
    return { period: 'week', from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'month') {
    const from = startOfMonthUtc(now);
    const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
    return { period: 'month', from: from.toISOString(), to: to.toISOString() };
  }
  if (period === 'term') {
    if (!input.periodId) {
      throw new AppError(422, 'periodId required for term', 'PERIOD_ID_REQUIRED');
    }
    const p = await findLeaderboardPeriodById(input.periodId);
    if (!p) throw new AppError(404, 'Period not found', 'NOT_FOUND');
    return {
      period: 'term',
      periodId: p.id,
      from: p.startsAt,
      to: p.endsAt,
    };
  }
  if (period === 'custom') {
    if (!input.from || !input.to) {
      throw new AppError(422, 'from and to required for custom period', 'CUSTOM_RANGE_REQUIRED');
    }
    if (new Date(input.from) >= new Date(input.to)) {
      throw new AppError(422, 'from must be before to', 'INVALID_RANGE');
    }
    return { period: 'custom', from: input.from, to: input.to };
  }
  throw new AppError(422, 'Invalid period', 'INVALID_PERIOD');
}

export async function getLeaderboard(
  _actor: PublicUser | null,
  query: {
    period?: string;
    periodId?: string;
    from?: string;
    to?: string;
    subjectId?: TagKey;
    limit?: number;
  },
) {
  const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
  const window = await resolvePeriodWindow(query);

  if (query.subjectId && !TAG_KEYS.includes(query.subjectId)) {
    throw new AppError(422, 'Invalid subjectId', 'INVALID_SUBJECT');
  }

  if (window.period === 'all' && !window.from) {
    const students = await listActiveStudentExpRows();
    const raw = students.map((s) => ({
      userId: s.id,
      displayName: s.displayName,
      username: s.username,
      email: s.email,
      subjectExp: rowToSubjectExp(s),
      updatedAt: s.updatedAt,
    }));
    const ranked = sortEntries(raw, query.subjectId).filter((e) => e.totalExp > 0);
    return {
      period: window.period,
      from: null,
      to: null,
      subjectId: query.subjectId ?? null,
      entries: ranked.slice(0, limit),
    };
  }

  const aggs = await aggregateLedgerExp({
    from: window.from ?? undefined,
    to: window.to ?? undefined,
    subjectId: query.subjectId,
  });

  const byUser = new Map<string, Record<TagKey, number>>();
  for (const a of aggs) {
    const bag = byUser.get(a.userId) ?? emptySubjectExp();
    bag[a.subjectId] = (bag[a.subjectId] ?? 0) + a.expEarned;
    byUser.set(a.userId, bag);
  }

  const students = await listActiveStudentExpRows();
  const studentMap = new Map(students.map((s) => [s.id, s]));

  const raw = [...byUser.entries()]
    .map(([userId, subjectExp]) => {
      const s = studentMap.get(userId);
      if (!s) return null;
      return {
        userId,
        displayName: s.displayName,
        username: s.username,
        email: s.email,
        subjectExp,
        updatedAt: s.updatedAt,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  const ranked = sortEntries(raw, query.subjectId).filter((e) => e.totalExp > 0);

  return {
    period: window.period,
    periodId: window.periodId,
    from: window.from,
    to: window.to,
    subjectId: query.subjectId ?? null,
    entries: ranked.slice(0, limit),
  };
}

export async function listPeriods() {
  return { periods: await listLeaderboardPeriods() };
}

export async function getStudentExp(actor: PublicUser, studentId: string) {
  if (actor.role === 'student' && actor.id !== studentId) {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
  if (actor.role === 'teacher') {
    const ok = await isStudentInTeacherClass(studentId, actor.id);
    if (!ok) throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  } else if (actor.role !== 'admin' && actor.role !== 'student') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }

  const user = await findUserById(studentId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');

  const projection = await findStudentExpRow(studentId);
  const fromLedger = await sumLedgerByUser(studentId);
  const subjectExp = projection ? rowToSubjectExp(projection) : fromLedger;
  const totalExp = TAG_KEYS.reduce((s, k) => s + subjectExp[k], 0);

  return {
    userId: studentId,
    displayName: user.displayName,
    username: user.username,
    email: user.email,
    totalExp,
    subjectExp,
    projection: subjectExp,
    ledger: fromLedger,
  };
}

export async function rebuildProjections(actor: PublicUser) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'Admin only', 'FORBIDDEN');
  }
  return rebuildAllExpProjections();
}

export async function adminAdjustExp(
  actor: PublicUser,
  body: { userId: string; subjectId: TagKey; delta: number; reason?: string },
) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'Admin only', 'FORBIDDEN');
  }
  if (!TAG_KEYS.includes(body.subjectId)) {
    throw new AppError(422, 'Invalid subjectId', 'INVALID_SUBJECT');
  }
  const user = await findUserById(body.userId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (user.role !== 'student') {
    throw new AppError(422, 'Can only adjust student EXP', 'NOT_STUDENT');
  }

  await adjustSubjectExp(body.userId, body.subjectId, Math.trunc(body.delta));
  const row = await findStudentExpRow(body.userId);
  return {
    userId: body.userId,
    subjectId: body.subjectId,
    delta: Math.trunc(body.delta),
    reason: body.reason ?? null,
    subjectExp: row ? rowToSubjectExp(row) : emptySubjectExp(),
  };
}

export async function adminSetExp(
  actor: PublicUser,
  body: { userId: string; subjectId: TagKey; value: number },
) {
  if (actor.role !== 'admin') {
    throw new AppError(403, 'Admin only', 'FORBIDDEN');
  }
  await setSubjectExpAbsolute(body.userId, body.subjectId, body.value);
  const row = await findStudentExpRow(body.userId);
  return {
    userId: body.userId,
    subjectId: body.subjectId,
    subjectExp: row ? rowToSubjectExp(row) : emptySubjectExp(),
  };
}
