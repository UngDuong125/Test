import { getDb } from './db.js';
import type { Difficulty, TagKey } from '../types/domain.js';

export interface QuestionAnswerStatRow {
  isCorrect: boolean | null;
  pointsEarned: number | null;
  answeredAt: string;
  attemptStartedAt: string;
  attemptId: string;
}

export async function listGradedAnswerStatsForQuestion(
  questionId: string,
  opts: { from?: string; to?: string } = {},
): Promise<QuestionAnswerStatRow[]> {
  let query = getDb()
    .from('attempt_answers')
    .select(
      'is_correct, points_earned, answered_at, attempt_id, attempts!inner(status, started_at, submitted_at)',
    )
    .eq('question_id', questionId)
    .eq('attempts.status', 'graded');

  // Filter by attempt submitted_at via post-filter if from/to provided
  const { data, error } = await query;
  if (error) throw error;

  const rows: QuestionAnswerStatRow[] = [];
  for (const raw of data ?? []) {
    const r = raw as unknown as {
      is_correct: boolean | null;
      points_earned: number | string | null;
      answered_at: string;
      attempt_id: string;
      attempts:
        | { status: string; started_at: string; submitted_at: string | null }
        | Array<{ status: string; started_at: string; submitted_at: string | null }>;
    };
    const attempt = Array.isArray(r.attempts) ? r.attempts[0] : r.attempts;
    if (!attempt) continue;
    const submitted = attempt.submitted_at ?? r.answered_at;
    if (opts.from && submitted < opts.from) continue;
    if (opts.to && submitted >= opts.to) continue;
    rows.push({
      isCorrect: r.is_correct,
      pointsEarned: r.points_earned == null ? null : Number(r.points_earned),
      answeredAt: r.answered_at,
      attemptStartedAt: attempt.started_at,
      attemptId: r.attempt_id,
    });
  }
  return rows;
}

export async function listAttemptStatsForExam(
  examId: string,
  opts: { from?: string; to?: string } = {},
): Promise<
  Array<{
    id: string;
    status: string;
    score: number | null;
    percentage: number | null;
    submittedAt: string | null;
    userId: string;
  }>
> {
  let query = getDb()
    .from('attempts')
    .select('id, status, score, percentage, submitted_at, user_id, started_at')
    .eq('exam_id', examId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as {
    id: string;
    status: string;
    score: number | string | null;
    percentage: number | string | null;
    submitted_at: string | null;
    user_id: string;
    started_at: string;
  }[])
    .filter((r) => {
      const t = r.submitted_at ?? r.started_at;
      if (opts.from && t < opts.from) return false;
      if (opts.to && t >= opts.to) return false;
      return true;
    })
    .map((r) => ({
      id: r.id,
      status: r.status,
      score: r.score == null ? null : Number(r.score),
      percentage: r.percentage == null ? null : Number(r.percentage),
      submittedAt: r.submitted_at,
      userId: r.user_id,
    }));
}

export async function listAssignmentIdsForClass(classId: string): Promise<string[]> {
  const { data, error } = await getDb()
    .from('exam_assignments')
    .select('id')
    .eq('source_class_id', classId);
  if (error) throw error;
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function listAttemptsForAssignments(
  assignmentIds: string[],
  opts: { examId?: string; from?: string; to?: string } = {},
): Promise<
  Array<{
    id: string;
    status: string;
    percentage: number | null;
    score: number | null;
    assignmentId: string;
    userId: string;
    examId: string;
    submittedAt: string | null;
    startedAt: string;
  }>
> {
  if (assignmentIds.length === 0) return [];
  let query = getDb()
    .from('attempts')
    .select(
      'id, status, percentage, score, assignment_id, user_id, exam_id, submitted_at, started_at',
    )
    .in('assignment_id', assignmentIds);
  if (opts.examId) query = query.eq('exam_id', opts.examId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as {
    id: string;
    status: string;
    percentage: number | string | null;
    score: number | string | null;
    assignment_id: string;
    user_id: string;
    exam_id: string;
    submitted_at: string | null;
    started_at: string;
  }[])
    .filter((r) => {
      const t = r.submitted_at ?? r.started_at;
      if (opts.from && t < opts.from) return false;
      if (opts.to && t >= opts.to) return false;
      return true;
    })
    .map((r) => ({
      id: r.id,
      status: r.status,
      percentage: r.percentage == null ? null : Number(r.percentage),
      score: r.score == null ? null : Number(r.score),
      assignmentId: r.assignment_id,
      userId: r.user_id,
      examId: r.exam_id,
      submittedAt: r.submitted_at,
      startedAt: r.started_at,
    }));
}

export async function sumExpForAttemptIds(attemptIds: string[]): Promise<number> {
  if (attemptIds.length === 0) return 0;
  const { data, error } = await getDb()
    .from('exp_ledger')
    .select('exp_earned')
    .in('attempt_id', attemptIds);
  if (error) throw error;
  return ((data ?? []) as { exp_earned: number }[]).reduce(
    (sum, r) => sum + Number(r.exp_earned),
    0,
  );
}

export async function listBankQuestionIds(bankId: string): Promise<string[]> {
  const { data, error } = await getDb()
    .from('question_bank_items')
    .select('question_id')
    .eq('bank_id', bankId);
  if (error) throw error;
  return ((data ?? []) as { question_id: string }[]).map((r) => r.question_id);
}

export async function upsertQuestionStats(input: {
  questionId: string;
  usageCount: number;
  correctRate: number | null;
  averagePointsEarned: number | null;
}): Promise<void> {
  const { error } = await getDb().from('question_stats').upsert({
    question_id: input.questionId,
    usage_count: input.usageCount,
    correct_rate: input.correctRate,
    average_points_earned: input.averagePointsEarned,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

export function observeDifficulty(correctRate: number | null): Difficulty | null {
  if (correctRate == null) return null;
  if (correctRate > 0.75) return 'easy';
  if (correctRate >= 0.4) return 'medium';
  return 'hard';
}

export type { TagKey };
