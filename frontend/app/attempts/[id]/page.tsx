'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptQuestionCard } from '@/components/attempts/AttemptQuestionCard';
import {
  ApiError,
  getAttempt,
  saveAttemptAnswer,
  submitAttempt,
} from '@/lib/api-client';
import type { AttemptDetail, StudentAnswerValue } from '@/types/content';

function formatRemaining(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function AttemptBody() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params.id);

  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getAttempt(attemptId);
        setDetail(data);
        const map: Record<string, StudentAnswerValue> = {};
        for (const a of data.answers) {
          map[a.questionId] = a.value;
        }
        setAnswers(map);
        if (data.attempt.status !== 'in_progress') {
          router.replace(`/results/${attemptId}`);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải được bài làm');
      }
    })();
  }, [attemptId, router]);

  const remainingMs = useMemo(() => {
    if (!detail?.attempt.expiresAt) return null;
    return new Date(detail.attempt.expiresAt).getTime() - now;
  }, [detail, now]);

  const saveAnswer = useCallback(
    async (questionId: string, value: StudentAnswerValue) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      setSaving(questionId);
      try {
        await saveAttemptAnswer(attemptId, { questionId, value });
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Lưu câu trả lời thất bại');
      } finally {
        setSaving(null);
      }
    },
    [attemptId],
  );

  useEffect(() => {
    if (remainingMs != null && remainingMs <= 0 && detail?.attempt.status === 'in_progress') {
      void (async () => {
        try {
          await submitAttempt(attemptId);
          router.replace(`/results/${attemptId}`);
        } catch {
          router.replace(`/results/${attemptId}`);
        }
      })();
    }
  }, [remainingMs, detail, attemptId, router]);

  async function onSubmit() {
    if (!window.confirm('Nộp bài? Bạn sẽ không thể sửa câu trả lời sau khi nộp.')) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitAttempt(attemptId);
      router.push(`/results/${attemptId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Nộp bài thất bại');
      setSubmitting(false);
    }
  }

  if (error && !detail) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!detail) {
    return <p className="text-sm text-slate-500">Đang tải bài làm…</p>;
  }

  const questions = [...detail.snapshot.questions].sort((a, b) => a.order - b.order);
  const answeredCount = questions.filter((q) => {
    const v = answers[q.id];
    if (v == null || v === '') return false;
    if (Array.isArray(v) && v.length === 0) return false;
    return true;
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-accentDark">
              Dashboard
            </Link>
            {' / '}
            Làm bài
          </p>
          <h1 className="font-display text-2xl font-bold text-ink">
            {detail.snapshot.exam.title}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Đã trả lời {answeredCount}/{questions.length}
            {saving && <span className="ml-2 text-slate-400">Đang lưu…</span>}
          </p>
        </div>
        <div className="rounded-lg border border-mist bg-white px-4 py-2 text-center shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">
            {detail.snapshot.exam.duration === 0 ? 'Thời lượng đề' : 'Thời gian còn lại'}
          </p>
          <p
            className={`font-mono text-xl font-semibold ${
              detail.snapshot.exam.duration > 0 &&
              remainingMs != null &&
              remainingMs < 60_000
                ? 'text-red-600'
                : 'text-ink'
            }`}
          >
            {detail.snapshot.exam.duration === 0
              ? 'Không giới hạn'
              : remainingMs == null
                ? '—'
                : formatRemaining(remainingMs)}
          </p>
          {detail.snapshot.exam.duration === 0 && remainingMs != null && (
            <p className="mt-1 text-xs text-slate-500">
              Hạn assignment: {formatRemaining(remainingMs)}
            </p>
          )}
        </div>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {detail.snapshot.exam.instructions && (
        <div className="rounded-lg border border-mist bg-paper/60 px-4 py-3 text-sm text-slate-700">
          {detail.snapshot.exam.instructions}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <AttemptQuestionCard
            key={q.id}
            question={q}
            index={i}
            value={answers[q.id] ?? null}
            onChange={(v) => void saveAnswer(q.id, v)}
            disabled={submitting}
          />
        ))}
      </div>

      <div className="sticky bottom-4 flex justify-end">
        <button
          type="button"
          onClick={() => void onSubmit()}
          disabled={submitting}
          className="rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-white shadow hover:bg-accentDark disabled:opacity-60"
        >
          {submitting ? 'Đang nộp…' : 'Nộp bài'}
        </button>
      </div>
    </div>
  );
}

export default function AttemptPage() {
  return (
    <AuthGate roles={['student']}>
      <AttemptBody />
    </AuthGate>
  );
}
