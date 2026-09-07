'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ContentBlocksView, OptionContentView } from '@/components/questions/QuestionPreview';
import { ApiError, getAttemptResult } from '@/lib/api-client';
import type { Attempt, AttemptAnswer, AttemptSnapshot } from '@/types/content';

function ResultBody() {
  const params = useParams();
  const attemptId = String(params.id);

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [snapshot, setSnapshot] = useState<AttemptSnapshot | null>(null);
  const [answers, setAnswers] = useState<AttemptAnswer[]>([]);
  const [expEarned, setExpEarned] = useState<number | null>(null);
  const [expSubject, setExpSubject] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getAttemptResult(attemptId);
        setAttempt(data.attempt);
        setSnapshot(data.snapshot);
        setAnswers(data.answers);
        setExpEarned(data.expEarned);
        setExpSubject(data.expSubject);
        setShowResult(data.showResult);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải kết quả');
      }
    })();
  }, [attemptId]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!attempt || !snapshot) {
    return <p className="text-sm text-slate-500">Đang tải kết quả…</p>;
  }

  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const questions = [...snapshot.questions].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/dashboard" className="hover:text-accentDark">
            Dashboard
          </Link>
          {' / '}
          Kết quả
        </p>
        <h1 className="font-display text-2xl font-bold text-ink">{snapshot.exam.title}</h1>
        <p className="mt-1 text-sm text-slate-600">Trạng thái: {attempt.status}</p>
      </div>

      <div className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        {attempt.status === 'needs_grading' && (
          <p className="text-amber-700">
            Bài đã nộp và đang chờ giáo viên chấm phần tự luận.
          </p>
        )}
        {showResult ? (
          <div className="mt-2 flex flex-wrap gap-6 text-sm">
            <div>
              <p className="text-slate-500">Điểm</p>
              <p className="text-2xl font-semibold text-ink">
                {attempt.score ?? '—'} / {attempt.maxScore}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Phần trăm</p>
              <p className="text-2xl font-semibold text-ink">
                {attempt.percentage != null ? `${attempt.percentage}%` : '—'}
              </p>
            </div>
            {expEarned != null && (
              <div>
                <p className="text-slate-500">EXP ({expSubject})</p>
                <p className="text-2xl font-semibold text-ink">+{expEarned}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-600">
            Assignment không cho xem điểm chi tiết.
          </p>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const ans = answerMap.get(q.id);
          return (
            <div
              key={q.id}
              className="space-y-3 rounded-xl border border-mist bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-ink">
                Câu {i + 1}
                {showResult && ans?.pointsEarned != null && (
                  <span className="ml-2 font-normal text-slate-500">
                    · {ans.pointsEarned}/{q.points} điểm
                    {ans.isCorrect === true && ' · đúng'}
                    {ans.isCorrect === false && ' · sai'}
                  </span>
                )}
              </p>
              <ContentBlocksView blocks={q.content} />
              <div className="rounded-md bg-paper px-3 py-2 text-sm">
                <p className="font-medium text-ink">Bạn trả lời</p>
                <p className="mt-1 text-slate-700">
                  {ans?.value == null || ans.value === ''
                    ? '(trống)'
                    : Array.isArray(ans.value)
                      ? ans.value.join(', ')
                      : String(ans.value)}
                </p>
                {ans?.feedback && (
                  <p className="mt-2 text-slate-600">Feedback: {ans.feedback}</p>
                )}
              </div>
              {q.answer && (
                <div className="rounded-md border border-mist px-3 py-2 text-sm text-slate-700">
                  <p className="font-medium text-ink">Đáp án</p>
                  {q.answer.type === 'single' && <p>{q.answer.value}</p>}
                  {q.answer.type === 'multiple' && <p>{q.answer.value.join(', ')}</p>}
                  {q.answer.type === 'text' && <p>{q.answer.value.join(' | ')}</p>}
                  {q.answer.type === 'numeric' && <p>{q.answer.value}</p>}
                  {q.answer.type === 'manual' && <p>Chấm thủ công</p>}
                  {q.options.length > 0 && (
                    <ul className="mt-2 space-y-2 text-slate-600">
                      {q.options.map((opt) => (
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
              )}
              {q.explanation?.text && (
                <div className="text-sm text-slate-700">
                  <p className="font-medium text-ink">Lời giải</p>
                  <p className="whitespace-pre-wrap">{q.explanation.text}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ResultPage() {
  return (
    <AuthGate>
      <ResultBody />
    </AuthGate>
  );
}
