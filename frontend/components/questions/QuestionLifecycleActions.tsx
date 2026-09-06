'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ApiError,
  archiveQuestion,
  deleteQuestion,
  duplicateQuestion,
  publishQuestion,
  rejectQuestionReview,
  submitQuestionReview,
} from '@/lib/api-client';
import type { Question } from '@/types/content';

type Props = {
  question: Question;
  onChanged: (q: Question) => void;
};

export function QuestionLifecycleActions({ question, onChanged }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<Question | void>) {
    setBusy(key);
    setError(null);
    try {
      const result = await fn();
      if (result) onChanged(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Thao tác thất bại');
    } finally {
      setBusy(null);
    }
  }

  const btn =
    'rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent disabled:opacity-50';

  return (
    <div className="space-y-2">
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {question.status === 'draft' && (
          <>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() => void run('review', async () => (await submitQuestionReview(question.id)).question)}
            >
              Gửi duyệt
            </button>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() => void run('publish', async () => (await publishQuestion(question.id)).question)}
            >
              Publish ngay
            </button>
          </>
        )}

        {question.status === 'review' && (
          <>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() => void run('publish', async () => (await publishQuestion(question.id)).question)}
            >
              Duyệt & publish
            </button>
            <button
              type="button"
              className={btn}
              disabled={!!busy}
              onClick={() =>
                void run('reject', async () => (await rejectQuestionReview(question.id)).question)
              }
            >
              Trả về nháp
            </button>
          </>
        )}

        {question.status === 'published' && (
          <button
            type="button"
            className={btn}
            disabled={!!busy}
            onClick={() => void run('archive', async () => (await archiveQuestion(question.id)).question)}
          >
            Archive
          </button>
        )}

        <button
          type="button"
          className={btn}
          disabled={!!busy}
          onClick={() =>
            void run('dup', async () => {
              const res = await duplicateQuestion(question.id);
              router.push(`/questions/${res.question.id}`);
            })
          }
        >
          Nhân bản
        </button>

        {(question.status === 'draft' || question.status === 'review') && (
          <button
            type="button"
            className={`${btn} text-red-600 hover:border-red-300`}
            disabled={!!busy}
            onClick={() => {
              if (!confirm('Xóa câu hỏi này?')) return;
              void run('del', async () => {
                await deleteQuestion(question.id);
                router.push('/questions');
              });
            }}
          >
            Xóa
          </button>
        )}
      </div>
    </div>
  );
}
