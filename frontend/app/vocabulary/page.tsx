'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import {
  ApiError,
  assignVocabularyBank,
  cancelVocabularyAssignment,
  createVocabularyBank,
  createVocabularyEntry,
  listClasses,
  listVocabularyAssignments,
  listVocabularyBankEntries,
  listVocabularyBanks,
  updateVocabularyEntry,
} from '@/lib/api-client';
import type {
  ClassRecord,
  VocabularyAssignment,
  VocabularyBank,
  VocabularyEntry,
} from '@/types/content';
import type { TagKey } from '@/types/auth';

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

function VocabularyBanksBody() {
  const [banks, setBanks] = useState<VocabularyBank[]>([]);
  const [selected, setSelected] = useState<VocabularyBank | null>(null);
  const [entries, setEntries] = useState<VocabularyEntry[]>([]);
  const [assignments, setAssignments] = useState<VocabularyAssignment[]>([]);
  const [classes, setClasses] = useState<ClassRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const now = useMemo(() => new Date(), []);
  const [bankForm, setBankForm] = useState({
    name: '',
    description: '',
    subjectId: 'flang' as TagKey,
    grade: 7,
  });
  const [entryForm, setEntryForm] = useState({
    term: '',
    reading: '',
    definition: '',
    example: '',
    status: 'published' as 'draft' | 'published',
  });
  const [assignForm, setAssignForm] = useState({
    targetType: 'class' as 'user' | 'class',
    targetId: '',
    availableFrom: toLocalInputValue(now),
    deadline: '',
  });

  async function refreshBanks() {
    setLoading(true);
    setError(null);
    try {
      const [bankRes, classRes] = await Promise.all([listVocabularyBanks(), listClasses()]);
      setBanks(bankRes.items);
      setClasses(classRes.items);
      if (!assignForm.targetId && classRes.items[0]) {
        setAssignForm((f) => ({ ...f, targetId: classRes.items[0]!.id }));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được bank');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refreshBanks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function openBank(bank: VocabularyBank) {
    setSelected(bank);
    setError(null);
    setWarnings([]);
    try {
      const [entryRes, asgRes] = await Promise.all([
        listVocabularyBankEntries(bank.id),
        listVocabularyAssignments({ bankId: bank.id }),
      ]);
      setEntries(entryRes.items);
      setAssignments(asgRes.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải nội dung bank');
    }
  }

  async function onCreateBank(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createVocabularyBank(bankForm);
      setBankForm((f) => ({ ...f, name: '', description: '' }));
      await refreshBanks();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo bank thất bại');
    }
  }

  async function onCreateEntry(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    try {
      await createVocabularyEntry({
        subjectId: selected.subjectId,
        grade: selected.grade,
        term: entryForm.term,
        reading: entryForm.reading || null,
        definition: entryForm.definition,
        example: entryForm.example || null,
        status: entryForm.status,
        bankId: selected.id,
      });
      setEntryForm({ term: '', reading: '', definition: '', example: '', status: 'published' });
      await openBank(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo từ thất bại');
    }
  }

  async function publishEntry(entry: VocabularyEntry) {
    if (!selected) return;
    setError(null);
    try {
      await updateVocabularyEntry(entry.id, { status: 'published' });
      await openBank(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish thất bại');
    }
  }

  async function onAssign(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(null);
    setWarnings([]);
    try {
      const res = await assignVocabularyBank(selected.id, {
        targetType: assignForm.targetType,
        targetId: assignForm.targetId,
        availableFrom: toIsoFromLocal(assignForm.availableFrom),
        deadline: assignForm.deadline ? toIsoFromLocal(assignForm.deadline) : null,
      });
      setWarnings(res.warnings);
      await openBank(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Giao bộ từ thất bại');
    }
  }

  async function onCancel(id: string) {
    if (!selected) return;
    setError(null);
    try {
      await cancelVocabularyAssignment(id);
      await openBank(selected);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Hủy thất bại');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Từ vựng (SRS)</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tạo bộ từ, publish, rồi giao cho học sinh / lớp. Học sinh ôn flashcard theo mốc 1–30
            ngày.
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-accentDark hover:underline">
          ← Dashboard
        </Link>
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

      <form onSubmit={onCreateBank} className="space-y-3 rounded-xl border border-mist bg-white p-4">
        <p className="font-medium text-ink">Tạo bộ từ mới</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Tên
            <input
              required
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={bankForm.name}
              onChange={(e) => setBankForm((f) => ({ ...f, name: e.target.value }))}
            />
          </label>
          <label className="block text-sm">
            Môn
            <select
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={bankForm.subjectId}
              onChange={(e) =>
                setBankForm((f) => ({ ...f, subjectId: e.target.value as TagKey }))
              }
            >
              {SUBJECT_TAGS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Khối
            <input
              type="number"
              min={6}
              max={9}
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={bankForm.grade}
              onChange={(e) => setBankForm((f) => ({ ...f, grade: Number(e.target.value) }))}
            />
          </label>
          <label className="block text-sm sm:col-span-2">
            Mô tả
            <input
              className="mt-1 w-full rounded-md border border-mist px-3 py-2"
              value={bankForm.description}
              onChange={(e) => setBankForm((f) => ({ ...f, description: e.target.value }))}
            />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark"
        >
          Tạo bank
        </button>
      </form>

      <section className="rounded-xl border border-mist bg-white p-4">
        <p className="font-medium text-ink">Danh sách bank</p>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Đang tải…</p>
        ) : banks.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">Chưa có bộ từ nào.</p>
        ) : (
          <ul className="mt-3 divide-y divide-mist text-sm">
            {banks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2">
                <button
                  type="button"
                  className={`text-left hover:text-accentDark ${selected?.id === b.id ? 'font-semibold text-accentDark' : ''}`}
                  onClick={() => void openBank(b)}
                >
                  {b.name}{' '}
                  <span className="text-slate-500">
                    · {b.subjectId} · khối {b.grade}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {selected && (
        <>
          <section className="space-y-4 rounded-xl border border-mist bg-white p-4">
            <p className="font-medium text-ink">Từ trong «{selected.name}»</p>
            <form onSubmit={onCreateEntry} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Từ / cụm
                <input
                  required
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={entryForm.term}
                  onChange={(e) => setEntryForm((f) => ({ ...f, term: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                Phiên âm
                <input
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={entryForm.reading}
                  onChange={(e) => setEntryForm((f) => ({ ...f, reading: e.target.value }))}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Nghĩa
                <input
                  required
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={entryForm.definition}
                  onChange={(e) => setEntryForm((f) => ({ ...f, definition: e.target.value }))}
                />
              </label>
              <label className="block text-sm sm:col-span-2">
                Ví dụ
                <input
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={entryForm.example}
                  onChange={(e) => setEntryForm((f) => ({ ...f, example: e.target.value }))}
                />
              </label>
              <label className="block text-sm">
                Trạng thái
                <select
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={entryForm.status}
                  onChange={(e) =>
                    setEntryForm((f) => ({
                      ...f,
                      status: e.target.value as 'draft' | 'published',
                    }))
                  }
                >
                  <option value="published">published</option>
                  <option value="draft">draft</option>
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark"
                >
                  Thêm từ vào bank
                </button>
              </div>
            </form>

            {entries.length === 0 ? (
              <p className="text-sm text-slate-500">Bank trống — thêm ít nhất một từ published.</p>
            ) : (
              <ul className="divide-y divide-mist text-sm">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div>
                      <span className="font-medium text-ink">{entry.term}</span>
                      {entry.reading && (
                        <span className="ml-2 text-slate-500">/{entry.reading}/</span>
                      )}
                      <span className="ml-2 text-slate-600">— {entry.definition}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        {entry.status}
                      </span>
                    </div>
                    {entry.status !== 'published' && (
                      <button
                        type="button"
                        className="text-xs text-accentDark hover:underline"
                        onClick={() => void publishEntry(entry)}
                      >
                        Publish
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-4 rounded-xl border border-mist bg-white p-4">
            <p className="font-medium text-ink">Giao bộ từ</p>
            <form onSubmit={onAssign} className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Đối tượng
                <select
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={assignForm.targetType}
                  onChange={(e) =>
                    setAssignForm((f) => ({
                      ...f,
                      targetType: e.target.value as 'user' | 'class',
                      targetId: e.target.value === 'class' ? classes[0]?.id ?? '' : '',
                    }))
                  }
                >
                  <option value="class">Cả lớp</option>
                  <option value="user">Một học sinh (UUID)</option>
                </select>
              </label>
              {assignForm.targetType === 'class' ? (
                <label className="block text-sm">
                  Lớp
                  <select
                    required
                    className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                    value={assignForm.targetId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, targetId: e.target.value }))}
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (khối {c.grade})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <label className="block text-sm">
                  Student ID
                  <input
                    required
                    className="mt-1 w-full rounded-md border border-mist px-3 py-2 font-mono text-xs"
                    value={assignForm.targetId}
                    onChange={(e) => setAssignForm((f) => ({ ...f, targetId: e.target.value }))}
                  />
                </label>
              )}
              <label className="block text-sm">
                Mở từ
                <input
                  type="datetime-local"
                  required
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={assignForm.availableFrom}
                  onChange={(e) =>
                    setAssignForm((f) => ({ ...f, availableFrom: e.target.value }))
                  }
                />
              </label>
              <label className="block text-sm">
                Deadline (tuỳ chọn)
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border border-mist px-3 py-2"
                  value={assignForm.deadline}
                  onChange={(e) => setAssignForm((f) => ({ ...f, deadline: e.target.value }))}
                />
              </label>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark"
                >
                  Giao bộ từ
                </button>
              </div>
            </form>

            {assignments.length > 0 && (
              <ul className="divide-y divide-mist text-sm">
                {assignments.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      {a.targetUsername ?? a.targetEmail ?? a.targetId} · {a.status}
                      {a.deadline && ` · hạn ${new Date(a.deadline).toLocaleString()}`}
                    </span>
                    {a.status === 'active' && (
                      <button
                        type="button"
                        className="text-xs text-red-600 hover:underline"
                        onClick={() => void onCancel(a.id)}
                      >
                        Hủy
                      </button>
                    )}
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

export default function VocabularyBanksPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <VocabularyBanksBody />
    </AuthGate>
  );
}
