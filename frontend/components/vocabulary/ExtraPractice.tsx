'use client';

import { useEffect, useState } from 'react';
import { RichText } from '@/components/questions/QuestionPreview';
import { SpeakButton } from '@/components/vocabulary/SpeakButton';
import { ApiError, listExtraVocabulary } from '@/lib/api-client';
import type { DueVocabularyCard } from '@/types/content';

/**
 * Practice beyond today's due cards. Results are counted locally only: no review API
 * call, so the SRS schedule and EXP do not change.
 */
export function ExtraPractice({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<DueVocabularyCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);

  useEffect(() => {
    void listExtraVocabulary()
      .then((res) => setCards(res.items))
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Không tải được thẻ'))
      .finally(() => setLoading(false));
  }, []);

  const current = cards[index] ?? null;

  function next(remembered: boolean) {
    if (remembered) setKnown((n) => n + 1);
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  return (
    <div className="flex flex-1 flex-col space-y-4">
      <div className="flex items-center justify-between text-sm">
        <p className="text-slate-600">
          Ôn thêm · không đổi lịch ôn, không cộng EXP
          {cards.length > 0 && ` · ${Math.min(index + 1, cards.length)}/${cards.length}`}
        </p>
        <button type="button" onClick={onClose} className="text-accentDark hover:underline">
          ← Quay lại
        </button>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
      {loading ? (
        <p className="text-slate-500">Đang tải…</p>
      ) : cards.length === 0 ? (
        <p className="rounded-2xl border border-mist bg-white px-6 py-10 text-center text-sm text-slate-600">
          Chưa có thẻ nào để ôn thêm.
        </p>
      ) : !current ? (
        <div className="rounded-2xl border border-mist bg-white px-6 py-10 text-center">
          <p className="font-display text-2xl font-semibold text-ink">Xong!</p>
          <p className="mt-2 text-sm text-slate-600">
            Bạn nhớ {known}/{cards.length} thẻ.
          </p>
          <button
            type="button"
            onClick={() => {
              setIndex(0);
              setKnown(0);
              setFlipped(false);
            }}
            className="mt-4 rounded-md border border-mist px-4 py-2 text-sm hover:border-accent"
          >
            Ôn lại lượt nữa
          </button>
        </div>
      ) : (
        <>
          <div
            role="button"
            tabIndex={0}
            onClick={() => setFlipped((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                setFlipped((v) => !v);
              }
            }}
            className="flex min-h-[240px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-mist bg-gradient-to-b from-white to-slate-50 px-6 py-8 text-center shadow-sm hover:border-accent"
          >
            <p className="font-display text-4xl font-bold text-ink">
              <RichText value={current.entry.term} />
            </p>
            <SpeakButton text={current.entry.term} subjectId={current.entry.subjectId} />
            {flipped ? (
              <p className="mt-4 font-display text-2xl text-ink">
                <RichText value={current.entry.definition} />
              </p>
            ) : (
              <p className="mt-6 text-sm text-slate-400">Nhấn để xem nghĩa</p>
            )}
          </div>
          {flipped && (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => next(false)}
                className="flex-1 rounded-md border border-mist bg-white px-4 py-3 text-sm hover:border-accent"
              >
                Chưa nhớ
              </button>
              <button
                type="button"
                onClick={() => next(true)}
                className="flex-1 rounded-md bg-accent px-4 py-3 text-sm font-medium text-white hover:bg-accentDark"
              >
                Nhớ rồi
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
