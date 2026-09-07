'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ContentBlocksView } from '@/components/questions/QuestionPreview';
import { ApiError, getGradingDetail, gradeAttempt } from '@/lib/api-client';
import type { AttemptDetail, SnapshotQuestion } from '@/types/content';

function requiresManual(q: SnapshotQuestion): boolean {
  if (q.requiresManualGrade) return true;
  if (q.type === 'essay') return true;
  if (q.answer?.type === 'manual') return true;
  return false;
}

function GradingDetailBody() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params.attemptId);

  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [points, setPoints] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await getGradingDetail(attemptId);
        setDetail(data);
        const p: Record<string, string> = {};
        const f: Record<string, string> = {};
        for (const a of data.answers) {
          if (a.pointsEarned != null) p[a.questionId] = String(a.pointsEarned);
          if (a.feedback) f[a.questionId] = a.feedback;
        }
        setPoints(p);
        setFeedback(f);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Không tải attempt');
      }
    })();
  }, [attemptId]);

  async function onSubmit() {
    if (!detail) return;
    const manualQs = detail.snapshot.questions.filter(requiresManual);
    const answers = [];
    for (const q of manualQs) {
      const raw = points[q.id];
      if (raw == null || raw === '') {
        setError(`Nhập điểm cho câu ${q.order}`);
        return;
      }
      const pts = Number(raw);
      if (Number.isNaN(pts) || pts < 0 || pts > q.points) {
        setError(`Điểm câu ${q.order} phải từ 0 đến ${q.points}`);
        return;
      }
      answers.push({
        questionId: q.id,
        pointsEarned: pts,
        feedback: feedback[q.id] || null,
      });
    }

    setSaving(true);
    setError(null);
    try {
      await gradeAttempt(attemptId, { answers, notes: notes || undefined });
      router.push('/grading');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chấm thất bại');
      setSaving(false);
    }
  }

  if (error && !detail) return <p className="text-sm text-red-700">{error}</p>;
  if (!detail) return <p className="text-sm text-slate-500">Đang tải…</p>;

  const answerMap = new Map(detail.answers.map((a) => [a.questionId, a]));
  const manualQuestions = [...detail.snapshot.questions]
    .filter(requiresManual)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/grading" className="hover:text-accentDark">
            Queue chấm
          </Link>
          {' / '}
          Chi tiết
        </p>
        <h1 className="font-display text-2xl font-bold text-ink">
          {detail.snapshot.exam.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Status {detail.attempt.status} · điểm tạm {detail.attempt.score ?? 0}/
          {detail.attempt.maxScore}
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {manualQuestions.length === 0 ? (
        <p className="text-sm text-slate-500">Không còn câu cần chấm thủ công.</p>
      ) : (
        <div className="space-y-4">
          {manualQuestions.map((q) => {
            const ans = answerMap.get(q.id);
            return (
              <div
                key={q.id}
                className="space-y-3 rounded-xl border border-mist bg-white p-5 shadow-sm"
              >
                <p className="text-sm font-semibold text-ink">
                  Câu {q.order} · tối đa {q.points} điểm
                </p>
                <ContentBlocksView blocks={q.content} />
                <div className="rounded-md bg-paper px-3 py-2 text-sm">
                  <p className="font-medium">Học sinh trả lời</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-700">
                    {ans?.value == null || ans.value === ''
                      ? '(trống)'
                      : String(ans.value)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-4">
                  <label className="text-sm">
                    Điểm
                    <input
                      type="number"
                      min={0}
                      max={q.points}
                      step={0.25}
                      className="ml-2 w-24 rounded-md border border-mist px-2 py-1"
                      value={points[q.id] ?? ''}
                      onChange={(e) =>
                        setPoints((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                    />
                  </label>
                  <label className="min-w-[240px] flex-1 text-sm">
                    Feedback
                    <input
                      type="text"
                      className="mt-1 w-full rounded-md border border-mist px-2 py-1"
                      value={feedback[q.id] ?? ''}
                      onChange={(e) =>
                        setFeedback((prev) => ({ ...prev, [q.id]: e.target.value }))
                      }
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <label className="block text-sm">
        Ghi chú chấm
        <textarea
          className="mt-1 w-full rounded-md border border-mist px-3 py-2"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>

      <button
        type="button"
        disabled={saving || manualQuestions.length === 0}
        onClick={() => void onSubmit()}
        className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accentDark disabled:opacity-60"
      >
        {saving ? 'Đang lưu…' : 'Hoàn tất chấm'}
      </button>
    </div>
  );
}

export default function GradingDetailPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <GradingDetailBody />
    </AuthGate>
  );
}
