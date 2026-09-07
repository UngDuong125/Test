import { getDb } from './db.js';
import {
  mapAttempt,
  mapAttemptAnswer,
  mapExpLedger,
  mapGradingRecord,
  type AttemptAnswerRow,
  type AttemptRow,
  type AttemptSnapshotRow,
  type ExpLedgerRow,
  type GradingRecordRow,
} from './content.mapper.js';
import type {
  Attempt,
  AttemptAnswer,
  AttemptSnapshotPayload,
  AttemptStatus,
  ExpLedgerEntry,
  GradingRecord,
  StudentAnswerValue,
  TagKey,
  ExamType,
} from '../types/domain.js';

const ATTEMPT_COLUMNS =
  'id, assignment_id, user_id, exam_id, exam_version, status, started_at, submitted_at, expires_at, score, max_score, percentage';

const ANSWER_COLUMNS =
  'id, attempt_id, question_id, value, is_correct, points_earned, feedback, answered_at';

export async function findAttemptById(id: string): Promise<Attempt | null> {
  const { data, error } = await getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapAttempt(data as AttemptRow);
}

export async function listAttemptsByAssignment(assignmentId: string): Promise<Attempt[]> {
  const { data, error } = await getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('assignment_id', assignmentId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as AttemptRow[]).map(mapAttempt);
}

export async function findInProgressAttempt(
  assignmentId: string,
  userId: string,
): Promise<Attempt | null> {
  const { data, error } = await getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS)
    .eq('assignment_id', assignmentId)
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapAttempt(data as AttemptRow);
}

export async function countAttemptsForLimit(assignmentId: string): Promise<number> {
  const { count, error } = await getDb()
    .from('attempts')
    .select('id', { count: 'exact', head: true })
    .eq('assignment_id', assignmentId)
    .neq('status', 'cancelled');
  if (error) throw error;
  return count ?? 0;
}

export async function createAttempt(input: {
  assignmentId: string;
  userId: string;
  examId: string;
  examVersion: number;
  maxScore: number;
  expiresAt: string | null;
}): Promise<Attempt> {
  const { data, error } = await getDb()
    .from('attempts')
    .insert({
      assignment_id: input.assignmentId,
      user_id: input.userId,
      exam_id: input.examId,
      exam_version: input.examVersion,
      status: 'in_progress',
      max_score: input.maxScore,
      expires_at: input.expiresAt,
    })
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw error;
  return mapAttempt(data as AttemptRow);
}

export async function updateAttempt(
  id: string,
  patch: {
    status?: AttemptStatus;
    submittedAt?: string | null;
    score?: number | null;
    percentage?: number | null;
    expiresAt?: string | null;
  },
): Promise<Attempt> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.submittedAt !== undefined) row.submitted_at = patch.submittedAt;
  if (patch.score !== undefined) row.score = patch.score;
  if (patch.percentage !== undefined) row.percentage = patch.percentage;
  if (patch.expiresAt !== undefined) row.expires_at = patch.expiresAt;

  const { data, error } = await getDb()
    .from('attempts')
    .update(row)
    .eq('id', id)
    .select(ATTEMPT_COLUMNS)
    .single();
  if (error) throw error;
  return mapAttempt(data as AttemptRow);
}

export async function saveAttemptSnapshot(
  attemptId: string,
  payload: AttemptSnapshotPayload,
): Promise<void> {
  const { error } = await getDb().from('attempt_snapshots').upsert({
    attempt_id: attemptId,
    payload,
  });
  if (error) throw error;
}

export async function getAttemptSnapshot(
  attemptId: string,
): Promise<AttemptSnapshotPayload | null> {
  const { data, error } = await getDb()
    .from('attempt_snapshots')
    .select('attempt_id, payload')
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return (data as AttemptSnapshotRow).payload;
}

export async function listAttemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
  const { data, error } = await getDb()
    .from('attempt_answers')
    .select(ANSWER_COLUMNS)
    .eq('attempt_id', attemptId)
    .order('answered_at');
  if (error) throw error;
  return ((data ?? []) as AttemptAnswerRow[]).map(mapAttemptAnswer);
}

export async function upsertAttemptAnswer(input: {
  attemptId: string;
  questionId: string;
  value: StudentAnswerValue;
}): Promise<AttemptAnswer> {
  const answeredAt = new Date().toISOString();
  const { data, error } = await getDb()
    .from('attempt_answers')
    .upsert(
      {
        attempt_id: input.attemptId,
        question_id: input.questionId,
        value: input.value,
        answered_at: answeredAt,
        is_correct: null,
        points_earned: null,
        feedback: null,
      },
      { onConflict: 'attempt_id,question_id' },
    )
    .select(ANSWER_COLUMNS)
    .single();
  if (error) throw error;
  return mapAttemptAnswer(data as AttemptAnswerRow);
}

export async function updateAnswerGrading(
  attemptId: string,
  questionId: string,
  patch: {
    isCorrect?: boolean | null;
    pointsEarned?: number | null;
    feedback?: string | null;
  },
): Promise<AttemptAnswer> {
  const row: Record<string, unknown> = {};
  if (patch.isCorrect !== undefined) row.is_correct = patch.isCorrect;
  if (patch.pointsEarned !== undefined) row.points_earned = patch.pointsEarned;
  if (patch.feedback !== undefined) row.feedback = patch.feedback;

  const { data, error } = await getDb()
    .from('attempt_answers')
    .update(row)
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    .select(ANSWER_COLUMNS)
    .single();
  if (error) throw error;
  return mapAttemptAnswer(data as AttemptAnswerRow);
}

export async function ensureAnswerRow(input: {
  attemptId: string;
  questionId: string;
  value?: StudentAnswerValue;
}): Promise<AttemptAnswer> {
  const existing = await listAttemptAnswers(input.attemptId);
  const found = existing.find((a) => a.questionId === input.questionId);
  if (found) return found;
  return upsertAttemptAnswer({
    attemptId: input.attemptId,
    questionId: input.questionId,
    value: input.value ?? null,
  });
}

export async function createGradingRecord(input: {
  attemptId: string;
  gradedBy: string;
  notes?: string | null;
}): Promise<GradingRecord> {
  const { data, error } = await getDb()
    .from('grading_records')
    .insert({
      attempt_id: input.attemptId,
      graded_by: input.gradedBy,
      notes: input.notes ?? null,
    })
    .select('id, attempt_id, graded_by, graded_at, notes')
    .single();
  if (error) throw error;
  return mapGradingRecord(data as GradingRecordRow);
}

export async function listNeedsGradingAttempts(filters: {
  examId?: string;
  classId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ items: Attempt[]; total: number }> {
  let query = getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS, { count: 'exact' })
    .eq('status', 'needs_grading');

  if (filters.examId) query = query.eq('exam_id', filters.examId);

  const limit = filters.limit ?? 20;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('submitted_at', { ascending: true })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  let items = ((data ?? []) as AttemptRow[]).map(mapAttempt);

  if (filters.classId) {
    const assignmentIds = [...new Set(items.map((a) => a.assignmentId))];
    if (assignmentIds.length === 0) return { items: [], total: 0 };
    const { data: asg, error: asgError } = await getDb()
      .from('exam_assignments')
      .select('id, source_class_id')
      .in('id', assignmentIds);
    if (asgError) throw asgError;
    const allowed = new Set(
      ((asg ?? []) as { id: string; source_class_id: string | null }[])
        .filter((a) => a.source_class_id === filters.classId)
        .map((a) => a.id),
    );
    items = items.filter((a) => allowed.has(a.assignmentId));
  }

  return { items, total: count ?? items.length };
}

export async function listAttemptsByExam(
  examId: string,
  filters: { limit?: number; offset?: number } = {},
): Promise<{ items: Attempt[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS, { count: 'exact' })
    .eq('exam_id', examId)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as AttemptRow[]).map(mapAttempt),
    total: count ?? 0,
  };
}

export async function listAttemptsByUser(
  userId: string,
  filters: { limit?: number; offset?: number } = {},
): Promise<{ items: Attempt[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await getDb()
    .from('attempts')
    .select(ATTEMPT_COLUMNS, { count: 'exact' })
    .eq('user_id', userId)
    .order('started_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as AttemptRow[]).map(mapAttempt),
    total: count ?? 0,
  };
}

export async function findExpByAttempt(attemptId: string): Promise<ExpLedgerEntry | null> {
  const { data, error } = await getDb()
    .from('exp_ledger')
    .select(
      'id, attempt_id, user_id, subject_id, exp_earned, exam_type, idempotency_key, created_at, updated_at',
    )
    .eq('attempt_id', attemptId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapExpLedger(data as ExpLedgerRow);
}

export async function insertExpLedger(input: {
  attemptId: string;
  userId: string;
  subjectId: TagKey;
  expEarned: number;
  examType: ExamType;
  idempotencyKey: string;
}): Promise<ExpLedgerEntry> {
  const { data, error } = await getDb()
    .from('exp_ledger')
    .insert({
      attempt_id: input.attemptId,
      user_id: input.userId,
      subject_id: input.subjectId,
      exp_earned: input.expEarned,
      exam_type: input.examType,
      idempotency_key: input.idempotencyKey,
    })
    .select(
      'id, attempt_id, user_id, subject_id, exp_earned, exam_type, idempotency_key, created_at, updated_at',
    )
    .single();
  if (error) throw error;
  return mapExpLedger(data as ExpLedgerRow);
}

export async function updateExpLedger(
  attemptId: string,
  expEarned: number,
): Promise<ExpLedgerEntry> {
  const { data, error } = await getDb()
    .from('exp_ledger')
    .update({ exp_earned: expEarned })
    .eq('attempt_id', attemptId)
    .select(
      'id, attempt_id, user_id, subject_id, exp_earned, exam_type, idempotency_key, created_at, updated_at',
    )
    .single();
  if (error) throw error;
  return mapExpLedger(data as ExpLedgerRow);
}
