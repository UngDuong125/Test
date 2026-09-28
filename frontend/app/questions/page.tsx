'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { STATUS_LABELS } from '@/constants/questions';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, listQuestions, publishQuestion } from '@/lib/api-client';
import { topicLabel, useTopicMap, useTopics } from '@/lib/topics';
import type { Question } from '@/types/content';
import type { TagKey } from '@/types/auth';

function contentSnippet(q: Question): string {
  const first = q.content[0];
  if (!first) return '(không có nội dung)';
  if (first.type === 'image') return '(hình ảnh)';
  return first.value.slice(0, 100);
}

function QuestionsBody() {
  const [items, setItems] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState<TagKey | ''>('');
  const [grade, setGrade] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [topicId, setTopicId] = useState('');
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const filterTopics = useTopics(subjectId, grade ? Number(grade) : undefined);
  const topicMap = useTopicMap();

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listQuestions({
        subjectId: subjectId || undefined,
        grade: grade ? Number(grade) : undefined,
        status: status || undefined,
        type: type || undefined,
        topicId: topicId || undefined,
        q: q.trim() || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được câu hỏi');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId, grade, status, type, topicId]);

  useEffect(() => {
    if (!topicId) return;
    if (!subjectId || (filterTopics.loaded && !filterTopics.topics.some((t) => t.id === topicId))) {
      setTopicId('');
    }
  }, [topicId, subjectId, filterTopics.loaded, filterTopics.topics]);

  async function onPublish(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await publishQuestion(id);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Publish thất bại');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tạo, chỉnh sửa, preview và quản lý vòng đời câu hỏi ({total} kết quả).
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link
            href="/questions/new"
            className="rounded-md bg-accent px-3 py-1.5 font-medium text-white hover:bg-accentDark"
          >
            + Tạo câu hỏi
          </Link>
          <Link href="/question-banks" className="rounded-md border border-mist px-3 py-1.5 hover:border-accent">
            Ngân hàng →
          </Link>
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value as TagKey | '')}
        >
          <option value="">Tất cả môn</option>
          {SUBJECT_TAGS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={grade}
          onChange={(e) => setGrade(e.target.value)}
        >
          <option value="">Mọi lớp</option>
          {[6, 7, 8, 9].map((g) => (
            <option key={g} value={g}>
              Lớp {g}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-mist bg-white px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Mọi loại</option>
          <option value="multiple_choice">Trắc nghiệm</option>
          <option value="true_false">Đúng/Sai</option>
          <option value="fill_blank">Điền khuyết</option>
          <option value="short_answer">Trả lời ngắn</option>
          <option value="essay">Tự luận</option>
          <option value="multiple_select">Nhiều đáp án</option>
          <option value="numeric">Số học</option>
        </select>
        <select
          className="rounded-md border border-mist bg-white px-3 py-2 disabled:bg-slate-50"
          value={topicId}
          disabled={!subjectId}
          title={subjectId ? undefined : 'Chọn môn trước để lọc theo chủ đề'}
          onChange={(e) => setTopicId(e.target.value)}
        >
          <option value="">{subjectId ? 'Mọi chủ đề' : 'Chủ đề (chọn môn trước)'}</option>
          {filterTopics.topics.map((t) => (
            <option key={t.id} value={t.id}>
              {grade ? topicLabel(t) : t.grade != null ? `${t.name} (lớp ${t.grade})` : topicLabel(t)}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void refresh();
          }}
        >
          <input
            className="rounded-md border border-mist bg-white px-3 py-2"
            placeholder="Tìm nội dung…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <button type="submit" className="rounded-md border border-mist px-3 py-2 hover:border-accent">
            Tìm
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-mist bg-white/90 p-4"
            >
              <div className="min-w-0 flex-1">
                <Link
                  href={`/questions/${item.id}`}
                  className="font-medium text-ink hover:text-accentDark"
                >
                  {contentSnippet(item)}
                </Link>
                <p className="mt-1 text-xs text-slate-500">
                  {item.subjectId} · lớp {item.grade} · {item.type} · {item.difficulty} ·{' '}
                  {STATUS_LABELS[item.status] ?? item.status} · {item.points}đ
                </p>
                {item.topicIds.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1">
                    {item.topicIds.map((id) => (
                      <span
                        key={id}
                        className="rounded-full border border-mist bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600"
                      >
                        {topicMap[id]?.name ?? '…'}
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={`/questions/${item.id}`}
                  className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
                >
                  Chi tiết
                </Link>
                {(item.status === 'draft' || item.status === 'review') && (
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => void onPublish(item.id)}
                    className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50"
                  >
                    Publish
                  </button>
                )}
              </div>
            </li>
          ))}
          {!items.length && <p className="text-slate-500">Chưa có câu hỏi.</p>}
        </ul>
      )}
    </div>
  );
}

export default function QuestionsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <QuestionsBody />
    </AuthGate>
  );
}
