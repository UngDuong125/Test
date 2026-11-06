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

export type AttemptPayload = {
  /** Every manual question has a score (in the draft or already graded on the server). */
  ready: boolean;
  /** Scores typed in the draft, valid ones only — safe to send as a partial grade. */
  answers: { questionId: string; pointsEarned: number; feedback: string | null }[];
  missing: number;
  invalid: string | null;
};

/**
 * The grade request for one attempt. The server finalises the attempt once every manual
 * question is graded, across requests (answers carry `manualGradedAt`), so partial saves
 * are fine; `ready` tells the UI whether this save will finalise it.
 */
export function attemptPayload(detail: AttemptDetail, draft: GradeDraft): AttemptPayload {
  const manual = detail.snapshot.questions.filter(requiresManual);
  const mine = draft[detail.attempt.id] ?? {};
  const answers: { questionId: string; pointsEarned: number; feedback: string | null }[] = [];
  let missing = 0;
  let invalid: string | null = null;
  const gradedOnServer = new Set(
    detail.answers.filter((a) => a.manualGradedAt).map((a) => a.questionId),
  );
  for (const q of manual) {
    const entry = mine[q.id];
    const raw = entry?.points?.trim() ?? '';
    if (raw === '') {
      if (!gradedOnServer.has(q.id)) missing += 1;
      continue;
    }
    const pts = Number(raw.replace(',', '.'));
    if (!Number.isFinite(pts) || pts < 0 || pts > q.points) {
      invalid = `Điểm phải từ 0 đến ${q.points}`;
      missing += gradedOnServer.has(q.id) ? 0 : 1;
      continue;
    }
    answers.push({ questionId: q.id, pointsEarned: pts, feedback: entry.feedback.trim() || null });
  }
  return { ready: missing === 0 && invalid == null, answers, missing, invalid };
}

/** Scores already graded on the server, as draft cells (so the teacher sees them). */
export function draftFromServer(details: AttemptDetail[]): GradeDraft {
  const out: GradeDraft = {};
  for (const d of details) {
    const manual = new Set(d.snapshot.questions.filter(requiresManual).map((q) => q.id));
    for (const a of d.answers) {
      if (!manual.has(a.questionId) || !a.manualGradedAt) continue;
      out[d.attempt.id] = {
        ...out[d.attempt.id],
        [a.questionId]: { points: String(a.pointsEarned ?? 0), feedback: a.feedback ?? '' },
      };
    }
  }
  return out;
}

/** Local draft wins over server values cell by cell (unsaved edits are kept). */
export function mergeDrafts(server: GradeDraft, local: GradeDraft): GradeDraft {
  const out: GradeDraft = { ...server };
  for (const [attemptId, cells] of Object.entries(local)) {
    out[attemptId] = { ...out[attemptId], ...cells };
  }
  return out;
}

export function answerText(value: StudentAnswerValue | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

/** Pre-server templates kept in the browser; moved to the server once, then cleared. */
const TEMPLATES_KEY = 'testarchive:feedback-templates';

export function readFeedbackTemplates(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(TEMPLATES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function clearLocalFeedbackTemplates(): void {
  try {
    window.localStorage.removeItem(TEMPLATES_KEY);
  } catch {
    // ignore
  }
}
