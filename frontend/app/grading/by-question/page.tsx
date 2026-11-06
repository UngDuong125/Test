'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { ContentBlocksView } from '@/components/questions/QuestionPreview';
import {
  ApiError,
  getGradingDetail,
  gradeAttempt,
  listExamAssignments,
  listGradingQueue,
} from '@/lib/api-client';
import {
  answerText,
  attemptPayload,
  batchQuestions,
  readFeedbackTemplates,
  writeFeedbackTemplates,
  type GradeDraft,
} from '@/lib/grading-batch';
import type { AttemptDetail } from '@/types/content';

const LOAD_CONCURRENCY = 4;

async function loadDetails(ids: string[]): Promise<AttemptDetail[]> {
  const out: AttemptDetail[] = new Array(ids.length);
  let next = 0;
  async function worker() {
    while (next < ids.length) {
      const i = next++;
      out[i] = await getGradingDetail(ids[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, ids.length) }, worker));
  return out.filter(Boolean);
}

function draftKey(examId: string) {
  return `testarchive:grading-draft:${examId}`;
}

function ByQuestionBody() {
  /** undefined = URL not read yet; null = no exam selected. */
  const [examId, setExamId] = useState<string | null | undefined>(undefined);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [details, setDetails] = useState<AttemptDetail[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [activeQ, setActiveQ] = useState(0);
  const [draft, setDraft] = useState<GradeDraft>({});
  const [templates, setTemplates] = useState<string[]>([]);
  const [newTemplate, setNewTemplate] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  useEffect(() => {
    setExamId(new URLSearchParams(window.location.search).get('examId'));
    setTemplates(readFeedbackTemplates());
  }, []);

  useEffect(() => {
    if (examId === undefined) return;
    if (examId === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [queue, asg] = await Promise.all([
          listGradingQueue({ examId, limit: 100 }),
          listExamAssignments({ examId, limit: 100 }).catch(() => ({ items: [] })),
        ]);
        const loaded = await loadDetails(queue.items.map((a) => a.id));
        if (cancelled) return;
        setDetails(loaded);
        setNames(
          Object.fromEntries(
            asg.items.map((a) => [a.targetId, a.targetUsername || a.targetEmail || a.targetId.slice(0, 8)]),
          ),
        );
        try {
          const saved = window.localStorage.getItem(draftKey(examId));
          if (saved) setDraft(JSON.parse(saved) as GradeDraft);
        } catch {
          // Draft unavailable; start empty.
        }
        setDraftLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : 'Không tải được bài chờ chấm');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [examId]);

  // Keep the draft across reloads until it is submitted.
  useEffect(() => {
    if (!examId || !draftLoaded) return;
    try {
      window.localStorage.setItem(draftKey(examId), JSON.stringify(draft));
    } catch {
      // ignore
    }
  }, [draft, draftLoaded, examId]);

  const questions = useMemo(() => batchQuestions(details), [details]);
  const question = questions[activeQ];
  const rows = useMemo(
    () =>
      question
        ? details.filter((d) => d.snapshot.questions.some((q) => q.id === question.id))
        : [],
    [details, question],
  );

  const setCell = useCallback(
    (attemptId: string, questionId: string, patch: Partial<{ points: string; feedback: string }>) => {
      setDraft((prev) => {
        const cur = prev[attemptId]?.[questionId] ?? { points: '', feedback: '' };
        return {
          ...prev,
          [attemptId]: { ...prev[attemptId], [questionId]: { ...cur, ...patch } },
        };
      });
    },
    [],
  );

  const payloads = useMemo(
    () => details.map((d) => ({ detail: d, payload: attemptPayload(d, draft) })),
    [details, draft],
  );
  const readyCount = payloads.filter((p) => p.payload.ready).length;
  const gradedForQuestion = question
    ? rows.filter((d) => (draft[d.attempt.id]?.[question.id]?.points ?? '').trim() !== '').length
    : 0;

  function focusNext(index: number) {
    const nextRow = rows[index + 1];
    if (nextRow) {
      inputRefs.current.get(nextRow.attempt.id)?.focus();
    } else if (activeQ + 1 < questions.length) {
      setActiveQ(activeQ + 1);
    }
  }

  function addTemplate() {
    const t = newTemplate.trim();
    if (!t || templates.includes(t)) return;
    const next = [...templates, t];
    setTemplates(next);
    writeFeedbackTemplates(next);
    setNewTemplate('');
  }

  function removeTemplate(t: string) {
    const next = templates.filter((x) => x !== t);
    setTemplates(next);
    writeFeedbackTemplates(next);
  }

  async function submitReady() {
    const ready = payloads.filter((p) => p.payload.ready);
    if (ready.length === 0) return;
    if (!window.confirm(`Chốt điểm cho ${ready.length} bài đã chấm đủ mọi câu tự luận?`)) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    const failures: string[] = [];
    const done = new Set<string>();
    for (const { detail, payload } of ready) {
      if (!payload.ready) continue;
      try {
        await gradeAttempt(detail.attempt.id, { answers: payload.answers });
        done.add(detail.attempt.id);
      } catch (err) {
        failures.push(
          `${names[detail.attempt.userId] ?? detail.attempt.userId.slice(0, 8)}: ${
            err instanceof ApiError ? err.message : 'lỗi'
          }`,
        );
      }
    }
    setDetails((prev) => prev.filter((d) => !done.has(d.attempt.id)));
    setDraft((prev) => {
      const next = { ...prev };
      for (const id of done) delete next[id];
      return next;
    });
    setSaving(false);
    setNotice(`Đã chốt điểm ${done.size} bài. Học sinh sẽ thấy điểm mới trên dashboard.`);
    if (failures.length) setError(failures.join('; '));
  }

  if (examId === undefined) return <p className="text-sm text-slate-500">Đang tải…</p>;
  if (examId === null) {
    return (
      <p className="text-sm text-slate-600">
        Chọn một đề từ <Link href="/grading" className="text-accentDark hover:underline">hàng đợi chấm</Link>.
      </p>
    );
  }

  const title = details[0]?.snapshot.exam.title ?? 'Đề';

  return (
    <div className="space-y-6 pb-24">
      <div>
        <p className="text-sm text-slate-500">
          <Link href="/grading" className="hover:text-accentDark">
            Chấm bài
          </Link>
          {' / '}Chấm theo câu
        </p>
        <h1 className="font-display text-2xl font-bold text-ink">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chấm một câu cho cả lớp rồi sang câu tiếp. Điểm được giữ dạng nháp trên máy này cho tới khi bạn chốt.
        </p>
      </div>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {notice && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Đang tải bài chờ chấm…</p>
      ) : details.length === 0 ? (
        <p className="text-sm text-slate-500">Không còn bài nào của đề này chờ chấm.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Câu cần chấm">
            {questions.map((q, i) => (
              <button
                key={q.id}
                type="button"
                role="tab"
                aria-selected={i === activeQ}
                onClick={() => setActiveQ(i)}
                className={`rounded-md px-3 py-1.5 text-sm ${
                  i === activeQ ? 'bg-accent text-white' : 'border border-mist hover:border-accent'
                }`}
              >
                {q.label} · {q.points}đ
              </button>
            ))}
          </div>

          {question && (
            <section className="space-y-4">
              <div className="rounded-xl border border-mist bg-white p-5 shadow-sm">
                <p className="mb-2 text-sm font-semibold text-ink">
                  {question.label} · tối đa {question.points} điểm · đã nhập {gradedForQuestion}/{rows.length}
                </p>
                <ContentBlocksView blocks={question.question.content} />
              </div>

              <div className="rounded-xl border border-mist bg-white p-4 shadow-sm">
                <p className="text-sm font-medium text-ink">Mẫu nhận xét</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {templates.length === 0 && (
                    <span className="text-xs text-slate-500">Chưa có mẫu. Thêm câu nhận xét hay dùng ở dưới.</span>
                  )}
                  {templates.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs">
                      {t}
                      <button
                        type="button"
                        onClick={() => removeTemplate(t)}
                        aria-label={`Xóa mẫu ${t}`}
                        className="text-slate-400 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={newTemplate}
                    onChange={(e) => setNewTemplate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTemplate();
                      }
                    }}
                    placeholder="Ví dụ: Thiếu đơn vị"
                    className="flex-1 rounded-md border border-mist px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={addTemplate}
                    className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
                  >
                    Thêm mẫu
                  </button>
                </div>
              </div>

              <ul className="space-y-3">
                {rows.map((d, i) => {
                  const ans = d.answers.find((a) => a.questionId === question.id);
                  const cell = draft[d.attempt.id]?.[question.id] ?? { points: '', feedback: '' };
                  const text = answerText(ans?.value);
                  return (
                    <li key={d.attempt.id} className="space-y-3 rounded-xl border border-mist bg-white p-4 shadow-sm">
                      <p className="text-sm font-medium text-ink">
                        {names[d.attempt.userId] ?? `${d.attempt.userId.slice(0, 8)}…`}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          nộp {d.attempt.submittedAt ? new Date(d.attempt.submittedAt).toLocaleString('vi-VN') : '—'}
                        </span>
                      </p>
                      <p className="whitespace-pre-wrap rounded-md bg-paper px-3 py-2 text-sm text-slate-700">
                        {text || <span className="italic text-slate-400">(bỏ trống)</span>}
                      </p>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-sm">
                          Điểm
                          <input
                            ref={(el) => {
                              if (el) inputRefs.current.set(d.attempt.id, el);
                              else inputRefs.current.delete(d.attempt.id);
                            }}
                            inputMode="decimal"
                            value={cell.points}
                            onChange={(e) => setCell(d.attempt.id, question.id, { points: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                focusNext(i);
                              }
                            }}
                            aria-label={`Điểm của ${names[d.attempt.userId] ?? 'học sinh'}`}
                            className="ml-2 w-20 rounded-md border border-mist px-2 py-1"
                          />
                        </label>
                        <div className="flex gap-1">
                          {[0, question.points / 2, question.points].map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setCell(d.attempt.id, question.id, { points: String(v) })}
                              className="min-h-[36px] rounded-md border border-mist px-2 text-xs hover:border-accent"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                        <label className="min-w-[220px] flex-1 text-sm">
                          Nhận xét
                          <input
                            value={cell.feedback}
                            onChange={(e) => setCell(d.attempt.id, question.id, { feedback: e.target.value })}
                            className="mt-1 w-full rounded-md border border-mist px-2 py-1"
                          />
                        </label>
                      </div>
                      {templates.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {templates.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() =>
                                setCell(d.attempt.id, question.id, {
                                  feedback: cell.feedback ? `${cell.feedback} ${t}` : t,
                                })
                              }
                              className="rounded-full border border-mist px-2 py-0.5 text-xs hover:border-accent"
                            >
                              + {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="text-slate-600">
                {readyCount}/{details.length} bài đã chấm đủ mọi câu tự luận
              </span>
              <div className="flex gap-2">
                {activeQ + 1 < questions.length && (
                  <button
                    type="button"
                    onClick={() => setActiveQ(activeQ + 1)}
                    className="min-h-[44px] rounded-md border border-mist px-3 hover:border-accent"
                  >
                    Câu tiếp →
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving || readyCount === 0}
                  onClick={() => void submitReady()}
                  className="min-h-[44px] rounded-md bg-accent px-4 font-medium text-white hover:bg-accentDark disabled:opacity-50"
                >
                  {saving ? 'Đang chốt…' : `Chốt điểm ${readyCount} bài`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function GradingByQuestionPage() {
  return (
    <AuthGate roles={['admin', 'teacher']}>
      <ByQuestionBody />
    </AuthGate>
  );
}
