'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ContentBlocksView, OptionContentView } from '@/components/questions/QuestionPreview';
import { ApiError, getAttempt, getAttemptResult } from '@/lib/api-client';
import { attemptStatusLabel } from '@/lib/attempt-labels';
import { useSession } from '@/lib/auth';
import type { Attempt, AttemptAnswer, AttemptSnapshot } from '@/types/content';

function ResultBody() {
  const params = useParams();
  const attemptId = String(params.id);
  const { user } = useSession();

  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [snapshot, setSnapshot] = useState<AttemptSnapshot | null>(null);
  const [answers, setAnswers] = useState<AttemptAnswer[]>([]);
  const [expEarned, setExpEarned] = useState<number | null>(null);
  const [expSubject, setExpSubject] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(true);
  const [answerKeysLocked, setAnswerKeysLocked] = useState(false);
  const [remainingAttempts, setRemainingAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const isStaff = user?.role === 'admin' || user?.role === 'teacher';

  useEffect(() => {
    void (async () => {
      try {
        const live = await getAttempt(attemptId);
        if (live.attempt.status === 'in_progress') {
          setAttempt(live.attempt);
          setSnapshot(live.snapshot);
          setAnswers(live.answers);
          setShowResult(isStaff);
          setAnswerKeysLocked(false);
          setRemainingAttempts(live.remainingAttempts ?? 0);
          setExpEarned(null);
          setExpSubject(null);
          return;
        }

        const data = await getAttemptResult(attemptId);
        setAttempt(data.attempt);
        setSnapshot(data.snapshot);
        setAnswers(data.answers);
        setExpEarned(data.expEarned);
        setExpSubject(data.expSubject);
        setShowResult(data.showResult);
        setAnswerKeysLocked(data.answerKeysLocked);
        setRemainingAttempts(data.remainingAttempts);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải kết quả');
      }
    })();
  }, [attemptId, isStaff]);

  if (error) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-8">
        <p className="text-sm text-red-700">{error}</p>
        <Link href={isStaff ? '/exams' : '/dashboard'} className="text-accentDark hover:underline">
          Quay lại
        </Link>
      </div>
    );
  }
  if (!attempt || !snapshot) {
    return <p className="px-4 py-8 text-sm text-slate-500">Đang tải kết quả…</p>;
  }

  const answerMap = new Map(answers.map((a) => [a.questionId, a]));
  const questions = [...snapshot.questions].sort((a, b) => a.order - b.order);
  const answeredCount = questions.filter((q) => {
    const v = answerMap.get(q.id)?.value;
    if (v == null || v === '') return false;
    if (Array.isArray(v)) return v.length > 0;
    return true;
  }).length;
  const isLive = attempt.status === 'in_progress';
  const answerLabel = isStaff && user?.id !== attempt.userId ? 'Học sinh trả lời' : 'Bạn trả lời';

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <p className="text-sm text-slate-500">
          {isStaff ? (
            <>
              <Link href={`/exams/${attempt.examId}/results`} className="hover:text-accentDark">
                Kết quả đề
              </Link>
              {' / '}
              <Link
                href={`/students/${attempt.userId}/results`}
                className="hover:text-accentDark"
              >
                Lịch sử HS
              </Link>
              {' / '}
              Chi tiết
            </>
          ) : (
            <>
              <Link href="/dashboard" className="hover:text-accentDark">
                Dashboard
              </Link>
              {' / '}
              Kết quả
            </>
          )}
        </p>
        <h1 className="font-display text-2xl font-bold text-ink">{snapshot.exam.title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Trạng thái: {attemptStatusLabel(attempt.status)}
          {isLive && (
            <span className="ml-2 text-amber-700">
              · tiến độ {answeredCount}/{questions.length} câu
            </span>
          )}
        </p>
      </div>

      <div className="rounded-xl border border-mist bg-white p-6 shadow-sm">
        {isLive && (
          <p className="text-amber-800">
            {isStaff
              ? 'Học sinh đang làm bài. Dưới đây là các câu đã trả lời đến hiện tại.'
              : 'Bài đang làm — tiếp tục tại trang làm bài.'}
          </p>
        )}
        {!isLive && attempt.status === 'needs_grading' && (
          <p className="text-amber-700">
            Bài đã nộp và đang chờ giáo viên chấm phần tự luận.
          </p>
        )}
        {isLive && !isStaff && (
          <Link
            href={`/attempts/${attempt.id}`}
            className="mt-3 inline-block rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark"
          >
            Tiếp tục làm bài
          </Link>
        )}
        {!isLive && showResult ? (
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
        ) : null}
        {!isLive && !showResult && (
          <p className="mt-2 text-sm text-slate-600">Assignment không cho xem điểm chi tiết.</p>
        )}
        {isLive && isStaff && (
          <div className="mt-3 text-sm text-slate-600">
            Đã trả lời <strong className="text-ink">{answeredCount}</strong> / {questions.length}{' '}
            câu · bắt đầu {new Date(attempt.startedAt).toLocaleString()}
            {attempt.expiresAt && (
              <> · hết hạn {new Date(attempt.expiresAt).toLocaleString()}</>
            )}
          </div>
        )}
        {answerKeysLocked && (
          <p className="mt-3 text-sm text-slate-600">
            Đáp án và lời giải bị khóa vì bạn còn {remainingAttempts} lượt làm bài. Hiện chỉ
            hiển thị đúng/sai (nếu được phép xem kết quả).
          </p>
        )}
        {isStaff && attempt.status === 'needs_grading' && (
          <Link
            href={`/grading/${attempt.id}`}
            className="mt-3 inline-block rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
          >
            Chấm bài này
          </Link>
        )}
      </div>

      <div className="space-y-4">
        {questions.map((q, i) => {
          const ans = answerMap.get(q.id);
          const hasAnswer =
            ans?.value != null &&
            ans.value !== '' &&
            !(Array.isArray(ans.value) && ans.value.length === 0);
          return (
            <div
              key={q.id}
              className="space-y-3 rounded-xl border border-mist bg-white p-5 shadow-sm"
            >
              <p className="text-sm font-semibold text-ink">
                Câu {i + 1}
                {isLive && (
                  <span
                    className={`ml-2 font-normal ${hasAnswer ? 'text-teal-700' : 'text-slate-400'}`}
                  >
                    · {hasAnswer ? 'đã trả lời' : 'chưa trả lời'}
                  </span>
                )}
                {!isLive && showResult && ans?.pointsEarned != null && (
                  <span className="ml-2 font-normal text-slate-500">
                    · {ans.pointsEarned}/{q.points} điểm
                    {ans.isCorrect === true && ' · đúng'}
                    {ans.isCorrect === false && ' · sai'}
                  </span>
                )}
              </p>
              <ContentBlocksView blocks={q.content} />
              <div className="rounded-md bg-paper px-3 py-2 text-sm">
                <p className="font-medium text-ink">{answerLabel}</p>
                <p className="mt-1 text-slate-700">
                  {!hasAnswer
                    ? '(trống)'
                    : Array.isArray(ans?.value)
                      ? ans.value.join(', ')
                      : String(ans?.value)}
                </p>
                {ans?.feedback && (
                  <p className="mt-2 text-slate-600">Feedback: {ans.feedback}</p>
                )}
              </div>
              {!isLive && q.answer && (
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
              {!isLive && q.explanation?.text && (
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
