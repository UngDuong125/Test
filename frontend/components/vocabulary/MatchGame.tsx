'use client';

import { useMemo, useState } from 'react';
import type { DueVocabularyCard } from '@/types/content';

function shuffle<T>(list: T[]): T[] {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = next[i]!;
    next[i] = next[j]!;
    next[j] = current;
  }
  return next;
}

export function MatchGame({ items }: { items: DueVocabularyCard[] }) {
  const pool = items.slice(0, 5);
  const poolKey = pool.map((item) => item.entry.id).join('|');
  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [locked, setLocked] = useState<Record<string, true>>({});
  const [wrongId, setWrongId] = useState<string | null>(null);

  const terms = useMemo(() => shuffle(pool), [poolKey, round]);
  const definitions = useMemo(() => shuffle(pool), [poolKey, round]);

  if (pool.length < 2) {
    return (
      <p className="rounded-xl border border-mist bg-white px-4 py-8 text-center text-sm text-slate-600">
        Cần ít nhất 2 từ đến hạn để chơi nối. Hãy ôn flashcard hoặc đợi thêm từ.
      </p>
    );
  }

  const done = Object.keys(locked).length === pool.length;

  function pickDefinition(entryId: string) {
    if (!selected || locked[entryId] || locked[selected]) return;
    if (selected === entryId) {
      setLocked((current) => ({ ...current, [entryId]: true }));
      setSelected(null);
      setWrongId(null);
      return;
    }
    setWrongId(entryId);
    window.setTimeout(() => {
      setWrongId(null);
      setSelected(null);
    }, 450);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Nối từ với nghĩa. Ván này không đổi lịch ôn và không cộng EXP.
        {items.length > pool.length ? ` Đang dùng ${pool.length} từ đến hạn đầu tiên.` : ''}
      </p>
      {done && (
        <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Nối đúng hết. Bạn vẫn nên lật flashcard để ghi nhận thuộc hoặc chưa thuộc.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          {terms.map((item) => {
            const id = item.entry.id;
            const isLocked = Boolean(locked[id]);
            return (
              <button
                key={id}
                type="button"
                disabled={isLocked}
                onClick={() => {
                  setWrongId(null);
                  setSelected(id);
                }}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                  isLocked
                    ? 'border-emerald-500 bg-emerald-50'
                    : selected === id
                      ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
                      : 'border-mist bg-white hover:border-accent'
                }`}
              >
                <span className="font-semibold text-ink">{item.entry.term}</span>
                {item.entry.reading && (
                  <span className="mt-1 block text-xs text-slate-500">/{item.entry.reading}/</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="space-y-2">
          {definitions.map((item) => {
            const id = item.entry.id;
            const isLocked = Boolean(locked[id]);
            return (
              <button
                key={id}
                type="button"
                disabled={isLocked || !selected}
                onClick={() => pickDefinition(id)}
                className={`w-full rounded-xl border px-3 py-3 text-left text-sm disabled:opacity-70 ${
                  isLocked
                    ? 'border-emerald-500 bg-emerald-50'
                    : wrongId === id
                      ? 'border-red-300 bg-red-50'
                      : 'border-mist bg-white hover:border-accent'
                }`}
              >
                {item.entry.definition}
              </button>
            );
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={() => {
          setRound((current) => current + 1);
          setSelected(null);
          setLocked({});
          setWrongId(null);
        }}
        className="rounded-md border border-mist px-3 py-1.5 text-sm hover:border-accent"
      >
        Xáo lại
      </button>
    </div>
  );
}
