import { getDb } from './db.js';
import { mapSubject, mapTopic, type SubjectRow, type TopicRow } from './content.mapper.js';
import type { Subject, TagKey, Topic } from '../types/domain.js';

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

export async function listTopics(filters: {
  subjectId?: TagKey;
  grade?: number;
}): Promise<Topic[]> {
  let query = getDb().from('topics').select('id, subject_id, name, grade, created_at');
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(mapTopic);
}

export async function findTopicsByIds(ids: string[]): Promise<Topic[]> {
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('topics')
    .select('id, subject_id, name, grade, created_at')
    .in('id', ids);
  if (error) throw error;
  return ((data ?? []) as TopicRow[]).map(mapTopic);
}

export async function mediaExists(id: string): Promise<boolean> {
  const { data, error } = await getDb().from('media').select('id').eq('id', id).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
