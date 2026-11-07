'use client';

import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { RichText } from '@/components/questions/QuestionPreview';
import { SpeakButton } from '@/components/vocabulary/SpeakButton';
import { buildQuizOptions, isTypedAnswerCorrect } from '@/lib/vocab-modes';
import type { DueVocabularyCard } from '@/types/content';

/**
 * Multiple-choice (pick the meaning) or typing (write the word) review of one card.
 * The outcome is shown first; `onDone(result)` records it through the normal review API.
 */
export function ReviewChallenge({
  mode,
  card,
  pool,
  onDone,
}: {
  mode: 'quiz' | 'typing';
  card: DueVocabularyCard;
  pool: DueVocabularyCard[];
  onDone: (result: 'pass' | 'fail') => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<'pass' | 'fail' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  // Options stay fixed for this card even as the queue shrinks around it.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const options = useMemo(() => buildQuizOptions(card, pool), [card.card.id]);

  useEffect(() => {
    if (mode === 'typing') inputRef.current?.focus();
  }, [mode, card.card.id]);

  useEffect(() => {
    if (result) nextRef.current?.focus();
  }, [result]);

  if (mode === 'quiz' && !options) {
    return (
      <div className="space-y-4 rounded-2xl border border-mist bg-white p-6 text-center shadow-sm">
        <p className="text-sm text-slate-600">
          Cần ít nhất 2 thẻ có nghĩa khác nhau để làm trắc nghiệm. Hãy dùng Flashcard hoặc Gõ từ cho thẻ này.
        </p>
      </div>
    );
  }

  function onSubmitTyping(e: FormEvent) {
    e.preventDefault();
    if (result || !typed.trim()) return;
    setResult(isTypedAnswerCorrect(typed, card.entry.term) ? 'pass' : 'fail');
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-mist bg-gradient-to-b from-white to-slate-50 px-6 py-8 text-center shadow-sm">
        {mode === 'quiz' ? (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-400">Chọn nghĩa đúng</p>
            <p className="mt-3 font-display text-4xl font-bold text-ink">
              <RichText value={card.entry.term} />
            </p>
            {card.entry.reading && (
              <p className="mt-2 text-lg text-slate-500">/{card.entry.reading}/</p>
            )}
            <SpeakButton text={card.entry.term} subjectId={card.entry.subjectId} />
          </>
        ) : (
          <>
            <p className="text-xs uppercase tracking-wide text-slate-400">Gõ từ có nghĩa là</p>
            <p className="mt-3 font-display text-3xl font-semibold text-ink">
              <RichText value={card.entry.definition} />
            </p>
          </>
        )}
      </div>

      {mode === 'quiz' && options && (
        <div className="grid gap-3 sm:grid-cols-2">
          {options.map((o, i) => {
            const chosen = picked === o.cardId;
            const reveal = result != null;
            const tone = !reveal
              ? 'border-mist bg-white hover:border-accent'
              : o.correct
                ? 'border-emerald-400 bg-emerald-50'
                : chosen
                  ? 'border-red-300 bg-red-50'
                  : 'border-mist bg-white opacity-60';
            return (
              <button
                key={o.cardId}
                type="button"
                disabled={reveal}
                onClick={() => {
                  setPicked(o.cardId);
                  setResult(o.correct ? 'pass' : 'fail');
                }}
                className={`min-h-[56px] rounded-xl border px-4 py-3 text-left text-sm ${tone}`}
              >
                <span className="mr-2 text-xs text-slate-400">{i + 1}.</span>
                <RichText value={o.definition} />
                {reveal && o.correct && <span className="ml-2 text-emerald-700">✓ đúng</span>}
                {reveal && chosen && !o.correct && <span className="ml-2 text-red-700">✗ bạn chọn</span>}
              </button>
            );
          })}
        </div>
      )}

      {mode === 'typing' && (
        <form onSubmit={onSubmitTyping} className="flex gap-2">
          <input
            ref={inputRef}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={result != null}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="Nhập từ…"
            aria-label="Từ cần gõ"
            className="min-h-[48px] flex-1 rounded-md border border-mist px-3 text-lg focus:border-accent"
          />
          <button
            type="submit"
            disabled={result != null || !typed.trim()}
            className="rounded-md bg-accent px-4 text-sm font-medium text-white hover:bg-accentDark disabled:opacity-50"
          >
            Kiểm tra
          </button>
        </form>
      )}

      {result && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            result === 'pass'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          }`}
          role="status"
        >
          <p className="flex items-center gap-1 font-medium">
            {result === 'pass' ? '✓ Chính xác!' : '✗ Chưa đúng'}
            {/* Only after answering: in typing mode hearing the word would give it away. */}
            <SpeakButton text={card.entry.term} subjectId={card.entry.subjectId} />
          </p>
          {result === 'fail' && (
            <p className="mt-1">
              Đáp án: <strong><RichText value={card.entry.term} /></strong> —{' '}
              <RichText value={card.entry.definition} />
            </p>
          )}
          {card.entry.example && (
            <p className="mt-1 italic text-slate-700">
              <RichText value={card.entry.example} />
            </p>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={() => onDone(result)}
            className="mt-3 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accentDark"
          >
            Tiếp tục →
          </button>
        </div>
      )}
    </div>
  );
}
