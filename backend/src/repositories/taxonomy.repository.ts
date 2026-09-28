import { getDb } from './db.js';
import { mapSubject, mapTopic, type SubjectRow, type TopicRow } from './content.mapper.js';
import type { Subject, TagKey, Topic } from '../types/domain.js';

const TOPIC_COLUMNS = 'id, subject_id, name, grade, created_at';

export async function listSubjects(): Promise<Subject[]> {
  const { data, error } = await getDb().from('subjects').select('id, label').order('id');
  if (error) throw error;
  return ((data ?? []) as SubjectRow[]).map(mapSubject);
}

export async function subjectExists(id: TagKey): Promise<boolean> {
  const { data, error } = await getDb().from('subjects').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/** With `grade`, also returns topics that apply to every grade (`grade IS NULL`). */
export async function listTopics(filters: {
  subjectId?: TagKey;
  grade?: number;
}): Promise<Topic[]> {
  let query = getDb().from('topics').select(TOPIC_COLUMNS);
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.or(`grade.eq.${filters.grade},grade.is.null`);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(mapTopic);
}

export async function findTopicById(id: string): Promise<Topic | null> {
  const { data, error } = await getDb()
    .from('topics')
    .select(TOPIC_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapTopic(data as TopicRow) : null;
}

export async function findTopicsByIds(ids: string[]): Promise<Topic[]> {
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('topics')
    .select(TOPIC_COLUMNS)
    .in('id', ids);
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(mapTopic);
}

/** Topics of a subject with exactly this grade (`null` = every-grade topics only). */
export async function listTopicsExactGrade(
  subjectId: TagKey,
  grade: number | null,
): Promise<Topic[]> {
  let query = getDb().from('topics').select(TOPIC_COLUMNS).eq('subject_id', subjectId);
  query = grade === null ? query.is('grade', null) : query.eq('grade', grade);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(mapTopic);
}

export async function insertTopic(input: {
  subjectId: TagKey;
  name: string;
  grade: number | null;
}): Promise<Topic> {
  const { data, error } = await getDb()
    .from('topics')
    .insert({ subject_id: input.subjectId, name: input.name, grade: input.grade })
    .select(TOPIC_COLUMNS)
    .single();
  if (error) throw error;
  return mapTopic(data as TopicRow);
}

export async function updateTopicRow(
  id: string,
  patch: { name?: string; grade?: number | null },
): Promise<Topic> {
  const { data, error } = await getDb()
    .from('topics')
    .update(patch)
    .eq('id', id)
    .select(TOPIC_COLUMNS)
    .single();
  if (error) throw error;
  return mapTopic(data as TopicRow);
}

export async function deleteTopicRow(id: string): Promise<void> {
  const { error } = await getDb().from('topics').delete().eq('id', id);
  if (error) throw error;
}

export async function countTopicQuestions(id: string): Promise<number> {
  const { count, error } = await getDb()
    .from('question_topic_links')
    .select('question_id', { count: 'exact', head: true })
    .eq('topic_id', id);
  if (error) throw error;
  return count ?? 0;
}

/** Distinct grades of questions linked to a topic. */
export async function listTopicQuestionGrades(id: string): Promise<number[]> {
  const { data: links, error } = await getDb()
    .from('question_topic_links')
    .select('question_id')
    .eq('topic_id', id);
  if (error) throw error;
  const questionIds = (links ?? []).map((r: { question_id: string }) => r.question_id);
  if (!questionIds.length) return [];
  const { data, error: qError } = await getDb()
    .from('questions')
    .select('grade')
    .in('id', questionIds);
  if (qError) throw qError;
  return [...new Set((data ?? []).map((r: { grade: number }) => r.grade))];
}

export async function mediaExists(id: string): Promise<boolean> {
  const { data, error } = await getDb().from('media').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
