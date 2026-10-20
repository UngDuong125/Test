'use client';

import { useMemo, useState } from 'react';
import { ContentBlocksView } from '@/components/questions/QuestionPreview';
import type { AnswerCheckResult, ExamSection, SnapshotQuestion, StudentAnswerValue } from '@/types/content';
import { AttemptQuestionCard } from './AttemptQuestionCard';

type Step =
  | { kind: 'theory'; section: ExamSection }
  | { kind: 'question'; question: SnapshotQuestion; index: number; sectionTitle: string };

function theoryBlocks(section: ExamSection) {
  if (section.content?.length) return section.content;
  if (section.description.trim()) {
    return [{ type: 'text' as const, value: section.description }];
  }
  return [];
}

export function buildLessonSteps(sections: ExamSection[], questions: SnapshotQuestion[]): Step[] {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const known = new Set(sorted.map((section) => section.id));
  const grouped = new Map<string, SnapshotQuestion[]>();
  const loose: SnapshotQuestion[] = [];
  for (const question of questions) {
    if (question.sectionId && known.has(question.sectionId)) {
      const list = grouped.get(question.sectionId) ?? [];
      list.push(question);
      grouped.set(question.sectionId, list);
    } else {
      loose.push(question);
    }
  }

  const steps: Step[] = [];
  let index = 0;
  for (const section of sorted) {
    if (theoryBlocks(section).length > 0) {
      steps.push({ kind: 'theory', section });
    }
    for (const question of grouped.get(section.id) ?? []) {
      steps.push({ kind: 'question', question, index, sectionTitle: section.title });
      index += 1;
    }
  }
  for (const question of loose) {
    steps.push({ kind: 'question', question, index, sectionTitle: '' });
    index += 1;
  }
  return steps;
}

export function LessonPlayer({
  sections,
  questions,
  answers,
  disabled,
  onChange,
  onCheck,
}: {
  sections: ExamSection[];
  questions: SnapshotQuestion[];
  answers: Record<string, StudentAnswerValue>;
  disabled?: boolean;
  onChange: (questionId: string, value: StudentAnswerValue) => void;
  onCheck: (questionId: string, value: StudentAnswerValue) => Promise<AnswerCheckResult>;
}) {
  const steps = useMemo(() => buildLessonSteps(sections, questions), [questions, sections]);
  const [cursor, setCursor] = useState(0);
  const [feedback, setFeedback] = useState<AnswerCheckResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const step = steps[cursor] ?? null;

  if (!step) {
    return <p className="text-sm text-slate-500">Bài học chưa có nội dung.</p>;
  }

  const pairMarks = Object.fromEntries((feedback?.pairs ?? []).map((item) => [item.leftId, item.correct]));
  const positionMarks = feedback?.positions?.map((item) => item.correct);

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        Bước {cursor + 1}/{steps.length}
        {step.kind === 'question' && step.sectionTitle ? ` · ${step.sectionTitle}` : ''}
      </p>

      {step.kind === 'theory' ? (
        <section className="space-y-3 rounded-xl border border-mist bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-ink">{step.section.title}</h2>
          <ContentBlocksView blocks={theoryBlocks(step.section)} />
        </section>
      ) : (
        <AttemptQuestionCard
          question={step.question}
          index={step.index}
          value={answers[step.question.id] ?? null}
          disabled={disabled || checking}
          pairMarks={feedback?.pairs ? pairMarks : undefined}
          positionMarks={feedback?.positions ? positionMarks : undefined}
          onChange={(value) => {
            setFeedback(null);
            setCheckError(null);
            onChange(step.question.id, value);
          }}
        />
      )}

      {checkError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {checkError}
        </p>
      )}

      {feedback && (
        <p
          className={`rounded-md border px-3 py-2 text-sm ${
            feedback.requiresManual
              ? 'border-mist bg-paper text-slate-700'
              : feedback.isCorrect
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : feedback.pointsEarned > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {feedback.requiresManual
            ? 'Câu này được chấm sau khi nộp bài.'
            : feedback.isCorrect
              ? `Đúng · ${feedback.pointsEarned}/${feedback.points} điểm`
              : feedback.pointsEarned > 0
                ? `Đúng một phần · ${feedback.pointsEarned}/${feedback.points} điểm`
                : `Chưa đúng · ${feedback.pointsEarned}/${feedback.points} điểm`}
        </p>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <button
          type="button"
          disabled={cursor === 0}
          onClick={() => {
            setFeedback(null);
            setCheckError(null);
            setCursor((current) => Math.max(0, current - 1));
          }}
          className="rounded-md border border-mist px-3 py-2 text-sm disabled:opacity-40"
        >
          Quay lại
        </button>
        <div className="flex gap-2">
          {step.kind === 'question' && (
            <button
              type="button"
              disabled={disabled || checking}
              onClick={() => {
                setChecking(true);
                setCheckError(null);
                void onCheck(step.question.id, answers[step.question.id] ?? null)
                  .then(setFeedback)
                  .catch((err: unknown) => {
                    setCheckError(err instanceof Error ? err.message : 'Không kiểm tra được');
                  })
                  .finally(() => setChecking(false));
              }}
              className="rounded-md border border-accent px-3 py-2 text-sm font-medium text-accentDark disabled:opacity-60"
            >
              {checking ? 'Đang kiểm tra…' : 'Kiểm tra'}
            </button>
          )}
          <button
            type="button"
            disabled={cursor >= steps.length - 1}
            onClick={() => {
              setFeedback(null);
              setCheckError(null);
              setCursor((current) => Math.min(steps.length - 1, current + 1));
            }}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {step.kind === 'theory' ? 'Làm bài tập' : 'Tiếp tục'}
          </button>
        </div>
      </div>
    </div>
  );
}
