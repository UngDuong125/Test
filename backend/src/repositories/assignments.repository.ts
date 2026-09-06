import { getDb } from './db.js';
import { mapExamAssignment, type ExamAssignmentRow } from './content.mapper.js';
import type {
  AssignmentStatus,
  ExamAssignment,
  ExamSettings,
} from '../types/domain.js';

const ASSIGNMENT_COLUMNS =
  'id, exam_id, target_type, target_id, source_class_id, assigned_by, assigned_at, available_from, deadline, attempt_limit, status, settings, created_at';

export async function findAssignmentById(id: string): Promise<ExamAssignment | null> {
  const { data, error } = await getDb()
    .from('exam_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapExamAssignment(data as ExamAssignmentRow);
}

export async function findActiveAssignment(
  examId: string,
  targetId: string,
): Promise<ExamAssignment | null> {
  const { data, error } = await getDb()
    .from('exam_assignments')
    .select(ASSIGNMENT_COLUMNS)
    .eq('exam_id', examId)
    .eq('target_id', targetId)
    .not('status', 'in', '(cancelled,expired)')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapExamAssignment(data as ExamAssignmentRow);
}

export async function listAssignments(filters: {
  examId?: string;
  targetId?: string;
  assignedBy?: string;
  status?: AssignmentStatus;
  limit?: number;
  offset?: number;
}): Promise<{ items: ExamAssignment[]; total: number }> {
  let query = getDb().from('exam_assignments').select(ASSIGNMENT_COLUMNS, { count: 'exact' });
  if (filters.examId) query = query.eq('exam_id', filters.examId);
  if (filters.targetId) query = query.eq('target_id', filters.targetId);
  if (filters.assignedBy) query = query.eq('assigned_by', filters.assignedBy);
  if (filters.status) query = query.eq('status', filters.status);

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('assigned_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as ExamAssignmentRow[]).map(mapExamAssignment),
    total: count ?? 0,
  };
}

export async function createAssignment(input: {
  examId: string;
  targetId: string;
  sourceClassId?: string | null;
  assignedBy: string;
  availableFrom: string;
  deadline: string;
  attemptLimit: number;
  status: AssignmentStatus;
  settings: Partial<ExamSettings>;
}): Promise<ExamAssignment> {
  const { data, error } = await getDb()
    .from('exam_assignments')
    .insert({
      exam_id: input.examId,
      target_type: 'user',
      target_id: input.targetId,
      source_class_id: input.sourceClassId ?? null,
      assigned_by: input.assignedBy,
      available_from: input.availableFrom,
      deadline: input.deadline,
      attempt_limit: input.attemptLimit,
      status: input.status,
      settings: input.settings,
    })
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapExamAssignment(data as ExamAssignmentRow);
}

export async function updateAssignment(
  id: string,
  patch: {
    availableFrom?: string;
    deadline?: string;
    attemptLimit?: number;
    status?: AssignmentStatus;
    settings?: Partial<ExamSettings>;
  },
): Promise<ExamAssignment> {
  const row: Record<string, unknown> = {};
  if (patch.availableFrom !== undefined) row.available_from = patch.availableFrom;
  if (patch.deadline !== undefined) row.deadline = patch.deadline;
  if (patch.attemptLimit !== undefined) row.attempt_limit = patch.attemptLimit;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.settings !== undefined) row.settings = patch.settings;

  const { data, error } = await getDb()
    .from('exam_assignments')
    .update(row)
    .eq('id', id)
    .select(ASSIGNMENT_COLUMNS)
    .single();
  if (error) throw error;
  return mapExamAssignment(data as ExamAssignmentRow);
}

export async function enrichAssignments(
  items: ExamAssignment[],
): Promise<ExamAssignment[]> {
  if (items.length === 0) return [];

  const examIds = [...new Set(items.map((a) => a.examId))];
  const userIds = [...new Set(items.map((a) => a.targetId))];

  const [{ data: exams, error: examError }, { data: users, error: userError }] = await Promise.all([
    getDb().from('exams').select('id, title').in('id', examIds),
    getDb().from('users').select('id, email, username').in('id', userIds),
  ]);
  if (examError) throw examError;
  if (userError) throw userError;

  const examMap = new Map(
    ((exams ?? []) as { id: string; title: string }[]).map((e) => [e.id, e.title]),
  );
  const userMap = new Map(
    ((users ?? []) as { id: string; email: string; username: string }[]).map((u) => [
      u.id,
      u,
    ]),
  );

  return items.map((a) => {
    const u = userMap.get(a.targetId);
    return {
      ...a,
      examTitle: examMap.get(a.examId),
      targetEmail: u?.email,
      targetUsername: u?.username,
    };
  });
}
