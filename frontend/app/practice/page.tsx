'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptQuestionCard } from '@/components/attempts/AttemptQuestionCard';
import { OptionContentView } from '@/components/questions/QuestionPreview';
import { SUBJECT_TAGS } from '@/constants/tags';
import { formatAnswerValue } from '@/lib/answer-display';
import {
  ApiError,
  checkPracticeAnswer,
  listPracticeQuestions,
  type PracticeItem,
} from '@/lib/api-client';
import { isAnswered } from '@/lib/attempt-ux';
import type { SnapshotQuestion, StudentAnswerValue } from '@/types/content';

type CheckResult = Awaited<ReturnType<typeof checkPracticeAnswer>>;

function AnswerKey({ question, answer }: { question: SnapshotQuestion; answer: CheckResult['answer'] }) {
  if (!answer) return null;
  return (
    <div className="rounded-md border border-mist bg-white px-3 py-2 text-sm text-slate-700">
      <p className="font-medium text-ink">Đáp án đúng</p>
      {answer.type === 'single' && <p>{answer.value}</p>}
      {answer.type === 'multiple' && <p>{answer.value.join(', ')}</p>}
      {answer.type === 'text' && <p>{answer.value.join(' | ')}</p>}
      {answer.type === 'numeric' && <p>{answer.value}</p>}
      {(answer.type === 'pairs' || answer.type === 'sequence') && (
        <p>{formatAnswerValue(question.options, answer.value)}</p>
      )}
      {(answer.type === 'single' || answer.type === 'multiple') && question.options.length > 0 && (
        <ul className="mt-2 space-y-1 text-slate-600">
          {question.options.map((opt) => (
            <li key={opt.id} className="flex gap-2">
              <span className="font-semibold text-accentDark">{opt.id}.</span>
              <div className="min-w-0 flex-1">
                <OptionContentView content={opt.content} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PracticeBody() {
  const [items, setItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectId, setSubjectId] = useState('');
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState<StudentAnswerValue>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [score, setScore] = useState({ right: 0, done: 0 });

  useEffect(() => {
    void listPracticeQuestions()
      .then((res) => setItems(res.items))
      .catch((err: unknown) =>
        setError(err instanceof ApiError ? err.message : 'Không tải được câu luyện tập'),
      )
      .finally(() => setLoading(false));
  }, []);

  const queue = subjectId ? items.filter((i) => i.subjectId === subjectId) : items;
  const current = queue[index] ?? null;

  function resetCard() {
    setValue(null);
    setResult(null);
  }

  async function onCheck() {
    if (!current || !isAnswered(value ?? undefined)) return;
    setChecking(true);
    setError(null);
    try {
      const res = await checkPracticeAnswer({
        attemptId: current.attemptId,
        questionId: current.question.id,
        value,
      });
      setResult(res);
      setScore((s) => ({ right: s.right + (res.isCorrect ? 1 : 0), done: s.done + 1 }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Kiểm tra thất bại');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/history" className="hover:text-accentDark">
            Lịch sử
          </Link>
          {' / '}Luyện lại câu sai
        </p>
        <h1 className="font-display text-3xl font-bold text-ink">Luyện lại câu sai</h1>
        <p className="mt-2 text-sm text-slate-600">
          Câu bạn làm sai ở các bài đã được xem đáp án. Chỉ để luyện tập: không tính điểm, không cộng EXP.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-mist bg-white p-6 text-sm text-slate-600">
          Chưa có câu nào để luyện. Câu sai sẽ xuất hiện ở đây khi bạn đã dùng hết lượt làm một bài và thầy cô cho
          xem lời giải.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setIndex(0);
                resetCard();
              }}
              aria-label="Lọc theo môn"
              className="rounded-md border border-mist bg-white px-3 py-1.5"
            >
              <option value="">Tất cả môn ({items.length} câu)</option>
              {SUBJECT_TAGS.filter((s) => items.some((i) => i.subjectId === s.key)).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label} ({items.filter((i) => i.subjectId === s.key).length})
                </option>
              ))}
            </select>
            <span className="text-slate-600">
              Câu {Math.min(index + 1, queue.length)}/{queue.length}
              {score.done > 0 && ` · đúng ${score.right}/${score.done}`}
            </span>
          </div>

          {!current ? (
            <div className="rounded-xl border border-mist bg-white p-6 text-center">
              <p className="font-display text-xl font-semibold text-ink">Xong lượt luyện!</p>
              <p className="mt-1 text-sm text-slate-600">
                Bạn đúng {score.right}/{score.done} câu.
              </p>
              <button
                type="button"
                onClick={() => {
                  setIndex(0);
                  setScore({ right: 0, done: 0 });
                  resetCard();
                }}
                className="mt-4 rounded-md border border-mist px-4 py-2 text-sm hover:border-accent"
              >
                Luyện lại từ đầu
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">Từ bài: {current.examTitle}</p>
              <AttemptQuestionCard
                key={`${current.attemptId}:${current.question.id}`}
                question={current.question}
                index={index}
                value={value}
                onChange={setValue}
                disabled={result != null}
              />

              {result && (
                <div
                  className={`space-y-3 rounded-lg border px-4 py-3 text-sm ${
                    result.isCorrect
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-red-200 bg-red-50 text-red-900'
                  }`}
                  role="status"
                >
                  <p className="font-medium">
                    {result.isCorrect
                      ? '✓ Chính xác!'
                      : result.pointsEarned > 0
                        ? `◐ Đúng một phần (${result.pointsEarned}/${result.points})`
                        : '✗ Chưa đúng'}
                  </p>
                  <AnswerKey question={current.question} answer={result.answer} />
                  {result.explanation?.text && (
                    <div className="text-slate-700">
                      <p className="font-medium text-ink">Lời giải</p>
                      <p className="whitespace-pre-wrap">{result.explanation.text}</p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2">
                {!result ? (
                  <button
                    type="button"
                    disabled={checking || !isAnswered(value ?? undefined)}
                    onClick={() => void onCheck()}
                    className="min-h-[44px] rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-50"
                  >
                    {checking ? 'Đang kiểm tra…' : 'Kiểm tra'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIndex((i) => i + 1);
                      resetCard();
                    }}
                    className="min-h-[44px] rounded-md bg-accent px-5 text-sm font-medium text-white hover:bg-accentDark"
                  >
                    Câu tiếp →
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function PracticePage() {
  return (
    <AuthGate roles={['student']}>
      <PracticeBody />
    </AuthGate>
  );
}
