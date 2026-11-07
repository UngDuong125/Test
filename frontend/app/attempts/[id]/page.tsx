'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { AttemptQuestionCard } from '@/components/attempts/AttemptQuestionCard';
import { LessonPlayer } from '@/components/attempts/LessonPlayer';
import { sameAnswerValue } from '@/lib/answer-display';
import {
  ApiError,
  checkAttemptAnswer,
  getAttempt,
  saveAttemptAnswer,
  login,
  saveAttemptAnswerKeepalive,
  submitAttempt,
} from '@/lib/api-client';
import { useSession } from '@/lib/auth';
import { takeAttemptDetail } from '@/lib/attempt-handoff';
import {
  TIME_WARNINGS,
  currentTimeWarning,
  isAnswered,
  isRetryableSaveError,
  isSessionExpiredError,
  saveRetryDelay,
  type TimeWarning,
} from '@/lib/attempt-ux';
import type {
  AnswerCheckResult,
  AttemptDetail,
  SnapshotQuestion,
  StudentAnswerValue,
} from '@/types/content';

const SAVE_DEBOUNCE_MS = 400;

type SaveState = 'saving' | 'saved' | 'error';

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

function isTextLike(type: SnapshotQuestion['type']): boolean {
  return type === 'fill_blank' || type === 'short_answer' || type === 'numeric' || type === 'essay';
}

function scrollToQuestion(questionId: string) {
  const el = document.getElementById(`q-${questionId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const focusable = el.querySelector<HTMLElement>('input, textarea, button');
  focusable?.focus({ preventScroll: true });
}

function SaveIndicator({
  states,
  lastSavedAt,
}: {
  states: Record<string, SaveState>;
  lastSavedAt: number | null;
}) {
  const values = Object.values(states);
  const saving = values.includes('saving');
  const failed = values.filter((s) => s === 'error').length;
  let text: string | null = null;
  let tone = 'text-slate-500';
  if (failed > 0) {
    text = `Lưu lỗi ${failed} câu, đang thử lại…`;
    tone = 'text-amber-700';
  } else if (saving) {
    text = 'Đang lưu…';
  } else if (lastSavedAt) {
    text = `Đã lưu lúc ${new Date(lastSavedAt).toLocaleTimeString('vi-VN')}`;
    tone = 'text-emerald-700';
  }
  if (!text) return null;
  return (
    <span className={`text-sm ${tone}`} role="status" aria-live="polite">
      {text}
    </span>
  );
}

function QuestionNavigator({
  questions,
  answers,
  flagged,
  saveStates,
  onJump,
}: {
  questions: SnapshotQuestion[];
  answers: Record<string, StudentAnswerValue>;
  flagged: Set<string>;
  saveStates: Record<string, SaveState>;
  onJump: (questionId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-2 sm:grid-cols-10">
        {questions.map((q, i) => {
          const answered = isAnswered(answers[q.id]);
          const isFlagged = flagged.has(q.id);
          const failed = saveStates[q.id] === 'error';
          const label = [
            `Câu ${i + 1}`,
            answered ? 'đã trả lời' : 'chưa trả lời',
            isFlagged ? 'đã đánh dấu' : null,
            failed ? 'chưa lưu được' : null,
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onJump(q.id)}
              aria-label={label}
              title={label}
              className={`relative h-11 rounded-md border text-sm font-medium ${
                answered
                  ? 'border-accent bg-accent text-white'
                  : 'border-mist bg-white text-slate-700 hover:border-accent'
              } ${isFlagged ? 'ring-2 ring-amber-400 ring-offset-1' : ''}`}
            >
              {i + 1}
              {isFlagged && (
                <span aria-hidden className="absolute -right-1 -top-1 text-xs">
                  ⚑
                </span>
              )}
              {failed && (
                <span aria-hidden className="absolute -bottom-1 -right-1 text-xs text-red-600">
                  !
                </span>
              )}
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm bg-accent align-middle" />
          Đã trả lời
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm border border-mist bg-white align-middle" />
          Chưa trả lời
        </span>
        <span>
          <span className="mr-1 inline-block h-3 w-3 rounded-sm ring-2 ring-amber-400 align-middle" />
          Đánh dấu xem lại
        </span>
      </p>
    </div>
  );
}

function SubmitDialog({
  unanswered,
  flaggedCount,
  unsavedCount,
  canJump,
  onJump,
  onCancel,
  onConfirm,
}: {
  unanswered: number;
  flaggedCount: number;
  unsavedCount: number;
  canJump: boolean;
  onJump: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="submit-dialog-title"
    >
      <div className="w-full max-w-md space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <h2 id="submit-dialog-title" className="font-display text-xl font-semibold text-ink">
          Nộp bài?
        </h2>
        <ul className="space-y-1 text-sm text-slate-700">
          <li className={unanswered > 0 ? 'font-medium text-amber-700' : ''}>
            {unanswered > 0 ? `Còn ${unanswered} câu chưa trả lời.` : 'Bạn đã trả lời tất cả các câu.'}
          </li>
          {flaggedCount > 0 && <li>{flaggedCount} câu đang đánh dấu xem lại.</li>}
          {unsavedCount > 0 && (
            <li className="font-medium text-red-700">
              Còn {unsavedCount} câu chưa lưu được. Hệ thống sẽ thử lưu lại trước khi nộp.
            </li>
          )}
          <li className="text-slate-500">Sau khi nộp bạn không thể sửa câu trả lời.</li>
        </ul>
        <div className="flex flex-wrap justify-end gap-2">
          {canJump && unanswered > 0 && (
            <button
              type="button"
              onClick={onJump}
              className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
            >
              Xem câu chưa làm
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-mist px-3 py-2 text-sm hover:border-accent"
          >
            Quay lại
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
          >
            Nộp bài
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Log in again without leaving the attempt: unsaved answers stay in memory and are
 * saved once the new session exists.
 */
function ReloginDialog({ onDone }: { onDone: () => void }) {
  const { user, setUser } = useSession();
  const [loginId, setLoginId] = useState(user?.username ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login(loginId, password);
      setUser(res.user);
      if (res.user.mustChangePassword) {
        setError('Tài khoản cần đổi mật khẩu trước. Câu đã lưu vẫn còn; câu đang gõ dở có thể bị mất.');
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Đăng nhập thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="relogin-title"
    >
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 rounded-xl bg-white p-6 shadow-xl">
        <h2 id="relogin-title" className="font-display text-lg font-semibold text-ink">
          Phiên đăng nhập đã hết hạn
        </h2>
        <p className="text-sm text-slate-600">
          Đăng nhập lại để lưu tiếp. Câu trả lời của bạn vẫn đang được giữ trên trang này — đừng tải lại trang.
        </p>
        <input
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          autoComplete="username"
          required
          aria-label="Email hoặc tên đăng nhập"
          className="w-full rounded-md border border-mist px-3 py-2 text-sm"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
          autoFocus
          aria-label="Mật khẩu"
          className="w-full rounded-md border border-mist px-3 py-2 text-sm"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-accent py-2 text-sm font-semibold text-white hover:bg-accentDark disabled:opacity-60"
        >
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập và lưu tiếp'}
        </button>
      </form>
    </div>
  );
}

function AttemptBody() {
  const params = useParams();
  const router = useRouter();
  const attemptId = String(params.id);

  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [answers, setAnswers] = useState<Record<string, StudentAnswerValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [navigatorOpen, setNavigatorOpen] = useState(false);
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [dismissedWarning, setDismissedWarning] = useState<TimeWarning | null>(null);
  const [now, setNow] = useState(Date.now());
  const [clock, setClock] = useState<{ serverNow: number; receivedAt: number } | null>(null);

  const answersRef = useRef(answers);
  const debounceTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const dirtyRef = useRef<Set<string>>(new Set());
  const saveChainRef = useRef<Map<string, Promise<void>>>(new Map());
  const failuresRef = useRef<Map<string, number>>(new Map());
  const retryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const autoSubmitStartedRef = useRef(false);
  const flushAllSavesRef = useRef<() => Promise<void>>(async () => {});
  const enqueuePersistRef = useRef<(questionId: string) => Promise<void>>(async () => {});

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handed = takeAttemptDetail(attemptId);
    if (handed) {
      const data = handed.detail;
      setDetail(data);
      setClock({
        serverNow: new Date(data.serverNow ?? new Date(handed.receivedAt).toISOString()).getTime(),
        receivedAt: handed.receivedAt,
      });
      const map: Record<string, StudentAnswerValue> = {};
      for (const a of data.answers) map[a.questionId] = a.value;
      setAnswers(map);
      answersRef.current = map;
      if (data.attempt.status !== 'in_progress') {
        router.replace(`/results/${attemptId}`);
      }
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const receivedAt = Date.now();
        const data = await getAttempt(attemptId);
        if (cancelled) return;
        setDetail(data);
        setClock({
          serverNow: new Date(data.serverNow ?? new Date(receivedAt).toISOString()).getTime(),
          receivedAt,
        });
        const map: Record<string, StudentAnswerValue> = {};
        for (const a of data.answers) {
          map[a.questionId] = a.value;
        }
        setAnswers(map);
        answersRef.current = map;
        if (data.attempt.status !== 'in_progress') {
          router.replace(`/results/${attemptId}`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : 'Không tải được bài làm');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, router]);

  const remainingMs = useMemo(() => {
    if (!detail?.attempt.expiresAt || !clock) return null;
    return (
      new Date(detail.attempt.expiresAt).getTime() -
      clock.serverNow -
      (now - clock.receivedAt)
    );
  }, [detail, clock, now]);

  const scheduleRetry = useCallback((questionId: string) => {
    const failures = (failuresRef.current.get(questionId) ?? 0) + 1;
    failuresRef.current.set(questionId, failures);
    const existing = retryTimersRef.current.get(questionId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      retryTimersRef.current.delete(questionId);
      void enqueuePersistRef.current(questionId);
    }, saveRetryDelay(failures));
    retryTimersRef.current.set(questionId, timer);
  }, []);

  const persistAnswer = useCallback(
    async (questionId: string, value: StudentAnswerValue) => {
      setSaveStates((prev) => ({ ...prev, [questionId]: 'saving' }));
      try {
        await saveAttemptAnswer(attemptId, { questionId, value });
        if (sameAnswerValue(answersRef.current[questionId] ?? null, value)) {
          dirtyRef.current.delete(questionId);
        }
        failuresRef.current.delete(questionId);
        setSaveStates((prev) => ({ ...prev, [questionId]: 'saved' }));
        setLastSavedAt(Date.now());
      } catch (err) {
        setSaveStates((prev) => ({ ...prev, [questionId]: 'error' }));
        if (isSessionExpiredError(err)) {
          // Stays dirty; saved again after the student logs back in.
          setSessionExpired(true);
        } else if (isRetryableSaveError(err)) {
          // Keep the answer on screen and dirty; retry with backoff.
          scheduleRetry(questionId);
        } else {
          setError(err instanceof ApiError ? err.message : 'Lưu câu trả lời thất bại');
        }
        throw err;
      }
    },
    [attemptId, scheduleRetry],
  );

  const enqueuePersist = useCallback(
    (questionId: string) => {
      const run = async () => {
        let value = answersRef.current[questionId] ?? null;
        await persistAnswer(questionId, value);
        // If the student kept typing while this request was in flight, save again.
        while (
          dirtyRef.current.has(questionId) &&
          !sameAnswerValue(answersRef.current[questionId] ?? null, value)
        ) {
          value = answersRef.current[questionId] ?? null;
          await persistAnswer(questionId, value);
        }
      };

      const prev = saveChainRef.current.get(questionId) ?? Promise.resolve();
      const next = prev.then(run, run);
      saveChainRef.current.set(
        questionId,
        next.then(
          () => undefined,
          () => undefined,
        ),
      );
      return next;
    },
    [persistAnswer],
  );

  enqueuePersistRef.current = (questionId) => enqueuePersist(questionId).catch(() => undefined);

  const flushAllSaves = useCallback(async () => {
    for (const [questionId, timer] of debounceTimersRef.current) {
      clearTimeout(timer);
      debounceTimersRef.current.delete(questionId);
      dirtyRef.current.add(questionId);
    }
    for (const [questionId, timer] of retryTimersRef.current) {
      clearTimeout(timer);
      retryTimersRef.current.delete(questionId);
    }

    const pendingIds = [...dirtyRef.current];
    await Promise.all(pendingIds.map((questionId) => enqueuePersist(questionId)));
    await Promise.all([...saveChainRef.current.values()]);
  }, [enqueuePersist]);

  flushAllSavesRef.current = flushAllSaves;

  // Back online: retry every failed save right away instead of waiting for backoff.
  useEffect(() => {
    function onOnline() {
      for (const [questionId, timer] of retryTimersRef.current) {
        clearTimeout(timer);
        retryTimersRef.current.delete(questionId);
        void enqueuePersistRef.current(questionId);
      }
    }
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

  useEffect(() => {
    const retryTimers = retryTimersRef.current;
    function onPageHide() {
      for (const [questionId, timer] of debounceTimersRef.current) {
        clearTimeout(timer);
        debounceTimersRef.current.delete(questionId);
        dirtyRef.current.add(questionId);
      }
      for (const questionId of dirtyRef.current) {
        saveAttemptAnswerKeepalive(attemptId, {
          questionId,
          value: answersRef.current[questionId] ?? null,
        });
      }
    }
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      for (const timer of retryTimers.values()) clearTimeout(timer);
      retryTimers.clear();
      void flushAllSavesRef.current().catch(() => undefined);
    };
  }, [attemptId]);

  const checkAnswer = useCallback(
    async (questionId: string, value: StudentAnswerValue): Promise<AnswerCheckResult> => {
      const pending = debounceTimersRef.current.get(questionId);
      if (pending) {
        clearTimeout(pending);
        debounceTimersRef.current.delete(questionId);
      }
      dirtyRef.current.delete(questionId);
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        answersRef.current = next;
        return next;
      });
      return checkAttemptAnswer(attemptId, { questionId, value });
    },
    [attemptId],
  );

  const saveAnswer = useCallback(
    (questionId: string, value: StudentAnswerValue, options?: { immediate?: boolean }) => {
      setAnswers((prev) => {
        const next = { ...prev, [questionId]: value };
        answersRef.current = next;
        return next;
      });
      dirtyRef.current.add(questionId);

      const existing = debounceTimersRef.current.get(questionId);
      if (existing) clearTimeout(existing);

      if (options?.immediate) {
        debounceTimersRef.current.delete(questionId);
        void enqueuePersist(questionId).catch(() => undefined);
        return;
      }

      const timer = setTimeout(() => {
        debounceTimersRef.current.delete(questionId);
        void enqueuePersist(questionId).catch(() => undefined);
      }, SAVE_DEBOUNCE_MS);
      debounceTimersRef.current.set(questionId, timer);
    },
    [enqueuePersist],
  );

  const doSubmit = useCallback(
    async (auto: boolean) => {
      setSubmitting(true);
      setError(null);
      try {
        if (auto) {
          // Time is up: submit whatever reached the server.
          await flushAllSavesRef.current().catch(() => undefined);
        } else {
          try {
            await flushAllSavesRef.current();
          } catch {
            setSubmitting(false);
            setError(
              'Còn câu chưa lưu được nên chưa nộp. Kiểm tra mạng rồi bấm Nộp bài lần nữa.',
            );
            return;
          }
        }
        await submitAttempt(attemptId);
        router.replace(`/results/${attemptId}${auto ? '?auto=1' : ''}`);
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ALREADY_SUBMITTED') {
          // Submitted from another tab or device.
          router.replace(`/results/${attemptId}`);
          return;
        }
        setSubmitting(false);
        if (isSessionExpiredError(err)) {
          setSessionExpired(true);
          setError('Phiên đăng nhập hết hạn. Đăng nhập lại rồi bấm Nộp bài.');
          return;
        }
        setError(
          auto
            ? 'Hết giờ nhưng nộp chưa xong. Bấm Nộp bài để thử lại.'
            : err instanceof ApiError
              ? err.message
              : 'Nộp bài thất bại. Kiểm tra mạng rồi bấm Nộp bài lần nữa.',
        );
      }
    },
    [attemptId, router],
  );

  useEffect(() => {
    if (
      remainingMs == null ||
      remainingMs > 0 ||
      detail?.attempt.status !== 'in_progress' ||
      autoSubmitStartedRef.current
    ) {
      return;
    }
    autoSubmitStartedRef.current = true;
    setConfirmOpen(false);
    void doSubmit(true);
  }, [remainingMs, detail, doSubmit]);

  const toggleFlag = useCallback((questionId: string) => {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }, []);

  const questions = useMemo(
    () => (detail ? [...detail.snapshot.questions].sort((a, b) => a.order - b.order) : []),
    [detail],
  );

  const activeWarning = currentTimeWarning(remainingMs);
  const showWarning =
    activeWarning != null && activeWarning !== dismissedWarning && !submitting;

  if (error && !detail) {
    return <p className="text-sm text-red-700">{error}</p>;
  }
  if (!detail) {
    return <p className="text-sm text-slate-500">Đang tải bài làm…</p>;
  }

  const isLesson = detail.snapshot.exam.type === 'lesson';
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  const unansweredIds = questions.filter((q) => !isAnswered(answers[q.id])).map((q) => q.id);
  const unsavedCount = Object.values(saveStates).filter((s) => s === 'error').length;
  const warningLabel = TIME_WARNINGS.find((w) => w.key === activeWarning)?.label;

  function jump(questionId: string) {
    setNavigatorOpen(false);
    scrollToQuestion(questionId);
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">
            <Link href="/dashboard" className="hover:text-accentDark">
              Trang chủ
            </Link>
            {' / '}
            Làm bài
          </p>
          <h1 className="font-display text-2xl font-bold text-ink">
            {detail.snapshot.exam.title}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-sm text-slate-600">
            <span>
              Đã trả lời {answeredCount}/{questions.length}
            </span>
            <SaveIndicator states={saveStates} lastSavedAt={lastSavedAt} />
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

      {showWarning && (
        <div
          className={`sticky top-2 z-30 flex items-center justify-between gap-3 rounded-md border px-4 py-2 text-sm shadow ${
            activeWarning === 'one'
              ? 'border-red-300 bg-red-50 text-red-800'
              : 'border-amber-300 bg-amber-50 text-amber-900'
          }`}
          role="alert"
        >
          <span>
            <strong>{warningLabel}.</strong> Bài sẽ tự nộp khi hết giờ; câu đã trả lời được lưu tự động.
          </span>
          <button
            type="button"
            onClick={() => setDismissedWarning(activeWarning)}
            className="rounded px-2 py-1 hover:bg-black/5"
            aria-label="Đóng cảnh báo"
          >
            ✕
          </button>
        </div>
      )}

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

      {isLesson ? (
        <LessonPlayer
          sections={detail.snapshot.sections}
          questions={questions}
          answers={answers}
          disabled={submitting}
          onChange={(questionId, value) => {
            const q = questions.find((item) => item.id === questionId);
            saveAnswer(questionId, value, { immediate: !(q && isTextLike(q.type)) });
          }}
          onCheck={checkAnswer}
        />
      ) : (
        <div className="space-y-4">
          {questions.map((q, i) => (
            <div key={q.id} id={`q-${q.id}`} className="scroll-mt-20 space-y-1">
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => toggleFlag(q.id)}
                  aria-pressed={flagged.has(q.id)}
                  className={`min-h-[44px] rounded-md px-3 text-xs ${
                    flagged.has(q.id)
                      ? 'bg-amber-100 text-amber-900'
                      : 'text-slate-500 hover:text-amber-800'
                  }`}
                >
                  {flagged.has(q.id) ? '⚑ Đã đánh dấu xem lại' : '⚐ Đánh dấu xem lại'}
                </button>
              </div>
              <AttemptQuestionCard
                question={q}
                index={i}
                value={answers[q.id] ?? null}
                onChange={(v) => saveAnswer(q.id, v, { immediate: !isTextLike(q.type) })}
                disabled={submitting}
              />
              {saveStates[q.id] === 'error' && (
                <p className="text-xs text-amber-700">
                  Câu này chưa lưu được, hệ thống đang thử lại. Câu trả lời của bạn vẫn được giữ.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-mist bg-white/95 backdrop-blur">
        {navigatorOpen && !isLesson && (
          <div className="mx-auto max-h-[50vh] max-w-5xl overflow-y-auto px-4 pt-4">
            <QuestionNavigator
              questions={questions}
              answers={answers}
              flagged={flagged}
              saveStates={saveStates}
              onJump={jump}
            />
          </div>
        )}
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          {!isLesson ? (
            <button
              type="button"
              onClick={() => setNavigatorOpen((v) => !v)}
              aria-expanded={navigatorOpen}
              className="min-h-[44px] rounded-md border border-mist px-3 text-sm hover:border-accent"
            >
              Bảng câu ({answeredCount}/{questions.length})
              {flagged.size > 0 && ` · ⚑ ${flagged.size}`}
            </button>
          ) : (
            <span className="text-sm text-slate-600">
              Đã trả lời {answeredCount}/{questions.length}
            </span>
          )}
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={submitting}
            className="min-h-[44px] rounded-md bg-accent px-5 text-sm font-medium text-white shadow hover:bg-accentDark disabled:opacity-60"
          >
            {submitting ? 'Đang nộp…' : 'Nộp bài'}
          </button>
        </div>
      </div>

      {sessionExpired && (
        <ReloginDialog
          onDone={() => {
            setSessionExpired(false);
            setError(null);
            void flushAllSavesRef.current().catch(() => undefined);
          }}
        />
      )}

      {confirmOpen && (
        <SubmitDialog
          unanswered={unansweredIds.length}
          flaggedCount={flagged.size}
          unsavedCount={unsavedCount}
          canJump={!isLesson}
          onJump={() => {
            setConfirmOpen(false);
            if (unansweredIds[0]) scrollToQuestion(unansweredIds[0]);
          }}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            void doSubmit(false);
          }}
        />
      )}
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
