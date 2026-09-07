'use client';

import { ContentBlocksView, optionText } from '@/components/questions/QuestionPreview';
import type { SnapshotQuestion, StudentAnswerValue } from '@/types/content';

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
                    {optionText(opt)}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {(question.type === 'fill_blank' ||
        question.type === 'short_answer' ||
        question.type === 'numeric') && (
        <input
          type={question.type === 'numeric' ? 'number' : 'text'}
          className="w-full rounded-md border border-mist px-3 py-2 text-sm"
          placeholder="Nhập câu trả lời…"
          disabled={disabled}
          value={
            value == null
              ? ''
              : typeof value === 'number'
                ? String(value)
                : Array.isArray(value)
                  ? value.join(', ')
                  : value
          }
          onChange={(e) => {
            if (disabled) return;
            if (question.type === 'numeric') {
              const n = e.target.value === '' ? null : Number(e.target.value);
              onChange(n);
            } else {
              onChange(e.target.value);
            }
          }}
        />
      )}

      {question.type === 'essay' && (
        <textarea
          className="min-h-32 w-full rounded-md border border-mist px-3 py-2 text-sm"
          placeholder="Viết bài làm…"
          disabled={disabled}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => {
            if (!disabled) onChange(e.target.value);
          }}
        />
      )}
    </div>
  );
}
