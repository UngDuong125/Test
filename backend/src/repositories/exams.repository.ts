import { getDb } from './db.js';
import {
  mapExam,
  mapExamQuestion,
  mapExamSection,
  type ExamQuestionRow,
  type ExamRow,
  type ExamSectionRow,
} from './content.mapper.js';
import type {
  Difficulty,
  Exam,
  ExamQuestion,
  ExamSection,
  ExamSettings,
  ExamStatus,
  ExamType,
  TagKey,
} from '../types/domain.js';

const EXAM_COLUMNS =
  'id, title, description, subject_id, grade, type, difficulty, duration, total_points, instructions, settings, status, version, created_by, owner_id, created_at, updated_at';

export async function findExamById(id: string): Promise<Exam | null> {
  const { data, error } = await getDb().from('exams').select(EXAM_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapExam(data as ExamRow);
}

export async function listExams(filters: {
  subjectId?: TagKey;
  grade?: number;
  type?: ExamType;
  status?: ExamStatus;
  ownerId?: string;
  viewerId?: string;
  viewerIsAdmin?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: Exam[]; total: number }> {
  let query = getDb().from('exams').select(EXAM_COLUMNS, { count: 'exact' });
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.ownerId) query = query.eq('owner_id', filters.ownerId);
  if (filters.viewerId && !filters.viewerIsAdmin) {
    query = query.eq('owner_id', filters.viewerId);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const { data, error, count } = await query
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return {
    items: ((data ?? []) as ExamRow[]).map(mapExam),
    total: count ?? 0,
  };
}

export async function createExam(input: {
  title: string;
  description: string;
  subjectId: TagKey;
  grade: number;
  type: ExamType;
  difficulty: Difficulty;
  duration: number;
  totalPoints: number;
  instructions: string;
  settings: ExamSettings;
  createdBy: string;
  ownerId: string;
}): Promise<Exam> {
  const { data, error } = await getDb()
    .from('exams')
    .insert({
      title: input.title,
      description: input.description,
      subject_id: input.subjectId,
      grade: input.grade,
      type: input.type,
      difficulty: input.difficulty,
      duration: input.duration,
      total_points: input.totalPoints,
      instructions: input.instructions,
      settings: input.settings,
      status: 'draft',
      version: 1,
      created_by: input.createdBy,
      owner_id: input.ownerId,
    })
    .select(EXAM_COLUMNS)
    .single();
  if (error) throw error;
  return mapExam(data as ExamRow);
}

export async function updateExamRow(
  id: string,
  patch: Partial<{
    title: string;
    description: string;
    subject_id: TagKey;
    grade: number;
    type: ExamType;
    difficulty: Difficulty;
    duration: number;
    total_points: number;
    instructions: string;
    settings: ExamSettings;
    status: ExamStatus;
    version: number;
  }>,
): Promise<Exam> {
  const { error } = await getDb().from('exams').update(patch).eq('id', id);
  if (error) throw error;
  const exam = await findExamById(id);
  if (!exam) throw new Error('Exam missing after update');
  return exam;
}

export async function deleteExam(id: string): Promise<void> {
  const { error } = await getDb().from('exams').delete().eq('id', id);
  if (error) throw error;
}

export async function listExamSections(examId: string): Promise<ExamSection[]> {
  const { data, error } = await getDb()
    .from('exam_sections')
    .select('id, exam_id, title, description, order')
    .eq('exam_id', examId)
    .order('order');
  if (error) throw error;
  return ((data ?? []) as ExamSectionRow[]).map(mapExamSection);
}

export async function findExamSectionById(
  examId: string,
  sectionId: string,
): Promise<ExamSection | null> {
  const { data, error } = await getDb()
    .from('exam_sections')
    .select('id, exam_id, title, description, order')
    .eq('exam_id', examId)
    .eq('id', sectionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapExamSection(data as ExamSectionRow);
}

export async function createExamSection(input: {
  examId: string;
  title: string;
  description: string;
  order: number;
}): Promise<ExamSection> {
  const { data, error } = await getDb()
    .from('exam_sections')
    .insert({
      exam_id: input.examId,
      title: input.title,
      description: input.description,
      order: input.order,
    })
    .select('id, exam_id, title, description, order')
    .single();
  if (error) throw error;
  return mapExamSection(data as ExamSectionRow);
}

export async function updateExamSection(
  sectionId: string,
  patch: Partial<{ title: string; description: string; order: number }>,
): Promise<ExamSection> {
  const { data, error } = await getDb()
    .from('exam_sections')
    .update(patch)
    .eq('id', sectionId)
    .select('id, exam_id, title, description, order')
    .single();
  if (error) throw error;
  return mapExamSection(data as ExamSectionRow);
}

export async function deleteExamSection(sectionId: string): Promise<void> {
  const { error } = await getDb().from('exam_sections').delete().eq('id', sectionId);
  if (error) throw error;
}

export async function listExamQuestions(examId: string): Promise<ExamQuestion[]> {
  const { data, error } = await getDb()
    .from('exam_questions')
    .select('exam_id, section_id, question_id, order, points')
    .eq('exam_id', examId)
    .order('order');
  if (error) throw error;
  return ((data ?? []) as ExamQuestionRow[]).map(mapExamQuestion);
}

export async function addExamQuestion(input: {
  examId: string;
  questionId: string;
  sectionId: string | null;
  order: number;
  points: number;
}): Promise<ExamQuestion> {
  const { data, error } = await getDb()
    .from('exam_questions')
    .insert({
      exam_id: input.examId,
      question_id: input.questionId,
      section_id: input.sectionId,
      order: input.order,
      points: input.points,
    })
    .select('exam_id, section_id, question_id, order, points')
    .single();
  if (error) throw error;
  return mapExamQuestion(data as ExamQuestionRow);
}

export async function addExamQuestionsBulk(
  rows: Array<{
    examId: string;
    questionId: string;
    sectionId: string | null;
    order: number;
    points: number;
  }>,
): Promise<void> {
  if (!rows.length) return;
  const { error } = await getDb().from('exam_questions').insert(
    rows.map((r) => ({
      exam_id: r.examId,
      question_id: r.questionId,
      section_id: r.sectionId,
      order: r.order,
      points: r.points,
    })),
  );
  if (error) throw error;
}

export async function updateExamQuestion(
  examId: string,
  questionId: string,
  patch: Partial<{ section_id: string | null; order: number; points: number }>,
): Promise<ExamQuestion> {
  const { data, error } = await getDb()
    .from('exam_questions')
    .update(patch)
    .eq('exam_id', examId)
    .eq('question_id', questionId)
    .select('exam_id, section_id, question_id, order, points')
    .single();
  if (error) throw error;
  return mapExamQuestion(data as ExamQuestionRow);
}

export async function removeExamQuestion(examId: string, questionId: string): Promise<void> {
  const { error } = await getDb()
    .from('exam_questions')
    .delete()
    .eq('exam_id', examId)
    .eq('question_id', questionId);
  if (error) throw error;
}

export async function nextExamQuestionOrder(examId: string): Promise<number> {
  const { data, error } = await getDb()
    .from('exam_questions')
    .select('order')
    .eq('exam_id', examId)
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { order: number }).order) + 1 : 1;
}

export async function nextExamSectionOrder(examId: string): Promise<number> {
  const { data, error } = await getDb()
    .from('exam_sections')
    .select('order')
    .eq('exam_id', examId)
    .order('order', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? Number((data as { order: number }).order) + 1 : 1;
}
