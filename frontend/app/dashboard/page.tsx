'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  ApiError,
  getMyExp,
  getMyStats,
  listMyAssignments,
  listMyClasses,
  startAttempt,
} from '@/lib/api-client';
import { rememberAttemptDetail } from '@/lib/attempt-handoff';
import { assignmentStatusLabel } from '@/lib/attempt-labels';
import { displayNameOf, useSession } from '@/lib/auth';
import type { ClassRecord, ExamAssignment } from '@/types/content';
import { StatsPanel } from '@/components/analytics/StatsPanel';
import { SUBJECT_TAGS } from '@/constants/tags';

function AssignmentRow({ assignment }: { assignment: ExamAssignment }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = assignment.remainingAttempts ?? 0;
  const inProgressId = assignment.inProgressAttemptId ?? null;
  const latestDone = assignment.latestFinishedAttempt ?? null;
  const canStart =
    !inProgressId &&
    remaining > 0 &&
    (assignment.status === 'available' || assignment.status === 'in_progress');

  async function onStart() {
    setBusy(true);
    setError(null);
    try {
      const receivedAt = Date.now();
      const detail = await startAttempt(assignment.id);
      rememberAttemptDetail(detail, receivedAt);
      router.push(`/attempts/${detail.attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không bắt đầu được');
      setBusy(false);
    }
  }

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-ink">{assignment.examTitle ?? 'Đề'}</p>
          <p className="text-slate-500">
            {assignmentStatusLabel(assignment.status)} · hạn{' '}
            {new Date(assignment.deadline).toLocaleString()} · tối đa {assignment.attemptLimit} lần
            {` · còn ${remaining} lượt`}
          </p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {inProgressId && (
            <Link
              href={`/attempts/${inProgressId}`}
              className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
            >
              Tiếp tục
            </Link>
          )}
          {canStart && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onStart()}
              className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark disabled:opacity-60"
            >
              {busy ? 'Đang mở…' : 'Bắt đầu làm bài'}
            </button>
          )}
          {latestDone && (
            <Link
              href={`/results/${latestDone.id}`}
              className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
            >
              Xem kết quả
            </Link>
          )}
        </div>
      </div>
    </li>
  );
}

function DashboardBody() {
  const { user } = useSession();
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [classesLoaded, setClassesLoaded] = useState(false);
  const [myStats, setMyStats] = useState<{
    attemptCount: number;
    gradedCount: number;
    averagePercentage: number | null;
    expTotal: number;
  } | null>(null);
  const [myExp, setMyExp] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'student') {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listMyAssignments()
      .then((asg) => {
        if (!cancelled) setAssignments(asg.items);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải assignment');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== 'student' || loading) return;
    let cancelled = false;
    void listMyClasses()
      .then((cls) => {
        if (!cancelled) setClasses(cls.items);
      })
      .catch(() => {
        if (!cancelled) setClasses([]);
      })
      .finally(() => {
        if (!cancelled) setClassesLoaded(true);
      });
    void getMyStats()
      .then((stats) => {
        if (cancelled) return;
        setMyStats({
          attemptCount: stats.attemptCount,
          gradedCount: stats.gradedCount,
          averagePercentage: stats.averagePercentage,
          expTotal: stats.expTotal,
        });
      })
      .catch(() => {});
    void getMyExp()
      .then((exp) => {
        if (!cancelled) setMyExp(exp.subjectExp);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, loading]);

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          Xin chào {displayNameOf(user)} ({user.role}).
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {(user.role === 'admin' || user.role === 'teacher') && (
        <div className="rounded-xl border border-mist bg-white p-6 text-sm text-slate-700 shadow-sm">
          <p className="font-semibold text-ink">Công cụ giáo viên</p>
          <div className="mt-4 flex flex-wrap gap-4">
            <Link href="/questions" className="text-accentDark hover:underline">
              Câu hỏi →
            </Link>
            <Link href="/topics" className="text-accentDark hover:underline">
              Chủ đề →
            </Link>
            <Link href="/vocabulary" className="text-accentDark hover:underline">
              Từ vựng SRS →
            </Link>
            <Link href="/exams" className="text-accentDark hover:underline">
              Đề thi →
            </Link>
            <Link href="/classes" className="text-accentDark hover:underline">
              Lớp →
            </Link>
            <Link href="/assignments" className="text-accentDark hover:underline">
              Giao đề →
            </Link>
            <Link href="/grading" className="text-accentDark hover:underline">
              Chấm bài →
            </Link>
            <Link href="/results" className="text-accentDark hover:underline">
              Kết quả HS →
            </Link>
          </div>
          {user.role === 'admin' && (
            <p className="mt-4">
              <Link href="/admin/users" className="text-accentDark hover:underline">
                Quản lý người dùng →
              </Link>
            </p>
          )}
        </div>
      )}

      {user.role === 'student' && (
        <>
          {(myStats || myExp) && (
            <StatsPanel
              title="Tiến trình của tôi"
              items={[
                { label: 'Lượt làm', value: myStats?.attemptCount },
                { label: 'Đã chấm', value: myStats?.gradedCount },
                {
                  label: '% TB',
                  value:
                    myStats?.averagePercentage != null
                      ? `${myStats.averagePercentage}%`
                      : null,
                },
                { label: 'Tổng EXP', value: myStats?.expTotal ?? null },
                ...SUBJECT_TAGS.filter((s) => (myExp?.[s.key] ?? 0) > 0).map((s) => ({
                  label: s.label,
                  value: myExp?.[s.key] ?? 0,
                })),
              ]}
            />
          )}

          <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">Ôn từ vựng</p>
              <Link href="/vocabulary/review" className="text-sm text-accentDark hover:underline">
                Vào ôn →
              </Link>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              Flashcard theo lịch lặp lại ngắt quãng (1 → 3 → 7 → 14 → 30 ngày).
            </p>
          </section>

          <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="font-semibold text-ink">Bài được giao</p>
              <Link href="/leaderboard" className="text-sm text-accentDark hover:underline">
                Bảng xếp hạng →
              </Link>
            </div>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
            ) : assignments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Chưa có assignment. Teacher giao đề qua trang /assignments.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-mist text-sm">
                {assignments.map((a) => (
                  <AssignmentRow key={a.id} assignment={a} />
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
            <p className="font-semibold text-ink">Lớp của tôi</p>
            {!classesLoaded ? (
              <p className="mt-2 text-sm text-slate-500">Đang tải lớp…</p>
            ) : classes.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Chưa thuộc lớp nào.</p>
            ) : (
              <ul className="mt-2 text-sm text-slate-700">
                {classes.map((c) => (
                  <li key={c.id}>
                    {c.name} (khối {c.grade})
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <AuthGate>
      <DashboardBody />
    </AuthGate>
  );
}
