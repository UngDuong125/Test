import { getDb } from './db.js';
import type { TagKey } from '../types/domain.js';
import { TAG_KEYS } from '../types/domain.js';

export interface LeaderboardPeriod {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
}

export interface StudentExpRow {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  updatedAt: string;
  mathExp: number;
  langExp: number;
  flangExp: number;
  sciExp: number;
  histGeoExp: number;
  civicExp: number;
}

export interface LedgerAggRow {
  userId: string;
  subjectId: TagKey;
  expEarned: number;
}

const STUDENT_EXP_COLUMNS =
  'id, email, username, display_name, updated_at, math_exp, lang_exp, flang_exp, sci_exp, hist_geo_exp, civic_exp';

export async function listLeaderboardPeriods(): Promise<LeaderboardPeriod[]> {
  const { data, error } = await getDb()
    .from('leaderboard_periods')
    .select('id, label, starts_at, ends_at')
    .order('starts_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as { id: string; label: string; starts_at: string; ends_at: string }[]).map(
    (r) => ({
      id: r.id,
      label: r.label,
      startsAt: r.starts_at,
      endsAt: r.ends_at,
    }),
  );
}

export async function findLeaderboardPeriodById(id: string): Promise<LeaderboardPeriod | null> {
  const { data, error } = await getDb()
    .from('leaderboard_periods')
    .select('id, label, starts_at, ends_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as { id: string; label: string; starts_at: string; ends_at: string };
  return { id: r.id, label: r.label, startsAt: r.starts_at, endsAt: r.ends_at };
}

export async function listActiveStudentExpRows(): Promise<StudentExpRow[]> {
  const { data, error } = await getDb()
    .from('users')
    .select(STUDENT_EXP_COLUMNS)
    .eq('role', 'student')
    .eq('status', 'active');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    email: String(r.email),
    username: String(r.username),
    displayName: (r.display_name as string | null) ?? null,
    updatedAt: String(r.updated_at),
    mathExp: Number(r.math_exp ?? 0),
    langExp: Number(r.lang_exp ?? 0),
    flangExp: Number(r.flang_exp ?? 0),
    sciExp: Number(r.sci_exp ?? 0),
    histGeoExp: Number(r.hist_geo_exp ?? 0),
    civicExp: Number(r.civic_exp ?? 0),
  }));
}

export async function findStudentExpRow(userId: string): Promise<StudentExpRow | null> {
  const { data, error } = await getDb()
    .from('users')
    .select(STUDENT_EXP_COLUMNS)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: String(r.id),
    email: String(r.email),
    username: String(r.username),
    displayName: (r.display_name as string | null) ?? null,
    updatedAt: String(r.updated_at),
    mathExp: Number(r.math_exp ?? 0),
    langExp: Number(r.lang_exp ?? 0),
    flangExp: Number(r.flang_exp ?? 0),
    sciExp: Number(r.sci_exp ?? 0),
    histGeoExp: Number(r.hist_geo_exp ?? 0),
    civicExp: Number(r.civic_exp ?? 0),
  };
}

/** Aggregate EXP from ledger in [from, to). */
export async function aggregateLedgerExp(opts: {
  from?: string;
  to?: string;
  subjectId?: TagKey;
}): Promise<LedgerAggRow[]> {
  let query = getDb()
    .from('exp_ledger')
    .select('user_id, subject_id, exp_earned, created_at');

  if (opts.from) query = query.gte('created_at', opts.from);
  if (opts.to) query = query.lt('created_at', opts.to);
  if (opts.subjectId) query = query.eq('subject_id', opts.subjectId);

  const { data, error } = await query;
  if (error) throw error;

  const map = new Map<string, LedgerAggRow>();
  for (const row of (data ?? []) as {
    user_id: string;
    subject_id: TagKey;
    exp_earned: number;
  }[]) {
    const key = `${row.user_id}:${row.subject_id}`;
    const existing = map.get(key);
    if (existing) {
      existing.expEarned += Number(row.exp_earned);
    } else {
      map.set(key, {
        userId: row.user_id,
        subjectId: row.subject_id,
        expEarned: Number(row.exp_earned),
      });
    }
  }
  return [...map.values()];
}

export async function sumLedgerByUser(userId: string): Promise<Record<TagKey, number>> {
  const { data, error } = await getDb()
    .from('exp_ledger')
    .select('subject_id, exp_earned')
    .eq('user_id', userId);
  if (error) throw error;

  const result = Object.fromEntries(TAG_KEYS.map((k) => [k, 0])) as Record<TagKey, number>;
  for (const row of (data ?? []) as { subject_id: TagKey; exp_earned: number }[]) {
    if (row.subject_id in result) {
      result[row.subject_id] += Number(row.exp_earned);
    }
  }
  return result;
}

/** Rebuild all student projections from exp_ledger (admin). */
export async function rebuildAllExpProjections(): Promise<{ updated: number }> {
  const { data: ledger, error } = await getDb()
    .from('exp_ledger')
    .select('user_id, subject_id, exp_earned');
  if (error) throw error;

  const byUser = new Map<string, Record<TagKey, number>>();
  for (const row of (ledger ?? []) as {
    user_id: string;
    subject_id: TagKey;
    exp_earned: number;
  }[]) {
    const bag =
      byUser.get(row.user_id) ??
      (Object.fromEntries(TAG_KEYS.map((k) => [k, 0])) as Record<TagKey, number>);
    if (row.subject_id in bag) {
      bag[row.subject_id] += Number(row.exp_earned);
    }
    byUser.set(row.user_id, bag);
  }

  // Reset all student exp to 0 then apply
  const students = await listActiveStudentExpRows();
  let updated = 0;
  for (const s of students) {
    const totals = byUser.get(s.id) ?? (Object.fromEntries(TAG_KEYS.map((k) => [k, 0])) as Record<
      TagKey,
      number
    >);
    const { error: upErr } = await getDb()
      .from('users')
      .update({
        math_exp: totals.math,
        lang_exp: totals.lang,
        flang_exp: totals.flang,
        sci_exp: totals.sci,
        hist_geo_exp: totals.hist_geo,
        civic_exp: totals.civic,
      })
      .eq('id', s.id);
    if (upErr) throw upErr;
    updated += 1;
  }
  return { updated };
}

export async function setSubjectExpAbsolute(
  userId: string,
  subjectId: TagKey,
  value: number,
): Promise<void> {
  const column: Record<TagKey, string> = {
    math: 'math_exp',
    lang: 'lang_exp',
    flang: 'flang_exp',
    sci: 'sci_exp',
    hist_geo: 'hist_geo_exp',
    civic: 'civic_exp',
  };
  const { error } = await getDb()
    .from('users')
    .update({ [column[subjectId]]: Math.max(0, Math.floor(value)) })
    .eq('id', userId);
  if (error) throw error;
}
