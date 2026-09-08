'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptListTable } from '@/components/attempts/AttemptListTable';
import {
  ApiError,
  listExams,
  listStudentResults,
} from '@/lib/api-client';
import type { Attempt } from '@/types/content';

function StudentResultsBody() {
  const params = useParams();
  const studentId = String(params.id ?? '');

  const [items, setItems] = useState<Attempt[]>([]);
  const [examTitleById, setExamTitleById] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [results, exams] = await Promise.all([
          listStudentResults(studentId),
          listExams().catch(() => ({ items: [] as { id: string; title: string }[] })),
        ]);
        if (cancelled) return;
        setItems(results.items);
        const titles: Record<string, string> = {};
        for (const e of exams.items) {
          titles[e.id] = e.title;
        }
        setExamTitleById(titles);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải được lịch sử');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const grouped = useMemo(() => {
    const byExam = new Map<string, Attempt[]>();
    for (const a of items) {
      const list = byExam.get(a.examId) ?? [];
      list.push(a);
      byExam.set(a.examId, list);
    }
    return [...byExam.entries()];
  }, [items]);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/classes" className="hover:text-accentDark">
            Lớp
          </Link>
          {' / '}
          Lịch sử học sinh
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">Lịch sử làm bài</h1>
        <p className="mt-1 text-sm text-slate-600">
          Các lượt đã nộp / chấm của học sinh (không gồm đang làm hoặc đã hủy).
        </p>
        <p className="mt-1 font-mono text-xs text-slate-400">{studentId}</p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-slate-500">Chưa có kết quả.</p>
      ) : (
        grouped.map(([examId, attempts]) => (
          <section
            key={examId}
            className="rounded-xl border border-mist bg-white p-6 shadow-sm"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-ink">
                {examTitleById[examId] ?? `Đề ${examId.slice(0, 8)}…`}
              </h2>
              <Link
                href={`/exams/${examId}/results`}
                className="text-sm text-accentDark hover:underline"
              >
                Tất cả trên đề →
              </Link>
            </div>
            <AttemptListTable items={attempts} showUserId={false} showExamId={false} />
          </section>
        ))
      )}
    </div>
  );
}

export default function StudentResultsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <StudentResultsBody />
    </AuthGate>
  );
}
