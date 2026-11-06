'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptListTable } from '@/components/attempts/AttemptListTable';
import {
  ApiError,
  getAssignment,
  listAssignmentAttempts,
  updateAssignment,
} from '@/lib/api-client';
import { assignmentStatusLabel } from '@/lib/attempt-labels';
import type { Attempt, ExamAssignment } from '@/types/content';

function toLocalInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Per-student exception: move the deadline or add attempts without cancelling. */
function ExtendAssignmentForm({
  assignment,
  usedAttempts,
  onSaved,
}: {
  assignment: ExamAssignment;
  usedAttempts: number;
  onSaved: (a: ExamAssignment) => void;
}) {
  const [deadline, setDeadline] = useState(() => toLocalInputValue(assignment.deadline));
  const [attemptLimit, setAttemptLimit] = useState(assignment.attemptLimit);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  if (assignment.status === 'cancelled') return null;

  async function onSave() {
    const next = new Date(deadline);
    if (Number.isNaN(next.getTime())) {
      setMessage({ ok: false, text: 'Deadline không hợp lệ' });
      return;
    }
    const body: { deadline?: string; attemptLimit?: number } = {};
    if (next.toISOString() !== new Date(assignment.deadline).toISOString()) {
      if (next <= new Date()) {
        setMessage({ ok: false, text: 'Deadline mới phải ở tương lai' });
        return;
      }
      body.deadline = next.toISOString();
    }
    if (attemptLimit !== assignment.attemptLimit) body.attemptLimit = attemptLimit;
    if (Object.keys(body).length === 0) {
      setMessage({ ok: false, text: 'Chưa có thay đổi' });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await updateAssignment(assignment.id, body);
      onSaved(res.assignment);
      setMessage({ ok: true, text: 'Đã cập nhật hạn / số lượt cho học sinh này.' });
    } catch (err) {
      setMessage({ ok: false, text: err instanceof ApiError ? err.message : 'Cập nhật thất bại' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-mist bg-white p-6 shadow-sm">
      <p className="font-semibold text-ink">Gia hạn / thêm lượt cho học sinh này</p>
      <p className="text-xs text-slate-500">
        Không cần hủy và giao lại. Chỉ ảnh hưởng assignment này; số lượt không thể nhỏ hơn số lượt đã
        dùng ({usedAttempts}).
      </p>
      <div className="flex flex-wrap items-end gap-3 text-sm">
        <label>
          Deadline
          <input
            type="datetime-local"
            className="mt-1 block rounded-md border border-mist px-3 py-1.5"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        <label>
          Số lượt tối đa
          <input
            type="number"
            min={Math.max(1, usedAttempts)}
            max={50}
            className="mt-1 block w-24 rounded-md border border-mist px-3 py-1.5"
            value={attemptLimit}
            onChange={(e) => setAttemptLimit(Number(e.target.value))}
          />
        </label>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSave()}
          className="rounded-md bg-accent px-3 py-2 font-semibold text-white hover:bg-accentDark disabled:opacity-50"
        >
          {busy ? 'Đang lưu…' : 'Lưu thay đổi'}
        </button>
      </div>
      {message && (
        <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}

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
          {studentLabel} · còn {remaining} lượt · hạn{' '}
          {assignment ? new Date(assignment.deadline).toLocaleString() : '—'} · trạng thái:{' '}
          {assignment ? assignmentStatusLabel(assignment.status) : '—'}
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

      {assignment && !loading && (
        <ExtendAssignmentForm
          key={`${assignment.id}:${assignment.deadline}:${assignment.attemptLimit}`}
          assignment={assignment}
          usedAttempts={attempts.filter((a) => a.status !== 'cancelled').length}
          onSaved={(updated) => {
            setAssignment((prev) => (prev ? { ...prev, ...updated } : updated));
            setRemaining(
              Math.max(
                0,
                updated.attemptLimit - attempts.filter((a) => a.status !== 'cancelled').length,
              ),
            );
          }}
        />
      )}

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
