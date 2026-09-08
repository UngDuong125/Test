'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ApiError, listExams } from '@/lib/api-client';
import type { Exam } from '@/types/content';

function ResultsHubBody() {
  const [items, setItems] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await listExams();
        setItems(res.items.filter((e) => e.status === 'published' || e.status === 'archived'));
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải được đề');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Kết quả & tiến độ</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chọn đề để xem lịch sử làm bài, điểm và các lượt đang làm của học sinh. Có thể mở lịch
          sử từng học sinh từ trang lớp.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        {loading ? (
          <p className="text-sm text-slate-500">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Chưa có đề published.{' '}
            <Link href="/exams" className="text-accentDark hover:underline">
              Tạo / publish đề
            </Link>
          </p>
        ) : (
          <ul className="divide-y divide-mist text-sm">
            {items.map((exam) => (
              <li
                key={exam.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{exam.title}</p>
                  <p className="text-slate-500">
                    {exam.subjectId} · {exam.status} · {exam.totalPoints}đ
                  </p>
                </div>
                <Link
                  href={`/exams/${exam.id}/results`}
                  className="rounded-md bg-accent px-3 py-1.5 text-white hover:bg-accentDark"
                >
                  Xem kết quả
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-sm text-slate-600">
        Tip: vào{' '}
        <Link href="/classes" className="text-accentDark hover:underline">
          Lớp
        </Link>{' '}
        → chọn học sinh → Lịch sử để xem mọi đề của một HS; hoặc{' '}
        <Link href="/assignments" className="text-accentDark hover:underline">
          Giao đề
        </Link>{' '}
        → Lượt làm để xem theo assignment.
      </p>
    </div>
  );
}

export default function ResultsHubPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <ResultsHubBody />
    </AuthGate>
  );
}
