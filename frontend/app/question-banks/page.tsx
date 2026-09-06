'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import {
  ApiError,
  addQuestionsToBank,
  createQuestionBank,
  listBankQuestions,
  listQuestionBanks,
  listQuestions,
} from '@/lib/api-client';
import type { Question, QuestionBank } from '@/types/content';
import type { TagKey } from '@/types/auth';

function BanksBody() {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selected, setSelected] = useState<QuestionBank | null>(null);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [published, setPublished] = useState<Question[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    name: '',
    description: '',
    subjectId: 'math' as TagKey,
    grade: 7,
  });

  async function refreshBanks() {
    setLoading(true);
    setError(null);
    try {
      const res = await listQuestionBanks();
      setBanks(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được bank');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBanks();
  }, []);

  async function openBank(bank: QuestionBank) {
    setSelected(bank);
    setError(null);
    try {
      const [bq, pub] = await Promise.all([
        listBankQuestions(bank.id),
        listQuestions({ subjectId: bank.subjectId, grade: bank.grade, status: 'published' }),
      ]);
      setBankQuestions(bq.items);
      const inBank = new Set(bq.items.map((q) => q.id));
      setPublished(pub.items.filter((q) => !inBank.has(q.id)));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải câu trong bank');
    }
  }

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createQuestionBank(form);
      setForm((f) => ({ ...f, name: '', description: '' }));
      await refreshBanks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo bank thất bại');
    }
  }

  async function addToBank(questionId: string) {
    if (!selected) return;
    setError(null);
    try {
      await addQuestionsToBank(selected.id, [questionId]);
      await openBank(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thêm câu thất bại');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Ngân hàng câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Gom câu theo môn/lớp để chọn thủ công hoặc random khi tạo đề.
          </p>
        </div>
        <Link href="/questions" className="text-sm text-accentDark hover:underline">
          ← Câu hỏi
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={onCreate}
        className="grid gap-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm sm:grid-cols-2"
      >
        <h2 className="sm:col-span-2 font-semibold text-ink">Tạo bank</h2>
        <label className="sm:col-span-2 text-sm">
          Tên
          <input
            required
            className="mt-1 w-full rounded-md border border-mist px-3 py-2"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
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
        <div className="sm:col-span-2">
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
          >
            Tạo
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <ul className="space-y-2">
            {banks.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => void openBank(b)}
                  className={`w-full rounded-xl border px-4 py-3 text-left ${
                    selected?.id === b.id
                      ? 'border-accent bg-teal-50'
                      : 'border-mist bg-white/90 hover:border-accent'
                  }`}
                >
                  <p className="font-medium text-ink">{b.name}</p>
                  <p className="text-xs text-slate-500">
                    {b.subjectId} · lớp {b.grade}
                  </p>
                </button>
              </li>
            ))}
            {!banks.length && <p className="text-slate-500">Chưa có bank.</p>}
          </ul>

          {selected && (
            <div className="space-y-4 rounded-xl border border-mist bg-white/90 p-4">
              <h2 className="font-semibold text-ink">{selected.name}</h2>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Trong bank ({bankQuestions.length})
                </p>
                <ul className="mt-2 space-y-1 text-sm">
                  {bankQuestions.map((q) => (
                    <li key={q.id} className="text-slate-700">
                      [{q.status}] {q.type} · {q.difficulty}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  Thêm câu published cùng môn/lớp
                </p>
                <ul className="mt-2 space-y-2">
                  {published.map((q) => (
                    <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-slate-700">
                        {q.difficulty} · {q.points}đ
                      </span>
                      <button
                        type="button"
                        onClick={() => void addToBank(q.id)}
                        className="shrink-0 rounded-md border border-mist px-2 py-1 hover:border-accent"
                      >
                        Thêm
                      </button>
                    </li>
                  ))}
                  {!published.length && (
                    <p className="text-slate-500">Không còn câu published để thêm.</p>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuestionBanksPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <BanksBody />
    </AuthGate>
  );
}
