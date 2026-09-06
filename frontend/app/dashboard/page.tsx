'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ApiError, listMyAssignments, listMyClasses } from '@/lib/api-client';
import { displayNameOf, useSession } from '@/lib/auth';
import type { ClassRecord, ExamAssignment } from '@/types/content';

function DashboardBody() {
  const { user } = useSession();
  const [assignments, setAssignments] = useState<ExamAssignment[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [asg, cls] = await Promise.all([listMyAssignments(), listMyClasses()]);
        setAssignments(asg.items);
        setClasses(cls.items);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải assignment');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

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
            <Link href="/question-banks" className="text-accentDark hover:underline">
              Ngân hàng →
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
          <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
            <p className="font-semibold text-ink">Bài được giao</p>
            {loading ? (
              <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
            ) : assignments.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">
                Chưa có assignment. Teacher giao đề qua trang /assignments.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-mist text-sm">
                {assignments.map((a) => (
                  <li key={a.id} className="py-3">
                    <p className="font-medium text-ink">{a.examTitle ?? 'Đề'}</p>
                    <p className="text-slate-500">
                      {a.status} · hạn {new Date(a.deadline).toLocaleString()} · tối đa{' '}
                      {a.attemptLimit} lần
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Làm bài (attempt) sẽ có ở bước tiếp theo của lộ trình.
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-xl border border-mist bg-white p-6 shadow-sm">
            <p className="font-semibold text-ink">Lớp của tôi</p>
            {classes.length === 0 ? (
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
