'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AuthGate } from '@/components/auth/AuthGate';
import { QuestionForm } from '@/components/questions/QuestionForm';
import { QuestionLifecycleActions } from '@/components/questions/QuestionLifecycleActions';
import { QuestionPreview } from '@/components/questions/QuestionPreview';
import { STATUS_LABELS } from '@/constants/questions';
import { ApiError, getQuestion, updateQuestion } from '@/lib/api-client';
import type { Question } from '@/types/content';

function QuestionDetailBody() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [question, setQuestion] = useState<Question | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await getQuestion(id);
      setQuestion(res.question);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được câu hỏi');
      setQuestion(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const canEdit =
    question != null && (question.status === 'draft' || question.status === 'review');

  if (loading) {
    return <p className="px-4 py-8 text-slate-500">Đang tải…</p>;
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-8">
        <p className="text-red-600">{error ?? 'Không tìm thấy câu hỏi'}</p>
        <Link href="/questions" className="text-sm text-accentDark hover:underline">
          ← Danh sách
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {STATUS_LABELS[question.status] ?? question.status} · v{question.version}
          </p>
          <h1 className="font-display text-3xl font-bold text-ink">Chi tiết câu hỏi</h1>
          <p className="mt-1 text-sm text-slate-600">
            {question.subjectId} · lớp {question.grade} · {question.type} · {question.difficulty} ·{' '}
            {question.points}đ
          </p>
        </div>
        <Link href="/questions" className="text-sm text-accentDark hover:underline">
          ← Danh sách
        </Link>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <QuestionLifecycleActions
        question={question}
        onChanged={(q) => {
          setQuestion(q);
          setEditing(false);
        }}
      />

      <div className="flex flex-wrap gap-2">
        {canEdit && !editing && (
          <button
            type="button"
            className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
            onClick={() => setEditing(true)}
          >
            Chỉnh sửa
          </button>
        )}
        {!canEdit && (
          <p className="text-sm text-slate-500">
            Câu {question.status} không sửa nội dung — hãy nhân bản hoặc archive trước.
          </p>
        )}
      </div>

      {editing && canEdit ? (
        <QuestionForm
          initial={question}
          submitLabel="Cập nhật"
          onCancel={() => setEditing(false)}
          onSubmit={async (payload) => {
            const { bankId, ...body } = payload;
            void bankId;
            const res = await updateQuestion(question.id, body);
            setQuestion(res.question);
            setEditing(false);
          }}
        />
      ) : (
        <div className="space-y-3">
          <h2 className="font-semibold text-ink">Preview</h2>
          <QuestionPreview
            content={question.content}
            options={question.options}
            answer={question.answer}
            explanation={question.explanation}
          />
          {question.tags.length > 0 && (
            <p className="text-sm text-slate-500">Tags: {question.tags.join(', ')}</p>
          )}
          {question.topicIds.length > 0 && (
            <p className="text-sm text-slate-500">Topics: {question.topicIds.length} gắn kèm</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function QuestionDetailPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <QuestionDetailBody />
    </AuthGate>
  );
}
