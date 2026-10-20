'use client';

import { useEffect, useRef, useState } from 'react';
import { ContentBlocksView, OptionContentView } from '@/components/questions/QuestionPreview';
import { isPairMap } from '@/lib/answer-display';
import type { SnapshotQuestion, StudentAnswerValue } from '@/types/content';

function textFromValue(value: StudentAnswerValue): string {
  if (value == null || typeof value === 'object') return '';
  if (typeof value === 'number') return String(value);
  return value;
}

const LEFT_ID = /^L[1-9]\d*$/;
const RIGHT_ID = /^R[1-9]\d*$/;

export function AttemptQuestionCard({
  question,
  index,
  value,
  onChange,
  disabled,
  pairMarks,
  positionMarks,
}: {
  question: SnapshotQuestion;
  index: number;
  value: StudentAnswerValue;
  onChange: (value: StudentAnswerValue) => void;
  disabled?: boolean;
  pairMarks?: Record<string, boolean>;
  positionMarks?: boolean[];
}) {
  const isChoice =
    question.type === 'multiple_choice' ||
    question.type === 'true_false' ||
    question.type === 'multiple_select';

  const isTextInput =
    question.type === 'fill_blank' ||
    question.type === 'short_answer' ||
    question.type === 'numeric';

  const [draft, setDraft] = useState(() => textFromValue(value));
  const composingRef = useRef(false);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const seededFor = useRef<string | null>(null);

  useEffect(() => {
    if (!composingRef.current) {
      setDraft(textFromValue(value));
    }
  }, [value]);

  useEffect(() => {
    if (question.type !== 'ordering' || disabled) return;
    if (Array.isArray(value) && value.length > 0) {
      seededFor.current = question.id;
      return;
    }
    if (seededFor.current === question.id) return;
    seededFor.current = question.id;
    onChange(question.options.map((opt) => opt.id));
  }, [disabled, onChange, question.id, question.options, question.type, value]);

  const pairs = isPairMap(value) ? value : {};
  const leftOptions = question.options.filter((opt) => LEFT_ID.test(opt.id));
  const rightOptions = question.options.filter((opt) => RIGHT_ID.test(opt.id));
  const orderIds =
    Array.isArray(value) && value.length > 0 ? value : question.options.map((opt) => opt.id);

  function move(from: number, direction: -1 | 1) {
    const nextIndex = from + direction;
    if (nextIndex < 0 || nextIndex >= orderIds.length) return;
    const next = [...orderIds];
    const current = next[from]!;
    next[from] = next[nextIndex]!;
    next[nextIndex] = current;
    onChange(next);
  }

  function pairWith(rightId: string) {
    if (!selectedLeft || disabled) return;
    const next = { ...pairs };
    for (const [leftId, chosen] of Object.entries(next)) {
      if (chosen === rightId) delete next[leftId];
    }
    next[selectedLeft] = rightId;
    setSelectedLeft(null);
    onChange(next);
  }

  return (
    <div className="space-y-4 rounded-xl border border-mist bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold text-ink">
          Câu {index + 1}
          <span className="ml-2 font-normal text-slate-500">
            ({question.points} điểm · {question.type})
          </span>
        </p>
      </div>

      <ContentBlocksView blocks={question.content} />

      {isChoice && question.options.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-500">
            {question.type === 'multiple_select'
              ? 'Chọn mọi thẻ đúng.'
              : 'Chọn một thẻ.'}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {question.options.map((opt) => {
              const multi = question.type === 'multiple_select';
              const selected = multi
                ? Array.isArray(value) && value.includes(opt.id)
                : value === opt.id;
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      if (disabled) return;
                      if (multi) {
                        const current = Array.isArray(value) ? value : [];
                        onChange(
                          selected
                            ? current.filter((id) => id !== opt.id)
                            : [...current, opt.id],
                        );
                      } else {
                        onChange(opt.id);
                      }
                    }}
                    className={`flex h-full w-full gap-3 rounded-xl border px-3 py-3 text-left text-sm transition ${
                      selected
                        ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
                        : 'border-mist bg-white hover:border-accent'
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    <span className="font-semibold text-accentDark">{opt.id}</span>
                    <span className="min-w-0 flex-1">
                      <OptionContentView content={opt.content} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {question.type === 'matching' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Chọn vế trái</p>
            {leftOptions.map((opt) => {
              const chosen = pairs[opt.id];
              const mark = pairMarks?.[opt.id];
              const active = selectedLeft === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setSelectedLeft((current) => (current === opt.id ? null : opt.id))}
                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                    mark === true
                      ? 'border-emerald-500 bg-emerald-50'
                      : mark === false
                        ? 'border-red-300 bg-red-50'
                        : active
                          ? 'border-accent bg-accent/10 ring-2 ring-accent/30'
                          : 'border-mist hover:border-accent'
                  }`}
                >
                  <OptionContentView content={opt.content} />
                  <p className="mt-1 text-xs text-slate-500">
                    {chosen
                      ? `Đã nối: ${rightOptions.find((item) => item.id === chosen)?.id ?? chosen}`
                      : 'Chưa nối'}
                  </p>
                </button>
              );
            })}
          </div>
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rồi chọn vế phải</p>
            {rightOptions.map((opt) => {
              const usedBy = Object.entries(pairs).find(([, rightId]) => rightId === opt.id)?.[0];
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={disabled || !selectedLeft}
                  onClick={() => pairWith(opt.id)}
                  className={`w-full rounded-xl border px-3 py-3 text-left text-sm ${
                    usedBy ? 'border-accent bg-accent/5' : 'border-mist hover:border-accent'
                  } disabled:cursor-not-allowed disabled:opacity-70`}
                >
                  <OptionContentView content={opt.content} />
                  {usedBy && <p className="mt-1 text-xs text-slate-500">Nối với {usedBy}</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {question.type === 'ordering' && (
        <ol className="space-y-2">
          {orderIds.map((id, itemIndex) => {
            const opt = question.options.find((item) => item.id === id);
            if (!opt) return null;
            const mark = positionMarks?.[itemIndex];
            return (
              <li
                key={id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
                  mark === true
                    ? 'border-emerald-500 bg-emerald-50'
                    : mark === false
                      ? 'border-red-300 bg-red-50'
                      : 'border-mist'
                }`}
              >
                <span className="w-6 text-sm font-semibold text-slate-500">{itemIndex + 1}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <OptionContentView content={opt.content} />
                </div>
                <button
                  type="button"
                  disabled={disabled || itemIndex === 0}
                  onClick={() => move(itemIndex, -1)}
                  className="rounded-md border border-mist px-2 py-1 text-xs disabled:opacity-40"
                >
                  Lên
                </button>
                <button
                  type="button"
                  disabled={disabled || itemIndex === orderIds.length - 1}
                  onClick={() => move(itemIndex, 1)}
                  className="rounded-md border border-mist px-2 py-1 text-xs disabled:opacity-40"
                >
                  Xuống
                </button>
              </li>
            );
          })}
        </ol>
      )}

      {isTextInput && (
        <input
          type={question.type === 'numeric' ? 'number' : 'text'}
          className="w-full rounded-md border border-mist px-3 py-2 text-sm"
          placeholder="Nhập câu trả lời…"
          disabled={disabled}
          value={draft}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const next = e.currentTarget.value;
            setDraft(next);
            if (disabled) return;
            if (question.type === 'numeric') {
              onChange(next === '' ? null : Number(next));
            } else {
              onChange(next);
            }
          }}
          onChange={(e) => {
            if (disabled) return;
            const next = e.target.value;
            setDraft(next);
            if (composingRef.current) return;
            if (question.type === 'numeric') {
              onChange(next === '' ? null : Number(next));
            } else {
              onChange(next);
            }
          }}
        />
      )}

      {question.type === 'essay' && (
        <textarea
          className="min-h-32 w-full rounded-md border border-mist px-3 py-2 text-sm"
          placeholder="Viết bài làm…"
          disabled={disabled}
          value={draft}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={(e) => {
            composingRef.current = false;
            const next = e.currentTarget.value;
            setDraft(next);
            if (!disabled) onChange(next);
          }}
          onChange={(e) => {
            if (disabled) return;
            const next = e.target.value;
            setDraft(next);
            if (!composingRef.current) onChange(next);
          }}
        />
      )}
    </div>
  );
}
