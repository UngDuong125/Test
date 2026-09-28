'use client';

import { useEffect, useMemo, useState } from 'react';
import { QuestionPreview } from '@/components/questions/QuestionPreview';
import type { ExamQuestion, ExamSection, Question } from '@/types/content';

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  duration: number;
  totalPoints: number;
  instructions: string;
  sections: ExamSection[];
  questions: ExamQuestion[];
  questionMap: Record<string, Question>;
};

export function ExamPreviewModal({
  open,
  onClose,
  title,
  duration,
  totalPoints,
  instructions,
  sections,
  questions,
  questionMap,
}: Props) {
  const [showAnswer, setShowAnswer] = useState(true);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const groups = useMemo(() => {
    const sorted = [...questions].sort((a, b) => a.order - b.order);
    const orderedSections = [...sections].sort((a, b) => a.order - b.order);
    const known = new Set(orderedSections.map((s) => s.id));
    const result = orderedSections
      .map((s) => ({
        key: s.id,
        title: s.title,
        items: sorted.filter((eq) => eq.sectionId === s.id),
      }))
      .filter((g) => g.items.length > 0);
    const loose = sorted.filter((eq) => !eq.sectionId || !known.has(eq.sectionId));
    if (loose.length) result.push({ key: '__loose', title: '', items: loose });
    return result;
  }, [questions, sections]);

  if (!open) return null;

  const sumPoints = questions.reduce((acc, eq) => acc + eq.points, 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-3 sm:p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-preview-title"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-mist bg-paper shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-mist bg-white px-5 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Preview đề
            </p>
            <h2 id="exam-preview-title" className="truncate font-display text-lg font-bold text-ink">
              {title || 'Chưa đặt tên'}
            </h2>
            <p className="text-xs text-slate-500">
              {questions.length} câu · {duration === 0 ? 'không giới hạn' : `${duration} phút`} ·{' '}
              {totalPoints || sumPoints}đ
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showAnswer}
                onChange={(e) => setShowAnswer(e.target.checked)}
              />
              Hiện đáp án
            </label>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-mist px-3 py-1.5 text-sm text-slate-700 hover:border-accent hover:text-accentDark"
            >
              Thoát
            </button>
          </div>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {instructions.trim() && (
            <div className="rounded-md border border-mist bg-white px-3 py-2 text-sm text-slate-700">
              <p className="font-medium text-ink">Hướng dẫn</p>
              <p className="whitespace-pre-wrap">{instructions}</p>
            </div>
          )}

          {groups.map((group) => (
            <section key={group.key} className="space-y-3">
              {group.title && groups.length > 1 && (
                <h3 className="font-semibold text-ink">{group.title}</h3>
              )}
              {group.items.map((eq) => {
                const q = questionMap[eq.questionId];
                if (!q) return null;
                return (
                  <div key={eq.questionId}>
                    <p className="mb-1.5 text-xs font-medium text-slate-500">
                      Câu {eq.order} · {eq.points}đ
                    </p>
                    <QuestionPreview
                      content={q.content}
                      options={q.options}
                      answer={q.answer}
                      explanation={q.explanation}
                      showAnswer={showAnswer}
                    />
                  </div>
                );
              })}
            </section>
          ))}

          {!questions.length && (
            <p className="py-8 text-center text-sm text-slate-500">Chưa có câu để xem trước.</p>
          )}
        </div>
      </div>
    </div>
  );
}
