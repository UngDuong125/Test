import type {
  ExamType,
  QuestionAnswer,
  AttemptSnapshotPayload,
  SnapshotQuestion,
  StudentAnswerValue,
} from '../../types/domain.js';

/** Normalize short_answer / fill_blank text for comparison: lowercase, collapse spaces, strip trailing periods. */
function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\.+$/, '')
    .trim();
}

function arraysEqualAsSets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

export function questionRequiresManualGrade(q: SnapshotQuestion): boolean {
  if (q.requiresManualGrade) return true;
  if (q.type === 'essay') return true;
  if (q.answer?.type === 'manual') return true;
  // short_answer without key → manual
  if (q.type === 'short_answer' && (!q.answer || q.answer.type !== 'text' || q.answer.value.length === 0)) {
    return true;
  }
  return false;
}

export interface GradeResult {
  isCorrect: boolean | null;
  pointsEarned: number;
  requiresManual: boolean;
}

export function autoGradeAnswer(
  question: SnapshotQuestion,
  studentValue: StudentAnswerValue,
): GradeResult {
  const maxPoints = question.points;

  if (questionRequiresManualGrade(question)) {
    return { isCorrect: null, pointsEarned: 0, requiresManual: true };
  }

  const key = question.answer;
  if (!key) {
    return { isCorrect: null, pointsEarned: 0, requiresManual: true };
  }

  if (studentValue == null || studentValue === '') {
    return { isCorrect: false, pointsEarned: 0, requiresManual: false };
  }

  if (key.type === 'single') {
    const ok = typeof studentValue === 'string' && studentValue === key.value;
    return { isCorrect: ok, pointsEarned: ok ? maxPoints : 0, requiresManual: false };
  }

  if (key.type === 'multiple') {
    const vals = Array.isArray(studentValue)
      ? studentValue
      : typeof studentValue === 'string'
        ? [studentValue]
        : [];
    const ok = arraysEqualAsSets(vals, key.value);
    return { isCorrect: ok, pointsEarned: ok ? maxPoints : 0, requiresManual: false };
  }

  if (key.type === 'text') {
    const raw = typeof studentValue === 'string' ? studentValue : String(studentValue);
    const normalized = normalizeText(raw);
    const ok = key.value.some((accepted) => normalizeText(accepted) === normalized);
    return { isCorrect: ok, pointsEarned: ok ? maxPoints : 0, requiresManual: false };
  }

  if (key.type === 'numeric') {
    const num =
      typeof studentValue === 'number'
        ? studentValue
        : typeof studentValue === 'string'
          ? Number(studentValue)
          : NaN;
    if (Number.isNaN(num)) {
      return { isCorrect: false, pointsEarned: 0, requiresManual: false };
    }
    const tolerance = key.tolerance ?? 0;
    const ok = Math.abs(num - key.value) <= tolerance;
    return { isCorrect: ok, pointsEarned: ok ? maxPoints : 0, requiresManual: false };
  }

  return { isCorrect: null, pointsEarned: 0, requiresManual: true };
}

export function computeExpEarned(
  examType: ExamType,
  score: number,
  maxScore: number,
): number {
  const baseExp = Math.floor(Math.max(0, score));
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  let earned = baseExp;
  switch (examType) {
    case 'practice':
    case 'worksheet':
      earned = baseExp;
      break;
    case 'homework':
      earned = Math.floor(baseExp * 0.8);
      break;
    case 'quiz':
      earned = percentage >= 80 ? Math.floor(baseExp * 1.2) : baseExp;
      break;
    case 'midterm':
      earned = Math.floor(baseExp * 1.5);
      break;
    case 'final':
      earned = Math.floor(baseExp * 2.0);
      break;
    default:
      earned = baseExp;
  }

  // Soft ceiling by type multiplier * maxScore
  const multiplier =
    examType === 'final'
      ? 2
      : examType === 'midterm'
        ? 1.5
        : examType === 'quiz'
          ? 1.2
          : examType === 'homework'
            ? 0.8
            : 1;
  const ceiling = Math.floor(maxScore * multiplier);
  return Math.max(0, Math.min(earned, ceiling));
}

/**
 * Answer keys / explanations are revealed to students only when:
 * - showExplanation is on, AND
 * - the attempt is submitted (not in progress / cancelled), AND
 * - no attempts remain on the assignment (prevents learning the key then retrying).
 * Teachers/admins always see keys.
 */
export function isAnswerKeyRevealAllowed(opts: {
  status: string;
  showExplanation: boolean;
  forTeacher: boolean;
  remainingAttempts: number;
}): boolean {
  if (opts.forTeacher) return true;
  if (opts.status === 'in_progress' || opts.status === 'cancelled') return false;
  if (!opts.showExplanation) return false;
  return opts.remainingAttempts <= 0;
}

export function stripSnapshotForStudent(
  payload: AttemptSnapshotPayload,
  revealKeys: boolean,
): AttemptSnapshotPayload {
  return {
    ...payload,
    questions: payload.questions.map((q) => {
      const { answer, explanation, ...rest } = q;
      if (revealKeys) {
        return { ...rest, answer, explanation };
      }
      return rest;
    }),
  };
}

/** Type guard helper for answer key presence */
export function hasAnswerKey(answer: QuestionAnswer | undefined): answer is QuestionAnswer {
  return Boolean(answer);
}
