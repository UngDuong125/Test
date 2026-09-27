'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ApiError,
  assignExam,
  cancelAssignment,
  listAssignmentAttempts,
  listExamAssignments,
  listExamResults,
} from '@/lib/api-client';
import type { AssignmentStatus, ClassRecord, ExamAssignment } from '@/types/content';

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 100;
const MAX_PAGES = 20;
const REASSIGN_CONCURRENCY = 5;
/** Only opened windows count as "missed"; `assigned` (not open yet) is left alone. */
const REASSIGNABLE: AssignmentStatus[] = ['available', 'expired'];

type Group = {
  key: string;
  examId: string;
  examTitle: string;
  sourceClassId: string | null;
  items: ExamAssignment[];
  firstAssignedAt: string;
  attemptTotal: number;
  attemptedStudents: number;
  activeCount: number;
  reassignable: ExamAssignment[];
};

function startOfWeek(d: Date) {
  const res = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offsetToMonday = (res.getDay() + 6) % 7;
  res.setDate(res.getDate() - offsetToMonday);
  return res;
}

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function fetchAssignmentsInRange(from: Date, to: Date) {
  const collected: ExamAssignment[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await listExamAssignments({ limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    collected.push(...res.items);
    const last = res.items[res.items.length - 1];
    if (!last || res.items.length < PAGE_SIZE || new Date(last.assignedAt) < from) break;
  }
  return collected.filter((a) => {
    const t = new Date(a.assignedAt);
    return t >= from && t < to;
  });
}

/** Attempt count per assignment id (cancelled attempts excluded). */
async function fetchAttemptCounts(assignments: ExamAssignment[]) {
  const counts = new Map<string, number>();
  const byExam = new Map<string, ExamAssignment[]>();
  for (const a of assignments) {
    counts.set(a.id, 0);
    byExam.set(a.examId, [...(byExam.get(a.examId) ?? []), a]);
  }

  await Promise.all(
    [...byExam.entries()].map(async ([examId, items]) => {
      try {
        const res = await listExamResults(examId);
        for (const attempt of res.items) {
          if (attempt.status === 'cancelled' || !counts.has(attempt.assignmentId)) continue;
          counts.set(attempt.assignmentId, (counts.get(attempt.assignmentId) ?? 0) + 1);
        }
      } catch {
        await Promise.all(
          items.map(async (a) => {
            const res = await listAssignmentAttempts(a.id);
            counts.set(a.id, res.attempts.filter((t) => t.status !== 'cancelled').length);
          }),
        );
      }
    }),
  );
  return counts;
}

async function runLimited<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length > 0) {
        const next = queue.shift()!;
        await fn(next);
      }
    }),
  );
}

export function WeeklyAssignmentSummary({
  classes,
  refreshKey,
  onChanged,
}: {
  classes: ClassRecord[];
  refreshKey?: number;
  onChanged?: () => void;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [attemptCounts, setAttemptCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [onlyUnattempted, setOnlyUnattempted] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [newDeadline, setNewDeadline] = useState(() =>
    toLocalInputValue(new Date(Date.now() + 7 * DAY_MS)),
  );

  const weekStart = useMemo(() => {
    const start = startOfWeek(new Date());
    start.setDate(start.getDate() + weekOffset * 7);
    return start;
  }, [weekOffset]);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS), [weekStart]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchAssignmentsInRange(weekStart, weekEnd);
      const counts = await fetchAttemptCounts(items);
      setAssignments(items);
      setAttemptCounts(counts);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được tổng hợp tuần');
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const classNameById = useMemo(
    () => new Map(classes.map((c) => [c.id, c.name])),
    [classes],
  );

  const groups = useMemo<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const a of assignments) {
      const key = `${a.examId}:${a.sourceClassId ?? 'individual'}`;
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          examId: a.examId,
          examTitle: a.examTitle ?? a.examId,
          sourceClassId: a.sourceClassId,
          items: [],
          firstAssignedAt: a.assignedAt,
          attemptTotal: 0,
          attemptedStudents: 0,
          activeCount: 0,
          reassignable: [],
        };
        map.set(key, g);
      }
      g.items.push(a);
      if (a.assignedAt < g.firstAssignedAt) g.firstAssignedAt = a.assignedAt;
      if (a.status === 'cancelled') continue;
      g.activeCount += 1;
      const count = attemptCounts.get(a.id) ?? 0;
      g.attemptTotal += count;
      if (count > 0) g.attemptedStudents += 1;
      else if (REASSIGNABLE.includes(a.status)) g.reassignable.push(a);
    }
    return [...map.values()]
      .filter((g) => g.activeCount > 0)
      .sort((a, b) => b.firstAssignedAt.localeCompare(a.firstAssignedAt));
  }, [assignments, attemptCounts]);

  const visibleGroups = onlyUnattempted ? groups.filter((g) => g.attemptTotal === 0) : groups;
  const unattemptedGroups = groups.filter(
    (g) => g.attemptTotal === 0 && g.reassignable.length > 0,
  );

  const totals = useMemo(
    () => ({
      exams: new Set(groups.map((g) => g.examId)).size,
      assignments: groups.reduce((s, g) => s + g.activeCount, 0),
      attempted: groups.reduce((s, g) => s + g.attemptedStudents, 0),
      unattemptedExams: groups.filter((g) => g.attemptTotal === 0).length,
    }),
    [groups],
  );

  async function reassign(key: string, targets: ExamAssignment[]) {
    const deadline = new Date(newDeadline);
    const availableFrom = new Date();
    if (Number.isNaN(deadline.getTime()) || deadline <= availableFrom) {
      setError('Deadline mới phải sau thời điểm hiện tại');
      return;
    }
    setBusyKey(key);
    setError(null);
    setNotice(null);
    let ok = 0;
    const failures: string[] = [];
    await runLimited(targets, REASSIGN_CONCURRENCY, async (a) => {
      const who = a.targetUsername || a.targetEmail || a.targetId.slice(0, 8);
      try {
        // Backend skips creating when an assignment that is not cancelled/expired exists.
        await cancelAssignment(a.id);
        const res = await assignExam(a.examId, {
          targetType: 'user',
          targetId: a.targetId,
          availableFrom: availableFrom.toISOString(),
          deadline: deadline.toISOString(),
          attemptLimit: a.attemptLimit,
          settings: a.settings,
        });
        if (res.assignments.length > 0) ok += 1;
        else failures.push(`${who}: ${res.warnings.join(', ') || 'không tạo được assignment'}`);
      } catch (err) {
        failures.push(`${who}: ${err instanceof ApiError ? err.message : 'lỗi'}`);
      }
    });
    setBusyKey(null);
    setNotice(`Đã giao lại ${ok}/${targets.length} assignment (hạn ${deadline.toLocaleString()}).`);
    if (failures.length > 0) setError(failures.join('; '));
    await load();
    onChanged?.();
  }

  const isCurrentWeek = weekOffset === 0;
  const weekLabel = `${weekStart.toLocaleDateString()} – ${new Date(weekEnd.getTime() - 1).toLocaleDateString()}`;

  return (
    <section className="space-y-4 rounded-xl border border-mist bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-ink">
            Tổng hợp đề đã giao {isCurrentWeek ? 'tuần này' : 'tuần'}
          </p>
          <p className="text-xs text-slate-500">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="rounded-md border border-mist px-2 py-1 hover:border-accent"
          >
            ← Tuần trước
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={isCurrentWeek}
            className="rounded-md border border-mist px-2 py-1 hover:border-accent disabled:opacity-40"
          >
            Tuần sau →
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-slate-500">Không có đề nào được giao trong tuần này.</p>
      ) : (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-slate-500">Đề đã giao</p>
              <p className="text-lg font-semibold text-ink">{totals.exams}</p>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-slate-500">Lượt giao (HS)</p>
              <p className="text-lg font-semibold text-ink">{totals.assignments}</p>
            </div>
            <div className="rounded-md bg-slate-50 px-3 py-2">
              <p className="text-slate-500">HS đã làm</p>
              <p className="text-lg font-semibold text-ink">
                {totals.attempted}/{totals.assignments}
              </p>
            </div>
            <div className="rounded-md bg-amber-50 px-3 py-2">
              <p className="text-amber-700">Đề chưa có lượt làm</p>
              <p className="text-lg font-semibold text-amber-800">{totals.unattemptedExams}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-md border border-mist px-3 py-2 text-sm">
            <label className="text-sm">
              Deadline khi giao lại
              <input
                type="datetime-local"
                className="mt-1 block rounded-md border border-mist px-3 py-1.5"
                value={newDeadline}
                onChange={(e) => setNewDeadline(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={busyKey !== null || unattemptedGroups.length === 0}
              onClick={() =>
                void reassign(
                  'all',
                  unattemptedGroups.flatMap((g) => g.reassignable),
                )
              }
              className="rounded-md bg-accent px-3 py-2 font-semibold text-white hover:bg-accentDark disabled:opacity-50"
            >
              {busyKey === 'all'
                ? 'Đang giao lại…'
                : `Giao lại tất cả đề chưa có lượt làm (${unattemptedGroups.length})`}
            </button>
            <label className="ml-auto flex items-center gap-2">
              <input
                type="checkbox"
                checked={onlyUnattempted}
                onChange={(e) => setOnlyUnattempted(e.target.checked)}
              />
              Chỉ hiện đề chưa có lượt làm
            </label>
          </div>

          {visibleGroups.length === 0 ? (
            <p className="text-sm text-slate-500">Mọi đề trong tuần đều đã có lượt làm.</p>
          ) : (
            <ul className="divide-y divide-mist text-sm">
              {visibleGroups.map((g) => {
                const target = g.sourceClassId
                  ? `Lớp ${classNameById.get(g.sourceClassId) ?? g.sourceClassId.slice(0, 8)}`
                  : 'Giao lẻ';
                const noAttempts = g.attemptTotal === 0;
                return (
                  <li key={g.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-ink">
                        {g.examTitle}
                        {noAttempts && (
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                            chưa có lượt làm
                          </span>
                        )}
                      </p>
                      <p className="text-slate-500">
                        {target} · giao {new Date(g.firstAssignedAt).toLocaleString()} ·{' '}
                        {g.attemptedStudents}/{g.activeCount} HS đã làm · {g.attemptTotal} lượt
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={`/exams/${g.examId}/results`}
                        className="text-accentDark hover:underline"
                      >
                        Kết quả
                      </Link>
                      {g.reassignable.length > 0 && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() => void reassign(g.key, g.reassignable)}
                          className="rounded-md border border-accent px-3 py-1.5 text-accentDark hover:bg-accent hover:text-white disabled:opacity-50"
                        >
                          {busyKey === g.key
                            ? 'Đang giao lại…'
                            : `Giao lại ${g.reassignable.length} HS chưa làm`}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
