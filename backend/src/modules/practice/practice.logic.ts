import { isAnswerKeyRevealAllowed, questionRequiresManualGrade } from '../grading/grading.logic.js';
import type { Attempt, AttemptSnapshotPayload, SnapshotQuestion } from '../../types/domain.js';

export interface PracticeSource {
  attempt: Attempt;
  snapshot: AttemptSnapshotPayload;
  /** Attempts left on the assignment (same count the result page uses). */
  remainingAttempts: number;
  /** Question ids answered wrong (is_correct = false) in this attempt. */
  wrongQuestionIds: Set<string>;
}

export interface PracticeItem {
  attemptId: string;
  examTitle: string;
  subjectId: string;
  question: SnapshotQuestion;
}

/** Same rule as the result page: answer keys only once they may be shown to the student. */
export function practiceAllowed(src: Pick<PracticeSource, 'attempt' | 'snapshot' | 'remainingAttempts'>) {
  return (
    src.attempt.status === 'graded' &&
    isAnswerKeyRevealAllowed({
      status: src.attempt.status,
      showExplanation: src.snapshot.effectiveSettings.showExplanation,
      forTeacher: false,
      remainingAttempts: src.remainingAttempts,
    })
  );
}

/**
 * Wrong, auto-gradable questions from attempts whose keys are unlocked, newest attempt
 * first, one entry per question. Answer and explanation are removed: they are only
 * returned by the check call, after the student answers.
 */
export function pickPracticeQuestions(sources: PracticeSource[], limit = 50): PracticeItem[] {
  const seen = new Set<string>();
  const out: PracticeItem[] = [];
  const ordered = [...sources].sort((a, b) =>
    (b.attempt.submittedAt ?? b.attempt.startedAt).localeCompare(a.attempt.submittedAt ?? a.attempt.startedAt),
  );
  for (const src of ordered) {
    if (!practiceAllowed(src)) continue;
    for (const q of [...src.snapshot.questions].sort((x, y) => x.order - y.order)) {
      if (out.length >= limit) return out;
      if (seen.has(q.id) || !src.wrongQuestionIds.has(q.id) || questionRequiresManualGrade(q)) continue;
      seen.add(q.id);
      const { answer: _answer, explanation: _explanation, ...rest } = q;
      out.push({
        attemptId: src.attempt.id,
        examTitle: src.snapshot.exam.title,
        subjectId: src.snapshot.exam.subjectId,
        question: rest,
      });
    }
  }
  return out;
}
