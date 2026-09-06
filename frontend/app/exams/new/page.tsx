'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, createExam } from '@/lib/api-client';
import type { TagKey } from '@/types/auth';
import type { ExamType } from '@/types/content';

function NewExamBody() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    title: '',
    subjectId: 'math' as TagKey,
    grade: 7,
    type: 'practice' as ExamType,
    duration: 45,
    totalPoints: 0,
    instructions: '',
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const { exam } = await createExam({
        ...form,
        description: '',
        difficulty: 'medium',
        settings: {
          shuffleQuestions: false,
          shuffleOptions: true,
          showResult: true,
          showExplanation: true,
        },
      });
      router.replace(`/exams/${exam.id}/edit`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo đề thất bại');
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Tạo đề nháp</h1>
          <p className="mt-1 text-sm text-slate-600">
            Sau khi tạo, mở trình soạn đề để thêm câu từ ngân hàng hoặc tạo câu mới.
          </p>
        </div>
        <Link href="/exams" className="text-sm text-accentDark hover:underline">
          ← Danh sách
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={onSubmit}
        className="grid gap-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm"
      >
        <label className="text-sm">
          Tên đề
          <input
            required
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Môn
            <select
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.subjectId}
              onChange={(e) => setForm({ ...form, subjectId: e.target.value as TagKey })}
            >
              {SUBJECT_TAGS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Lớp
            <input
              type="number"
              min={6}
              max={9}
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.grade}
              onChange={(e) => setForm({ ...form, grade: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">
            Loại
            <select
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as ExamType })}
            >
              {['practice', 'quiz', 'homework', 'worksheet', 'midterm', 'final'].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Thời lượng (phút)
            <input
              type="number"
              min={1}
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={form.duration}
              onChange={(e) => setForm({ ...form, duration: Number(e.target.value) })}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-60"
        >
          {busy ? 'Đang tạo…' : 'Tạo đề & mở composer'}
        </button>
      </form>
    </div>
  );
}

export default function NewExamPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <NewExamBody />
    </AuthGate>
  );
}
