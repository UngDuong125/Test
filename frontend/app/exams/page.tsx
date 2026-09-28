'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { SUBJECT_TAGS } from '@/constants/tags';
import { ApiError, deleteExam, generateExam, listExams } from '@/lib/api-client';
import { useSession } from '@/lib/auth';
import { useTopics } from '@/lib/topics';
import { TopicPicker } from '@/components/questions/TopicPicker';
import type { Exam } from '@/types/content';
import type { TagKey } from '@/types/auth';

function ExamsBody() {
  const [items, setItems] = useState<Exam[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { user } = useSession();

  function canDelete(exam: Exam) {
    if (exam.status !== 'draft' || !user) return false;
    return user.role === 'admin' || exam.ownerId === user.id;
  }

  async function onDelete(exam: Exam) {
    if (
      !confirm(
        `Xóa đề "${exam.title}"? Các câu hỏi vẫn còn trong hệ thống, chỉ đề bị xóa.`,
      )
    ) {
      return;
    }
    setError(null);
    setDeletingId(exam.id);
    try {
      await deleteExam(exam.id);
      setItems((prev) => prev.filter((e) => e.id !== exam.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Xóa đề thất bại');
    } finally {
      setDeletingId(null);
    }
  }

  const [gen, setGen] = useState({
    title: '',
    subjectId: 'math' as TagKey,
    grade: 7,
    type: 'practice',
    duration: 30,
    count: 5,
  });
  const [genTopicIds, setGenTopicIds] = useState<string[]>([]);
  const genTopics = useTopics(gen.subjectId, gen.grade);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await listExams();
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được đề');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onGenerate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await generateExam({
        title: gen.title,
        subjectId: gen.subjectId,
        grade: gen.grade,
        type: gen.type,
        duration: gen.duration,
        selection: {
          count: gen.count,
          ...(genTopicIds.length ? { topicIds: genTopicIds } : {}),
        },
        sectionTitle: 'Phần 1',
        description: '',
        difficulty: 'medium',
        instructions: '',
        settings: {
          shuffleQuestions: false,
          shuffleOptions: true,
          showResult: true,
          showExplanation: true,
        },
      });
      if (res.warnings.length) {
        setError(`Cảnh báo: ${res.warnings.join('; ')}`);
      }
      setGen((g) => ({ ...g, title: '' }));
      await refresh();
      window.location.href = `/exams/${res.exam.id}/edit`;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Generate thất bại');
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Đề thi</h1>
          <p className="mt-1 text-sm text-slate-600">
            Trình soạn đề tích hợp: tạo câu mới hoặc lấy từ ngân hàng, không copy nội dung vào đề.
          </p>
        </div>
        <Link
          href="/exams/new"
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
        >
          + Tạo đề (composer)
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <form
        onSubmit={onGenerate}
        className="grid gap-3 rounded-xl border border-mist bg-white/90 p-5 shadow-sm sm:grid-cols-2"
      >
        <h2 className="sm:col-span-2 font-semibold text-ink">Generate từ câu published</h2>
        <input
          required
          placeholder="Tiêu đề"
          className="rounded-md border border-mist px-3 py-2 text-sm sm:col-span-2"
          value={gen.title}
          onChange={(e) => setGen({ ...gen, title: e.target.value })}
        />
        <select
          className="rounded-md border border-mist px-3 py-2 text-sm"
          value={gen.subjectId}
          onChange={(e) => setGen({ ...gen, subjectId: e.target.value as TagKey })}
        >
          {SUBJECT_TAGS.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={6}
          max={9}
          className="rounded-md border border-mist px-3 py-2 text-sm"
          value={gen.grade}
          onChange={(e) => setGen({ ...gen, grade: Number(e.target.value) })}
        />
        <input
          type="number"
          min={1}
          max={50}
          className="rounded-md border border-mist px-3 py-2 text-sm"
          value={gen.count}
          onChange={(e) => setGen({ ...gen, count: Number(e.target.value) })}
          title="Số câu"
        />
        <div className="sm:col-span-2">
          <TopicPicker
            subjectId={gen.subjectId}
            grade={gen.grade}
            topics={genTopics.topics}
            loaded={genTopics.loaded}
            value={genTopicIds}
            onChange={setGenTopicIds}
            label="Chủ đề (không chọn = mọi chủ đề)"
            hint="Lấy câu published thuộc ít nhất một chủ đề đã chọn."
          />
        </div>
        <button
          type="submit"
          className="rounded-md border border-accent px-4 py-2 text-sm font-medium text-accentDark hover:bg-teal-50"
        >
          Generate draft → composer
        </button>
      </form>

      <div>
        <h2 className="mb-2 font-semibold text-ink">Danh sách đề</h2>
        {loading ? (
          <p className="text-slate-500">Đang tải…</p>
        ) : (
          <ul className="space-y-2">
            {items.map((exam) => (
              <li
                key={exam.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mist bg-white/90 px-4 py-3"
              >
                <Link href={`/exams/${exam.id}/edit`} className="min-w-0 flex-1 hover:opacity-90">
                  <p className="font-medium text-ink">{exam.title}</p>
                  <p className="text-xs text-slate-500">
                    {exam.subjectId} · {exam.type} ·{' '}
                    {exam.duration === 0 ? 'không giới hạn' : `${exam.duration}p`} ·{' '}
                    {exam.totalPoints}đ · {exam.status}
                  </p>
                </Link>
                <Link
                  href={`/exams/${exam.id}/results`}
                  className="shrink-0 text-sm text-accentDark hover:underline"
                >
                  Kết quả
                </Link>
                {canDelete(exam) && (
                  <button
                    type="button"
                    disabled={deletingId === exam.id}
                    onClick={() => void onDelete(exam)}
                    className="shrink-0 text-sm text-red-600 hover:underline disabled:opacity-60"
                  >
                    {deletingId === exam.id ? 'Đang xóa…' : 'Xóa'}
                  </button>
                )}
              </li>
            ))}
            {!items.length && <p className="text-slate-500">Chưa có đề.</p>}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ExamsPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <ExamsBody />
    </AuthGate>
  );
}
