'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import { RichText } from '@/components/questions/QuestionPreview';
import { MatchGame } from '@/components/vocabulary/MatchGame';
import { ReviewChallenge } from '@/components/vocabulary/ReviewChallenge';
import { SpeakButton } from '@/components/vocabulary/SpeakButton';
import { ExtraPractice } from '@/components/vocabulary/ExtraPractice';
import {
  ApiError,
  getMyVocabularyStats,
  listMyDueVocabulary,
  reviewVocabularyCard,
} from '@/lib/api-client';
import type { DueVocabularyCard } from '@/types/content';

const INTERVAL_LABELS = ['1 ngày', '3 ngày', '7 ngày', '14 ngày', '30 ngày'];
const LAST_STEP = INTERVAL_LABELS.length - 1;
const PREFETCH_AT = 5;

type VocabStats = {
  total: number;
  learning: number;
  mastered: number;
  due: number;
  streak?: number;
  reviewedToday?: number;
};

type ReviewResult = 'pass' | 'fail' | 'hard';

const GOAL_KEY = 'testarchive:vocab-daily-goal';
const DEFAULT_GOAL = 10;

function readGoal(): number {
  try {
    const n = Number(window.localStorage.getItem(GOAL_KEY));
    return Number.isInteger(n) && n > 0 && n <= 500 ? n : DEFAULT_GOAL;
  } catch {
    return DEFAULT_GOAL;
  }
}

const DUE_PAGE = 30;

type ReviewMode = 'flashcard' | 'quiz' | 'typing' | 'match';
const MODES: { id: ReviewMode; label: string }[] = [
  { id: 'flashcard', label: 'Flashcard' },
  { id: 'quiz', label: 'Trắc nghiệm' },
  { id: 'typing', label: 'Gõ từ' },
  { id: 'match', label: 'Nối từ' },
];

type DuePage = { items: DueVocabularyCard[]; dueCount: number };

function startPreload(): Promise<DuePage> {
  const due = listMyDueVocabulary();
  due.catch(() => {});
  return due;
}

function pageCursor(items: DueVocabularyCard[]): { after?: string; afterId?: string } {
  const last = items[items.length - 1];
  if (!last) return {};
  return { after: last.card.nextReviewAt, afterId: last.card.id };
}

function VocabularyReviewBody({ preload }: { preload: Promise<DuePage> }) {
  const [queue, setQueue] = useState<DueVocabularyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<VocabStats | null>(null);
  const [sessionDone, setSessionDone] = useState(0);
  const [mode, setMode] = useState<ReviewMode>('flashcard');
  const [goal, setGoal] = useState(DEFAULT_GOAL);
  const [extraOpen, setExtraOpen] = useState(false);

  useEffect(() => {
    setGoal(readGoal());
  }, []);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [pullTick, setPullTick] = useState(0);
  const usedPreload = useRef(false);
  const reviewedIds = useRef(new Set<string>());
  const prefetching = useRef<Promise<void> | null>(null);
  const hasMoreRef = useRef(false);
  const sessionDoneRef = useRef(0);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  sessionDoneRef.current = sessionDone;

  const markHasMore = useCallback((value: boolean) => {
    hasMoreRef.current = value;
    setHasMore(value);
  }, []);

  const prefetchMore = useCallback(() => {
    if (prefetching.current) return;
    const startedEmpty = queueRef.current.length === 0;
    const cursor = pageCursor(queueRef.current);
    const run = listMyDueVocabulary(cursor)
      .then((due) => {
        const seen = new Set(queueRef.current.map((item) => item.card.id));
        for (const id of reviewedIds.current) seen.add(id);
        const extra = due.items.filter((item) => !seen.has(item.card.id));
        if (extra.length) {
          setQueue((current) => {
            const known = new Set(current.map((item) => item.card.id));
            const fresh = extra.filter((item) => !known.has(item.card.id));
            return fresh.length ? [...current, ...fresh] : current;
          });
        }
        markHasMore(extra.length > 0 && due.items.length >= DUE_PAGE);
      })
      .catch(() => {
        if (startedEmpty) markHasMore(false);
      })
      .finally(() => {
        if (prefetching.current === run) prefetching.current = null;
        setPullTick((n) => n + 1);
      });
    prefetching.current = run;
  }, [markHasMore]);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    const fresh = usedPreload.current;
    usedPreload.current = true;
    const duePromise = fresh ? listMyDueVocabulary() : preload;
    try {
      const due = await duePromise;
      markHasMore(due.items.length >= DUE_PAGE && due.dueCount > due.items.length);
      if (force || sessionDoneRef.current === 0) {
        reviewedIds.current.clear();
        setQueue(due.items);
        setIndex(0);
        setFlipped(false);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được thẻ due');
    } finally {
      setLoading(false);
    }
    const st = await getMyVocabularyStats().catch(() => null);
    if (st) {
      const reviewed = force ? 0 : sessionDoneRef.current;
      setStats((current) => {
        if (reviewed === 0) return st;
        if (current) return current;
        return { ...st, due: Math.max(0, st.due - reviewed) };
      });
    }
  }, [markHasMore, preload]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyStats = useCallback((result: ReviewResult, intervalStep: number, dir: 1 | -1) => {
    const mastered = result === 'pass' && intervalStep >= LAST_STEP;
    setStats((current) => {
      if (!current) return current;
      const before = current.reviewedToday ?? 0;
      const after = Math.max(0, before + dir);
      // The first review of the day extends the streak; undoing it takes it back.
      const streakDelta = before === 0 && after > 0 ? 1 : before > 0 && after === 0 ? -1 : 0;
      return {
        ...current,
        due: Math.max(0, current.due - dir),
        learning: mastered ? current.learning - dir : current.learning,
        mastered: mastered ? current.mastered + dir : current.mastered,
        reviewedToday: after,
        streak: current.streak != null ? Math.max(0, current.streak + streakDelta) : current.streak,
      };
    });
  }, []);

  /** Record a result for the current card (flashcard, quiz and typing all end here). */
  const submitReview = useCallback(
    (result: ReviewResult) => {
      const card = queueRef.current[index];
      if (!card) return;
      if (reviewedIds.current.has(card.card.id)) return;
      reviewedIds.current.add(card.card.id);

      const nextQueue = queueRef.current.filter((item) => item.card.id !== card.card.id);
      setQueue(nextQueue);
      setFlipped(false);
      setSessionDone((n) => n + 1);
      setError(null);
      applyStats(result, card.card.intervalStep, 1);
      if (hasMoreRef.current && nextQueue.length - index <= PREFETCH_AT) prefetchMore();

      setPendingSaves((n) => n + 1);
      void reviewVocabularyCard(card.card.id, result)
        .catch((err) => {
          reviewedIds.current.delete(card.card.id);
          setQueue((current) => [card, ...current.filter((item) => item.card.id !== card.card.id)]);
          setIndex(0);
          setFlipped(true);
          setSessionDone((n) => Math.max(0, n - 1));
          applyStats(result, card.card.intervalStep, -1);
          setError(err instanceof ApiError ? err.message : 'Ghi nhận thất bại');
        })
        .finally(() => {
          setPendingSaves((n) => n - 1);
        });
    },
    [applyStats, index, prefetchMore],
  );

  const onReview = useCallback(
    (result: ReviewResult) => {
      if (!flipped) return;
      submitReview(result);
    },
    [flipped, submitReview],
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (mode !== 'flashcard') return;
      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        if (!flipped && queueRef.current[index]) setFlipped(true);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        onReview('fail');
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        onReview('pass');
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        onReview('hard');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, index, mode, onReview]);

  const current = queue[index] ?? null;
  const remaining = Math.max(0, queue.length - index);

  useEffect(() => {
    if (loading || current || pendingSaves > 0 || !hasMore) return;
    prefetchMore();
  }, [current, hasMore, loading, pendingSaves, prefetchMore, pullTick]);

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Ôn từ vựng</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lặp lại ngắt quãng · mốc {INTERVAL_LABELS.join(' → ')} → đã thuộc
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="flex flex-wrap rounded-lg bg-slate-100 p-0.5 text-xs font-medium"
            role="tablist"
            aria-label="Cách ôn"
          >
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="tab"
                aria-selected={mode === m.id}
                onClick={() => {
                  setMode(m.id);
                  setFlipped(false);
                }}
                className={`rounded-md px-3 py-1.5 ${mode === m.id ? 'bg-white text-ink shadow-sm' : 'text-slate-600'}`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <Link href="/dashboard" className="text-sm text-accentDark hover:underline">
            ← Trang chủ
          </Link>
        </div>
      </div>

      {stats && (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <span className="font-medium text-ink" title="Số ngày liên tiếp có ôn ít nhất một thẻ">
            🔥 Chuỗi {stats.streak ?? 0} ngày
          </span>
          <span className="flex items-center gap-2 text-slate-600">
            Hôm nay {stats.reviewedToday ?? 0}/{goal}
            <span
              className="inline-block h-2 w-24 overflow-hidden rounded-full bg-mist"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={goal}
              aria-valuenow={Math.min(stats.reviewedToday ?? 0, goal)}
              aria-label="Mục tiêu hôm nay"
            >
              <span
                className="block h-2 rounded-full bg-accent"
                style={{ width: `${Math.min(100, ((stats.reviewedToday ?? 0) / goal) * 100)}%` }}
              />
            </span>
            {(stats.reviewedToday ?? 0) >= goal && <span className="text-emerald-700">✓ Đạt mục tiêu</span>}
          </span>
          <label className="flex items-center gap-1 text-xs text-slate-500">
            Mục tiêu
            <input
              type="number"
              min={1}
              max={500}
              value={goal}
              onChange={(e) => {
                const n = Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || DEFAULT_GOAL)));
                setGoal(n);
                try {
                  window.localStorage.setItem(GOAL_KEY, String(n));
                } catch {
                  // per-device convenience only
                }
              }}
              className="w-14 rounded border border-mist px-1 py-0.5"
            />
            thẻ/ngày
          </label>
        </div>
      )}

      {stats && (
        <p className="mb-4 text-sm text-slate-500">
          Đến hạn: {stats.due} · Đang học: {stats.learning} · Đã thuộc: {stats.mastered} · Tổng thẻ:{' '}
          {stats.total}
          {sessionDone > 0 && ` · Đã ôn phiên này: ${sessionDone}`}
          {pendingSaves > 0 && ' · Đang lưu…'}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : extraOpen ? (
        <ExtraPractice onClose={() => setExtraOpen(false)} />
      ) : mode === 'match' ? (
        <MatchGame items={queue.slice(index)} />
      ) : !current ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-mist bg-white px-6 py-16 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold text-ink">
            {pendingSaves > 0 || hasMore ? 'Đang lấy thẻ tiếp…' : 'Đã xong hôm nay'}
          </p>
          <p className="mt-2 max-w-sm text-sm text-slate-600">
            {pendingSaves > 0 || hasMore
              ? 'Thẻ tiếp theo sẽ hiện ngay khi danh sách được cập nhật.'
              : 'Không còn thẻ đến hạn. Quay lại khi đến mốc ôn tiếp theo, hoặc chờ giáo viên giao bộ từ mới.'}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {!(pendingSaves > 0 || hasMore) && (
              <button
                type="button"
                onClick={() => setExtraOpen(true)}
                className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
              >
                Ôn thêm (không đổi lịch ôn)
              </button>
            )}
            <button
              type="button"
              onClick={() => void load(true)}
              className="rounded-md border border-mist px-4 py-2 text-sm hover:border-accent"
            >
              Làm mới
            </button>
          </div>
        </div>
      ) : mode === 'quiz' || mode === 'typing' ? (
        <div className="flex flex-1 flex-col">
          <p className="mb-3 text-sm text-slate-500">
            Còn {remaining} thẻ
            {current.bankName ? ` · ${current.bankName}` : ''} · kết quả được ghi như Thuộc / Không thuộc
          </p>
          <ReviewChallenge
            key={`${mode}:${current.card.id}`}
            mode={mode}
            card={current}
            pool={queue}
            onDone={submitReview}
          />
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="mb-3 text-sm text-slate-500">
            Còn {remaining} thẻ
            {current.bankName ? ` · ${current.bankName}` : ''}
          </p>

          <div
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((value) => !value)}
            className="group relative flex min-h-[280px] flex-1 cursor-pointer flex-col items-center justify-center rounded-2xl border border-mist bg-gradient-to-b from-white to-slate-50 px-6 py-10 text-center shadow-sm transition hover:border-accent"
          >
            {!flipped ? (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-400">Mặt trước</p>
                <p className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
                  <RichText value={current.entry.term} />
                </p>
                {current.entry.reading && (
                  <p className="mt-3 text-lg text-slate-500">/{current.entry.reading}/</p>
                )}
                <div className="mt-2">
                  <SpeakButton text={current.entry.term} subjectId={current.entry.subjectId} />
                </div>
                <p className="mt-6 text-sm text-slate-400 group-hover:text-accentDark">
                  Nhấn hoặc phím cách để lật thẻ
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-400">Mặt sau</p>
                <div className="mt-1 flex items-center gap-1 text-slate-600">
                  <RichText value={current.entry.term} />
                  <SpeakButton text={current.entry.term} subjectId={current.entry.subjectId} />
                </div>
                <p className="mt-4 font-display text-3xl font-semibold text-ink">
                  <RichText value={current.entry.definition} />
                </p>
                {current.entry.example && (
                  <p className="mt-4 max-w-md text-base italic text-slate-600">
                    <RichText value={current.entry.example} />
                  </p>
                )}
                <p className="mt-6 text-xs text-slate-400">
                  Mốc hiện tại: {INTERVAL_LABELS[current.card.intervalStep] ?? '—'}
                </p>
              </>
            )}
          </div>

          {flipped && (
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => onReview('fail')}
                className="flex-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                Không thuộc
                <span className="mt-0.5 block text-xs font-normal text-red-500">← · về 1 ngày</span>
              </button>
              <button
                type="button"
                onClick={() => onReview('hard')}
                className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900 hover:bg-amber-100"
              >
                Khó nhớ
                <span className="mt-0.5 block text-xs font-normal text-amber-700">
                  ↓ · giữ mốc {INTERVAL_LABELS[current.card.intervalStep] ?? ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onReview('pass')}
                className="flex-1 rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accentDark"
              >
                Thuộc
                <span className="mt-0.5 block text-xs font-normal text-white/80">→</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VocabularyReviewPage() {
  const [preload] = useState(startPreload);
  return (
    <AuthGate roles={['student']}>
      <VocabularyReviewBody preload={preload} />
    </AuthGate>
  );
}
