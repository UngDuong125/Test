'use client';

import { FormEvent, Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  ApiError,
  assignExam,
  cancelAssignment,
  listClasses,
  listExamAssignments,
  listExams,
} from '@/lib/api-client';
import type { ClassRecord, Exam, ExamAssignment } from '@/types/content';

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

function AssignmentsBody() {
  const searchParams = useSearchParams();
  const presetClassId = searchParams.get('classId') ?? '';

  const [exams, setExams] = useState<Exam[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [items, setItems] = useState<ExamAssignment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [form, setForm] = useState({
    examId: '',
    targetType: 'class' as 'user' | 'class',
    targetId: presetClassId,
    availableFrom: toLocalInputValue(now),
    deadline: toLocalInputValue(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)),
    attemptLimit: 1,
  });

  async function refreshList(examId?: string) {
    const id = examId || form.examId;
    if (!id) {
      const all = await listExamAssignments();
      setItems(all.items);
      return;
    }
    const res = await listExamAssignments({ examId: id });
    setItems(res.items);
  }

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [examRes, classRes] = await Promise.all([
          listExams({ status: 'published' }),
          listClasses(),
        ]);
        setExams(examRes.items);
        setClasses(classRes.items);
        const firstExam = examRes.items[0]?.id ?? '';
        const firstClass = presetClassId || classRes.items[0]?.id || '';
        setForm((f) => ({
          ...f,
          examId: f.examId || firstExam,
          targetId: f.targetId || firstClass,
        }));
        if (firstExam) {
          const asg = await listExamAssignments({ examId: firstExam });
          setItems(asg.items);
        } else {
          const asg = await listExamAssignments();
          setItems(asg.items);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải được dữ liệu');
      } finally {
        setLoading(false);
      }
    })();
  }, [presetClassId]);

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setWarnings([]);
    try {
      const res = await assignExam(form.examId, {
        targetType: form.targetType,
        targetId: form.targetId,
        availableFrom: toIsoFromLocal(form.availableFrom),
        deadline: toIsoFromLocal(form.deadline),
        attemptLimit: form.attemptLimit,
      });
      setWarnings(res.warnings);
      await refreshList(form.examId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giao đề thất bại');
    }
  }

  async function onCancel(id: string) {
    setError(null);
    try {
      await cancelAssignment(id);
      await refreshList();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hủy thất bại');
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Giao đề</h1>
        <p className="mt-2 text-slate-600">
          Chỉ exam đã published. Giao lớp sẽ expand thành assignment từng học sinh.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {warnings.length > 0 && (
        <ul className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <form onSubmit={onAssign} className="space-y-3 rounded-xl border border-mist bg-white p-4">
        <label className="block text-sm font-medium text-slate-700">
          Đề (published)
          <select
            className="mt-1 w-full rounded-md border border-mist px-3 py-2 text-sm"
            value={form.examId}
            onChange={(e) => {
              const examId = e.target.value;
              setForm((f) => ({ ...f, examId }));
              void refreshList(examId);
            }}
            required
          >
            <option value="">— chọn —</option>
            {exams.map((ex) => (
              <option key={ex.id} value={ex.id}>
                {ex.title} ({ex.subjectId} · khối {ex.grade})
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.targetType === 'class'}
              onChange={() => setForm((f) => ({ ...f, targetType: 'class' }))}
            />
            Lớp
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={form.targetType === 'user'}
              onChange={() => setForm((f) => ({ ...f, targetType: 'user' }))}
            />
            Học sinh (UUID)
          </label>
        </div>

        {form.targetType === 'class' ? (
          <select
            className="w-full rounded-md border border-mist px-3 py-2 text-sm"
            value={form.targetId}
            onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
            required
          >
            <option value="">— chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.memberCount ?? 0} HS)
              </option>
            ))}
          </select>
        ) : (
          <input
            className="w-full rounded-md border border-mist px-3 py-2 text-sm"
            placeholder="UUID học sinh (seed student1: …0003)"
            value={form.targetId}
            onChange={(e) => setForm((f) => ({ ...f, targetId: e.target.value }))}
            required
          />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Mở từ
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.availableFrom}
              onChange={(e) => setForm((f) => ({ ...f, availableFrom: e.target.value }))}
              required
            />
          </label>
          <label className="text-sm">
            Deadline
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.deadline}
              onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
              required
            />
          </label>
        </div>

        <label className="block text-sm">
          Số lần làm
          <input
            type="number"
            min={1}
            max={50}
            className="mt-1 w-32 rounded-md border border-mist px-3 py-2"
            value={form.attemptLimit}
            onChange={(e) => setForm((f) => ({ ...f, attemptLimit: Number(e.target.value) }))}
            required
          />
        </label>

        <button
          type="submit"
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accentDark"
          disabled={!form.examId}
        >
          Giao đề
        </button>
        {exams.length === 0 && (
          <p className="text-sm text-slate-500">
            Chưa có đề published — publish trên trang Đề trước.
          </p>
        )}
      </form>

      <section className="rounded-xl border border-mist bg-white p-4">
        <p className="font-semibold text-ink">Assignment</p>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
        ) : items.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Chưa có assignment.</p>
        ) : (
          <ul className="mt-3 divide-y divide-mist text-sm">
            {items.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <p className="font-medium text-ink">{a.examTitle ?? a.examId}</p>
                  <p className="text-slate-500">
                    {a.targetUsername || a.targetEmail || a.targetId} · {a.status} · limit{' '}
                    {a.attemptLimit}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(a.availableFrom).toLocaleString()} →{' '}
                    {new Date(a.deadline).toLocaleString()}
                  </p>
                </div>
                {a.status !== 'cancelled' && (
                  <button
                    type="button"
                    onClick={() => void onCancel(a.id)}
                    className="text-red-600 hover:underline"
                  >
                    Hủy
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default function AssignmentsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-slate-500">
            Đang tải…
          </div>
        }
      >
        <AssignmentsBody />
      </Suspense>
    </AuthGate>
  );
}
