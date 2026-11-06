'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ApiError, listGradingQueue } from '@/lib/api-client';
import type { Attempt } from '@/types/content';

function GradingQueueBody() {
  const [items, setItems] = useState<Array<Attempt & { examTitle?: string; subjectId?: string }>>(
    [],
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const data = await listGradingQueue({ limit: 100 });
        setItems(data.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải queue');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Exams with several waiting attempts are faster to grade question by question.
  const byExam = useMemo(() => {
    const map = new Map<string, { title: string; count: number; oldest: string | null }>();
    for (const a of items) {
      const cur = map.get(a.examId) ?? { title: a.examTitle ?? 'Đề', count: 0, oldest: a.submittedAt };
      cur.count += 1;
      if (a.submittedAt && (!cur.oldest || a.submittedAt < cur.oldest)) cur.oldest = a.submittedAt;
      map.set(a.examId, cur);
    }
    return [...map.entries()].sort((x, y) => (x[1].oldest ?? '').localeCompare(y[1].oldest ?? ''));
  }, [items]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">
          Chấm bài{!loading && items.length > 0 && ` (${items.length} bài chờ)`}
        </h1>
        <p className="mt-2 text-slate-600">
          Bài chờ chấm thủ công, bài nộp sớm nhất ở trên cùng.
        </p>
      </div>

      {byExam.length > 0 && (
        <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
          <p className="font-semibold text-ink">Theo đề</p>
          <ul className="mt-2 divide-y divide-mist text-sm">
            {byExam.map(([examId, g]) => (
              <li key={examId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span>
                  {g.title} · <strong>{g.count}</strong> bài chờ
                </span>
                <Link
                  href={`/grading/by-question?examId=${examId}`}
                  className="rounded-md border border-accent px-3 py-1.5 text-accentDark hover:bg-accent hover:text-white"
                >
                  Chấm theo câu
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">Không có bài nào cần chấm.</p>
        ) : (
          <ul className="divide-y divide-mist text-sm">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-ink">{a.examTitle ?? 'Đề'}</p>
                  <p className="text-slate-500">
                    {a.subjectId} · nộp{' '}
                    {a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '—'} · điểm tạm{' '}
                    {a.score ?? 0}/{a.maxScore}
                  </p>
                </div>
                <Link
                  href={`/grading/${a.id}`}
                  className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
                >
                  Chấm
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function GradingPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <GradingQueueBody />
    </AuthGate>
  );
}
