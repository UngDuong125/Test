'use client';

import { useMemo, useState } from 'react';
import { RichText } from '@/components/questions/QuestionPreview';
import { ApiError, createVocabularyEntry } from '@/lib/api-client';
import {
  VOCAB_PASTE_EXAMPLE,
  VOCAB_PASTE_HELP,
  parseBulkVocabularyText,
} from '@/lib/bulk-vocabulary-text';
import type { TagKey } from '@/types/auth';

export function BulkVocabularyImport({
  subjectId,
  grade,
  bankId,
  status,
  onCreated,
}: {
  subjectId: TagKey;
  grade: number;
  bankId: string;
  status: 'draft' | 'published';
  onCreated: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(VOCAB_PASTE_EXAMPLE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const parsed = useMemo(() => parseBulkVocabularyText(text), [text]);
  const okItems = parsed.filter((item) => item.ok);
  const errItems = parsed.filter((item) => !item.ok);

  async function createAll() {
    if (!okItems.length || errItems.length) return;
    setBusy(true);
    setError(null);
    setDone(null);
    let created = 0;
    try {
      for (const item of okItems) {
        if (!item.ok) continue;
        await createVocabularyEntry({
          subjectId,
          grade,
          term: item.entry.term,
          reading: item.entry.reading,
          definition: item.entry.definition,
          example: item.entry.example,
          status,
          bankId,
        });
        created += 1;
      }
      setText('');
      setDone(`Đã thêm ${created} từ.`);
      await onCreated();
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `Dừng sau ${created} từ: ${err.message}`
          : `Dừng sau ${created} từ`,
      );
      if (created) await onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed border-mist p-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="text-sm font-medium text-accentDark hover:underline"
      >
        {open ? 'Ẩn dán text' : 'Dán nhiều từ'}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          <p className="whitespace-pre-wrap text-xs text-slate-600">{VOCAB_PASTE_HELP}</p>
          <textarea
            rows={8}
            spellCheck={false}
            disabled={busy}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setDone(null);
              setError(null);
            }}
            className="w-full rounded-md border border-mist px-3 py-2 font-mono text-xs leading-relaxed"
          />
          <p className="text-xs text-slate-500">
            {okItems.length} từ hợp lệ
            {errItems.length ? ` · ${errItems.length} lỗi` : ''}
          </p>
          {parsed.length > 0 && (
            <ul className="max-h-40 space-y-1 overflow-y-auto text-xs">
              {parsed.map((item) =>
                item.ok ? (
                  <li key={item.index} className="text-slate-700">
                    <RichText value={item.entry.term} />
                    {item.entry.reading ? ` /${item.entry.reading}/` : ''} —{' '}
                    <RichText value={item.entry.definition} />
                  </li>
                ) : (
                  <li key={item.index} className="text-red-700">
                    {item.message}
                  </li>
                ),
              )}
            </ul>
          )}
          {error && <p className="text-sm text-red-700">{error}</p>}
          {done && <p className="text-sm text-emerald-700">{done}</p>}
          <button
            type="button"
            disabled={busy || !okItems.length || errItems.length > 0}
            onClick={() => void createAll()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accentDark disabled:opacity-60"
          >
            {busy ? 'Đang thêm…' : 'Thêm các từ hợp lệ'}
          </button>
        </div>
      )}
    </div>
  );
}
