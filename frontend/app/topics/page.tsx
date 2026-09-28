'use client';

import { FormEvent, useState } from 'react';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, createTopic, deleteTopic, updateTopic } from '@/lib/api-client';
import { useSession } from '@/lib/auth';
import { normalizeTopicName, useTopics } from '@/lib/topics';
import type { TagKey } from '@/types/auth';
import type { Topic } from '@/types/content';

const GRADES = [6, 7, 8, 9];

function gradeText(grade: number | null): string {
  return grade == null ? 'Mọi lớp' : `Lớp ${grade}`;
}

function TopicRow({
  topic,
  isAdmin,
  onChanged,
  onError,
}: {
  topic: Topic;
  isAdmin: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  const [grade, setGrade] = useState(topic.grade == null ? '' : String(topic.grade));
  const [busy, setBusy] = useState(false);

  async function onSave() {
    setBusy(true);
    onError(null);
    try {
      await updateTopic(topic.id, {
        name: normalizeTopicName(name),
        grade: grade ? Number(grade) : null,
      });
      setEditing(false);
      await onChanged();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Cập nhật thất bại');
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Xóa chủ đề "${topic.name}"?`)) return;
    setBusy(true);
    onError(null);
    try {
      await deleteTopic(topic.id);
      await onChanged();
    } catch (err) {
      onError(
        err instanceof ApiError && err.code === 'TOPIC_IN_USE'
          ? 'Chủ đề đang gắn với câu hỏi — bỏ chủ đề khỏi các câu đó trước khi xóa.'
          : err instanceof ApiError
            ? err.message
            : 'Xóa thất bại',
      );
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <li className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-white p-3 text-sm">
        <input
          className="min-w-0 flex-1 rounded-md border border-mist px-3 py-1.5"
          value={name}
          maxLength={100}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded-md border border-mist px-2 py-1.5"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">Mọi lớp</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Lớp {g}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={busy || !normalizeTopicName(name)}
          onClick={() => void onSave()}
          className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accentDark disabled:opacity-50"
        >
          Lưu
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setEditing(false);
            setName(topic.name);
            setGrade(topic.grade == null ? '' : String(topic.grade));
          }}
          className="rounded-md border border-mist px-3 py-1.5 hover:border-accent"
        >
          Hủy
        </button>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-mist bg-white/90 p-3 text-sm">
      <span className="font-medium text-ink">{topic.name}</span>
      <span className="flex items-center gap-2">
        <span className="rounded-full border border-mist bg-slate-50 px-2 py-0.5 text-xs text-slate-600">
          {gradeText(topic.grade)}
        </span>
        {isAdmin && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(true)}
              className="rounded-md border border-mist px-2.5 py-1 text-xs hover:border-accent"
            >
              Sửa
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDelete()}
              className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-700 hover:bg-red-50"
            >
              Xóa
            </button>
          </>
        )}
      </span>
    </li>
  );
}

function TopicsBody() {
  const { user } = useSession();
  const isAdmin = user?.role === 'admin';
  const [subjectId, setSubjectId] = useState<TagKey>('math');
  const [gradeFilter, setGradeFilter] = useState('');
  const { topics, loaded, reload } = useTopics(
    subjectId,
    gradeFilter ? Number(gradeFilter) : undefined,
  );
  const [newName, setNewName] = useState('');
  const [newGrade, setNewGrade] = useState('7');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const name = normalizeTopicName(newName);
    if (!name) return;
    setBusy(true);
    setError(null);
    setFlash(null);
    try {
      const { topic } = await createTopic({
        subjectId,
        name,
        grade: newGrade ? Number(newGrade) : null,
      });
      setFlash(`Đã lưu chủ đề "${topic.name}" (${gradeText(topic.grade)})`);
      setNewName('');
      await reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Tạo chủ đề thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Chủ đề</h1>
        <p className="mt-1 text-sm text-slate-600">
          Danh mục chủ đề dùng chung theo môn/lớp — gắn vào câu hỏi để lọc và tạo đề ngẫu nhiên theo
          chủ đề.{isAdmin ? '' : ' Chỉ admin được sửa hoặc xóa chủ đề.'}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {flash && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {flash}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value as TagKey)}
        >
          {SUBJECT_TAGS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
        >
          <option value="">Mọi lớp</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Lớp {g} (+ chủ đề mọi lớp)
            </option>
          ))}
        </select>
      </div>

      <form
        onSubmit={onCreate}
        className="flex flex-wrap items-center gap-2 rounded-xl border border-mist bg-white/90 p-4 text-sm shadow-sm"
      >
        <input
          className="min-w-0 flex-1 rounded-md border border-mist px-3 py-2"
          placeholder="Tên chủ đề mới"
          value={newName}
          maxLength={100}
          onChange={(e) => setNewName(e.target.value)}
        />
        <select
          className="rounded-md border border-mist px-2 py-2"
          value={newGrade}
          onChange={(e) => setNewGrade(e.target.value)}
        >
          <option value="">Mọi lớp</option>
          {GRADES.map((g) => (
            <option key={g} value={g}>
              Lớp {g}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy || !normalizeTopicName(newName)}
          className="rounded-md bg-accent px-4 py-2 font-medium text-white hover:bg-accentDark disabled:opacity-50"
        >
          {busy ? 'Đang tạo…' : 'Thêm chủ đề'}
        </button>
      </form>

      {!loaded ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : (
        <ul className="space-y-2">
          {topics.map((t) => (
            <TopicRow
              key={`${t.id}:${t.name}:${t.grade}`}
              topic={t}
              isAdmin={isAdmin}
              onChanged={reload}
              onError={setError}
            />
          ))}
          {!topics.length && <p className="text-slate-500">Chưa có chủ đề cho lựa chọn này.</p>}
        </ul>
      )}
    </div>
  );
}

export default function TopicsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <TopicsBody />
    </AuthGate>
  );
}
