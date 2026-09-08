'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { StatsPanel } from '@/components/analytics/StatsPanel';
import {
  ApiError,
  getExam,
  getExamAnalytics,
  listExamAssignments,
  listExamResults,
} from '@/lib/api-client';
import { attemptStatusLabel, formatAttemptScore } from '@/lib/attempt-labels';
import type { Attempt, Exam } from '@/types/content';

function ExamResultsBody() {
  const params = useParams();
  const examId = String(params.id ?? '');

  const [exam, setExam] = useState<Exam | null>(null);
  const [items, setItems] = useState<Attempt[]>([]);
  const [total, setTotal] = useState(0);
  const [nameByUser, setNameByUser] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<'all' | 'in_progress' | 'done'>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<{
    attemptCount: number;
    gradedCount: number;
    needsGradingCount: number;
    averageScore: number | null;
    averagePercentage: number | null;
    completionRate: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [examDetail, results, asg, stats] = await Promise.all([
          getExam(examId),
          listExamResults(examId),
          listExamAssignments({ examId }),
          getExamAnalytics(examId).catch(() => null),
        ]);
        if (cancelled) return;
        setExam(examDetail.exam);
        setItems(results.items);
        setTotal(results.total);
        setAnalytics(stats);
        const names: Record<string, string> = {};
        for (const a of asg.items) {
          names[a.targetId] = a.targetUsername || a.targetEmail || a.targetId.slice(0, 8);
        }
        setNameByUser(names);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải được kết quả');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  const filtered = useMemo(() => {
    if (filter === 'in_progress') {
      return items.filter((a) => a.status === 'in_progress');
    }
    if (filter === 'done') {
      return items.filter((a) => a.status !== 'in_progress' && a.status !== 'cancelled');
    }
    return items;
  }, [items, filter]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/exams" className="hover:text-accentDark">
            Đề
          </Link>
          {' / '}
          <Link href={`/exams/${examId}/edit`} className="hover:text-accentDark">
            Sửa
          </Link>
          {' / '}
          Kết quả
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          {exam?.title ?? 'Kết quả đề'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Lịch sử và tiến độ làm bài của học sinh trên đề này ({total} lượt).
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {analytics && (
        <StatsPanel
          title="Tóm tắt"
          items={[
            { label: 'Lượt làm', value: analytics.attemptCount },
            { label: 'Đã chấm', value: analytics.gradedCount },
            { label: 'Chờ chấm', value: analytics.needsGradingCount },
            { label: 'Điểm TB', value: analytics.averageScore },
            {
              label: '% TB',
              value:
                analytics.averagePercentage != null
                  ? `${analytics.averagePercentage}%`
                  : null,
            },
            {
              label: 'Hoàn thành',
              value:
                analytics.completionRate != null
                  ? `${Math.round(analytics.completionRate * 100)}%`
                  : null,
            },
          ]}
        />
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ['all', 'Tất cả'],
            ['in_progress', 'Đang làm'],
            ['done', 'Đã nộp / chấm'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 ${
              filter === key
                ? 'bg-accent text-white'
                : 'border border-mist hover:border-accent'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-slate-500">Không có lượt nào trong bộ lọc này.</p>
        ) : (
          <ul className="divide-y divide-mist text-sm">
            {filtered.map((a) => {
              const isLive = a.status === 'in_progress';
              const studentLabel = nameByUser[a.userId] ?? `${a.userId.slice(0, 8)}…`;
              return (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-ink">
                      {studentLabel}
                      {isLive && (
                        <span className="ml-2 text-xs font-normal text-amber-700">đang làm</span>
                      )}
                    </p>
                    <p className="text-slate-500">
                      {attemptStatusLabel(a.status)} · bắt đầu{' '}
                      {new Date(a.startedAt).toLocaleString()}
                      {a.submittedAt && <> · nộp {new Date(a.submittedAt).toLocaleString()}</>}
                      {' · '}
                      {formatAttemptScore(a.score, a.maxScore, a.percentage)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/students/${a.userId}/results`}
                      className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
                    >
                      Lịch sử HS
                    </Link>
                    {a.status === 'needs_grading' && (
                      <Link
                        href={`/grading/${a.id}`}
                        className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
                      >
                        Chấm
                      </Link>
                    )}
                    <Link
                      href={`/results/${a.id}`}
                      className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
                    >
                      {isLive ? 'Xem tiến độ' : 'Chi tiết'}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function ExamResultsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <ExamResultsBody />
    </AuthGate>
  );
}
