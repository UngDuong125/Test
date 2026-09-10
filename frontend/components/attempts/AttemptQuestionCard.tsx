'use client';

import { useEffect, useRef, useState } from 'react';
import { ContentBlocksView, OptionContentView } from '@/components/questions/QuestionPreview';
import type { SnapshotQuestion, StudentAnswerValue } from '@/types/content';

function textFromValue(value: StudentAnswerValue): string {
  if (value == null) return '';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

export function AttemptQuestionCard({
  question,
  index,
  value,
  onChange,
  disabled,
}: {
  question: SnapshotQuestion;
  index: number;
  value: StudentAnswerValue;
  onChange: (value: StudentAnswerValue) => void;
  disabled?: boolean;
}) {
  const isChoice =
    question.type === 'multiple_choice' ||
    question.type === 'true_false' ||
    question.type === 'multiple_select';

  const isTextInput =
    question.type === 'fill_blank' ||
    question.type === 'short_answer' ||
    question.type === 'numeric';

  // Local draft + composition handling so Vietnamese IME (Telex/VNI) is not
  // interrupted by parent re-renders while composing diacritics.
  const [draft, setDraft] = useState(() => textFromValue(value));
  const composingRef = useRef(false);

  useEffect(() => {
    if (!composingRef.current) {
      setDraft(textFromValue(value));
    }
  }, [value]);

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
        <ul className="space-y-2">
          {question.options.map((opt) => {
            const multi = question.type === 'multiple_select';
            const selected = multi
              ? Array.isArray(value) && value.includes(opt.id)
              : value === opt.id;

            return (
              <li key={opt.id}>
                <label
                  className={`flex cursor-pointer gap-3 rounded-md border px-3 py-2 text-sm ${
                    selected ? 'border-accent bg-accent/5' : 'border-mist'
                  } ${disabled ? 'cursor-not-allowed opacity-70' : ''}`}
                >
                  <input
                    type={multi ? 'checkbox' : 'radio'}
                    name={`q-${question.id}`}
                    className="mt-0.5"
                    checked={selected}
                    disabled={disabled}
                    onChange={() => {
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
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-2 font-semibold text-accentDark">{opt.id}.</span>
                    <span className="inline-block align-top">
                      <OptionContentView content={opt.content} />
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
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
