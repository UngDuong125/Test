'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AuthGate } from '@/components/auth/AuthGate';
import {
  ApiError,
  getMyVocabularyStats,
  listMyDueVocabulary,
  reviewVocabularyCard,
} from '@/lib/api-client';
import type { DueVocabularyCard } from '@/types/content';

const INTERVAL_LABELS = ['1 ngày', '3 ngày', '7 ngày', '14 ngày', '30 ngày'];

function VocabularyReviewBody() {
  const [queue, setQueue] = useState<DueVocabularyCard[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{
    total: number;
    learning: number;
    mastered: number;
    due: number;
  } | null>(null);
  const [sessionDone, setSessionDone] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [due, st] = await Promise.all([
        listMyDueVocabulary(),
        getMyVocabularyStats().catch(() => null),
      ]);
      setQueue(due.items);
      setIndex(0);
      setFlipped(false);
      if (st) setStats(st);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không tải được thẻ due');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = queue[index] ?? null;
  const remaining = Math.max(0, queue.length - index);

  async function onReview(result: 'pass' | 'fail') {
    if (!current || busy) return;
    setBusy(true);
    setError(null);
    try {
      await reviewVocabularyCard(current.card.id, result);
      setSessionDone((n) => n + 1);
      setFlipped(false);
      if (index + 1 >= queue.length) {
        setIndex(queue.length);
        const refreshed = await listMyDueVocabulary();
        setQueue(refreshed.items);
        setIndex(0);
        const st = await getMyVocabularyStats().catch(() => null);
        if (st) setStats(st);
      } else {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Ghi nhận thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col px-4 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">Ôn từ vựng</h1>
          <p className="mt-1 text-sm text-slate-600">
            Lặp lại ngắt quãng · mốc {INTERVAL_LABELS.join(' → ')} → đã thuộc
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-accentDark hover:underline">
          ← Dashboard
        </Link>
      </div>

      {stats && (
        <p className="mb-4 text-sm text-slate-500">
          Due: {stats.due} · Đang học: {stats.learning} · Đã thuộc: {stats.mastered} · Tổng thẻ:{' '}
          {stats.total}
          {sessionDone > 0 && ` · Đã ôn phiên này: ${sessionDone}`}
        </p>
      )}

      {error && (
        <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : !current ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-mist bg-white px-6 py-16 text-center shadow-sm">
          <p className="font-display text-2xl font-semibold text-ink">Đã xong hôm nay</p>
          <p className="mt-2 max-w-sm text-sm text-slate-600">
            Không còn thẻ đến hạn. Quay lại khi đến mốc ôn tiếp theo, hoặc chờ giáo viên giao bộ từ
            mới.
          </p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-6 rounded-md border border-mist px-4 py-2 text-sm hover:border-accent"
          >
            Làm mới
          </button>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <p className="mb-3 text-sm text-slate-500">
            Còn {remaining} thẻ
            {current.bankName ? ` · ${current.bankName}` : ''}
          </p>

          <button
            type="button"
            onClick={() => setFlipped((f) => !f)}
            className="group relative flex min-h-[280px] flex-1 flex-col items-center justify-center rounded-2xl border border-mist bg-gradient-to-b from-white to-slate-50 px-6 py-10 text-center shadow-sm transition hover:border-accent"
          >
            {!flipped ? (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-400">Mặt trước</p>
                <p className="mt-4 font-display text-4xl font-bold text-ink sm:text-5xl">
                  {current.entry.term}
                </p>
                {current.entry.reading && (
                  <p className="mt-3 text-lg text-slate-500">/{current.entry.reading}/</p>
                )}
                <p className="mt-8 text-sm text-slate-400 group-hover:text-accentDark">
                  Nhấn để lật thẻ
                </p>
              </>
            ) : (
              <>
                <p className="text-xs uppercase tracking-wide text-slate-400">Mặt sau</p>
                <p className="mt-4 font-display text-3xl font-semibold text-ink">
                  {current.entry.definition}
                </p>
                {current.entry.example && (
                  <p className="mt-4 max-w-md text-base italic text-slate-600">
                    {current.entry.example}
                  </p>
                )}
                <p className="mt-6 text-xs text-slate-400">
                  Mốc hiện tại: {INTERVAL_LABELS[current.card.intervalStep] ?? '—'}
                </p>
              </>
            )}
          </button>

          {flipped && (
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReview('fail')}
                className="flex-1 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                Không thuộc
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void onReview('pass')}
                className="flex-1 rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-60"
              >
                Thuộc
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function VocabularyReviewPage() {
  return (
    <AuthGate roles={['student']}>
      <VocabularyReviewBody />
    </AuthGate>
  );
}
