'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptListTable } from '@/components/attempts/AttemptListTable';
import { ApiError, getAssignment, listAssignmentAttempts } from '@/lib/api-client';
import type { Attempt, ExamAssignment } from '@/types/content';

function AssignmentAttemptsBody() {
  const params = useParams();
  const assignmentId = String(params.id ?? '');

  const [assignment, setAssignment] = useState<ExamAssignment | null>(null);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [remaining, setRemaining] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [summary, asg] = await Promise.all([
          listAssignmentAttempts(assignmentId),
          getAssignment(assignmentId),
        ]);
        if (cancelled) return;
        setAttempts(summary.attempts);
        setRemaining(summary.remaining);
        setAssignment(asg.assignment);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải được attempt');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assignmentId]);

  const studentLabel =
    assignment?.targetUsername ||
    assignment?.targetEmail ||
    assignment?.targetId?.slice(0, 8) ||
    'Học sinh';

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/assignments" className="hover:text-accentDark">
            Giao đề
          </Link>
          {' / '}
          Lượt làm
        </p>
        <h1 className="mt-1 font-display text-3xl font-bold text-ink">
          {assignment?.examTitle ?? 'Assignment'}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {studentLabel} · còn {remaining} lượt · trạng thái assignment:{' '}
          {assignment?.status ?? '—'}
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
        ) : (
          <AttemptListTable items={attempts} showUserId={false} />
        )}
      </section>

      {assignment && (
        <p className="text-sm">
          <Link
            href={`/exams/${assignment.examId}/results`}
            className="text-accentDark hover:underline"
          >
            Xem mọi kết quả trên đề →
          </Link>
          {' · '}
          <Link
            href={`/students/${assignment.targetId}/results`}
            className="text-accentDark hover:underline"
          >
            Lịch sử học sinh →
          </Link>
        </p>
      )}
    </div>
  );
}

export default function AssignmentAttemptsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <AssignmentAttemptsBody />
    </AuthGate>
  );
}
