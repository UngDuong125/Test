import type { AttemptDetail, SnapshotQuestion, StudentAnswerValue } from '@/types/content';

export function requiresManual(q: SnapshotQuestion): boolean {
  if (q.requiresManualGrade) return true;
  if (q.type === 'essay') return true;
  if (q.answer?.type === 'manual') return true;
  return false;
}

export type BatchQuestion = { id: string; label: string; points: number; question: SnapshotQuestion };

/**
 * Manual questions across attempts of one exam, in the order of the first attempt that
 * contains them (snapshots may be shuffled per student, the question id is stable).
 */
export function batchQuestions(details: AttemptDetail[]): BatchQuestion[] {
  const out: BatchQuestion[] = [];
  const seen = new Set<string>();
  for (const d of details) {
    const manual = [...d.snapshot.questions].filter(requiresManual).sort((a, b) => a.order - b.order);
    for (const q of manual) {
      if (seen.has(q.id)) continue;
      seen.add(q.id);
      out.push({ id: q.id, label: `Câu tự luận ${out.length + 1}`, points: q.points, question: q });
    }
  }
  return out;
}

/** draft[attemptId][questionId] = { points, feedback } as typed by the teacher. */
export type GradeDraft = Record<string, Record<string, { points: string; feedback: string }>>;

export type AttemptPayload =
  | {
      ready: true;
      answers: { questionId: string; pointsEarned: number; feedback: string | null }[];
    }
  | { ready: false; missing: number; invalid: string | null };

/**
 * The grade request for one attempt. The API only finalises an attempt when every
 * manual question is in the same request, so an attempt is "ready" only when all of
 * its manual questions have a valid score in the draft.
 */
export function attemptPayload(detail: AttemptDetail, draft: GradeDraft): AttemptPayload {
  const manual = detail.snapshot.questions.filter(requiresManual);
  const mine = draft[detail.attempt.id] ?? {};
  const answers: { questionId: string; pointsEarned: number; feedback: string | null }[] = [];
  let missing = 0;
  for (const q of manual) {
    const entry = mine[q.id];
    const raw = entry?.points?.trim() ?? '';
    if (raw === '') {
      missing += 1;
      continue;
    }
    const pts = Number(raw.replace(',', '.'));
    if (!Number.isFinite(pts) || pts < 0 || pts > q.points) {
      return { ready: false, missing, invalid: `Điểm phải từ 0 đến ${q.points}` };
    }
    answers.push({ questionId: q.id, pointsEarned: pts, feedback: entry.feedback.trim() || null });
  }
  if (missing > 0) return { ready: false, missing, invalid: null };
  return { ready: true, answers };
}

export function answerText(value: StudentAnswerValue | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

const TEMPLATES_KEY = 'testarchive:feedback-templates';

export function readFeedbackTemplates(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TEMPLATES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function writeFeedbackTemplates(templates: string[]): void {
  try {
    window.localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates.slice(0, 30)));
  } catch {
    // Storage blocked: templates last for this page only.
  }
}
