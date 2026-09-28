import { getDb } from './db.js';
import {
  mapOption,
  mapQuestion,
  type QuestionOptionRow,
  type QuestionRow,
} from './content.mapper.js';
import type {
  ContentBlock,
  Difficulty,
  Question,
  QuestionAnswer,
  QuestionExplanation,
  QuestionOption,
  QuestionStatus,
  QuestionType,
  TagKey,
} from '../types/domain.js';

const QUESTION_COLUMNS =
  'id, type, subject_id, grade, difficulty, content, answer, explanation, points, tags, status, version, created_by, created_at, updated_at';

export interface QuestionListFilters {
  subjectId?: TagKey;
  grade?: number;
  topicId?: string;
  difficulty?: Difficulty;
  type?: QuestionType;
  status?: QuestionStatus;
  createdBy?: string;
  /** Teacher scope: own drafts/reviews + any published */
  viewerId?: string;
  viewerIsAdmin?: boolean;
  tag?: string;
  bankId?: string;
  ids?: string[];
  limit?: number;
  offset?: number;
}

async function loadOptionsMap(questionIds: string[]): Promise<Map<string, QuestionOption[]>> {
  const map = new Map<string, QuestionOption[]>();
  if (!questionIds.length) return map;
  const { data, error } = await getDb()
    .from('question_options')
    .select('question_id, id, content, order')
    .in('question_id', questionIds)
    .order('order');
  if (error) throw error;
  for (const row of (data ?? []) as QuestionOptionRow[]) {
    const list = map.get(row.question_id) ?? [];
    list.push(mapOption(row));
    map.set(row.question_id, list);
  }
  return map;
}

async function loadTopicIdsMap(questionIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!questionIds.length) return map;
  const { data, error } = await getDb()
    .from('question_topic_links')
    .select('question_id, topic_id')
    .in('question_id', questionIds);
  if (error) throw error;
  for (const row of (data ?? []) as { question_id: string; topic_id: string }[]) {
    const list = map.get(row.question_id) ?? [];
    list.push(row.topic_id);
    map.set(row.question_id, list);
  }
  return map;
}

async function hydrateQuestions(rows: QuestionRow[]): Promise<Question[]> {
  const ids = rows.map((r) => r.id);
  const [optionsMap, topicsMap] = await Promise.all([
    loadOptionsMap(ids),
    loadTopicIdsMap(ids),
  ]);
  return rows.map((row) =>
    mapQuestion(row, optionsMap.get(row.id) ?? [], topicsMap.get(row.id) ?? []),
  );
}

export async function findQuestionById(id: string): Promise<Question | null> {
  const { data, error } = await getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [question] = await hydrateQuestions([data as QuestionRow]);
  return question ?? null;
}

export async function findQuestionsByIds(ids: string[]): Promise<Question[]> {
  if (!ids.length) return [];
  const { data, error } = await getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .in('id', ids);
  if (error) throw error;
  return hydrateQuestions((data ?? []) as QuestionRow[]);
}

export async function listQuestions(filters: QuestionListFilters): Promise<{
  items: Question[];
  total: number;
}> {
  let questionIdsFromTopic: string[] | null = null;
  if (filters.topicId) {
    const { data, error } = await getDb()
      .from('question_topic_links')
      .select('question_id')
      .eq('topic_id', filters.topicId);
    if (error) throw error;
    questionIdsFromTopic = (data ?? []).map((r: { question_id: string }) => r.question_id);
    if (!questionIdsFromTopic.length) return { items: [], total: 0 };
  }

  let questionIdsFromBank: string[] | null = null;
  if (filters.bankId) {
    const { data, error } = await getDb()
      .from('question_bank_items')
      .select('question_id')
      .eq('bank_id', filters.bankId);
    if (error) throw error;
    questionIdsFromBank = (data ?? []).map((r: { question_id: string }) => r.question_id);
    if (!questionIdsFromBank.length) return { items: [], total: 0 };
  }

  let idsFilter = filters.ids ?? null;
  if (questionIdsFromTopic) {
    idsFilter = idsFilter
      ? idsFilter.filter((id) => questionIdsFromTopic!.includes(id))
      : questionIdsFromTopic;
  }
  if (questionIdsFromBank) {
    idsFilter = idsFilter
      ? idsFilter.filter((id) => questionIdsFromBank!.includes(id))
      : questionIdsFromBank;
  }
  if (idsFilter && !idsFilter.length) return { items: [], total: 0 };

  let query = getDb().from('questions').select(QUESTION_COLUMNS, { count: 'exact' });

  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  if (filters.difficulty) query = query.eq('difficulty', filters.difficulty);
  if (filters.type) query = query.eq('type', filters.type);
  if (filters.status) query = query.eq('status', filters.status);
  if (filters.createdBy) query = query.eq('created_by', filters.createdBy);
  if (filters.tag) query = query.contains('tags', [filters.tag]);
  if (idsFilter) query = query.in('id', idsFilter);

  if (filters.viewerId && !filters.viewerIsAdmin) {
    // Own questions (any status) OR published by anyone
    query = query.or(`created_by.eq.${filters.viewerId},status.eq.published`);
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  query = query.order('updated_at', { ascending: false }).range(offset, offset + limit - 1);

  const { data, error, count } = await query;
  if (error) throw error;
  const items = await hydrateQuestions((data ?? []) as QuestionRow[]);
  return { items, total: count ?? items.length };
}

export async function createQuestion(input: {
  type: QuestionType;
  subjectId: TagKey;
  grade: number;
  difficulty: Difficulty;
  content: ContentBlock[];
  answer: QuestionAnswer;
  explanation: QuestionExplanation;
  points: number;
  tags: string[];
  createdBy: string;
  options: QuestionOption[];
  topicIds: string[];
}): Promise<Question> {
  const { data, error } = await getDb()
    .from('questions')
    .insert({
      type: input.type,
      subject_id: input.subjectId,
      grade: input.grade,
      difficulty: input.difficulty,
      content: input.content,
      answer: input.answer,
      explanation: input.explanation,
      points: input.points,
      tags: input.tags,
      status: 'draft',
      version: 1,
      created_by: input.createdBy,
    })
    .select(QUESTION_COLUMNS)
    .single();
  if (error) throw error;

  const questionId = (data as QuestionRow).id;
  if (input.options.length) {
    const { error: optError } = await getDb().from('question_options').insert(
      input.options.map((o) => ({
        question_id: questionId,
        id: o.id,
        content: o.content,
        order: o.order,
      })),
    );
    if (optError) throw optError;
  }

  if (input.topicIds.length) {
    const { error: topicError } = await getDb().from('question_topic_links').insert(
      [...new Set(input.topicIds)].map((topicId) => ({
        question_id: questionId,
        topic_id: topicId,
      })),
    );
    if (topicError) throw topicError;
  }

  return (await findQuestionById(questionId))!;
}

export async function replaceQuestionOptions(
  questionId: string,
  options: QuestionOption[],
): Promise<void> {
  const { error: delError } = await getDb()
    .from('question_options')
    .delete()
    .eq('question_id', questionId);
  if (delError) throw delError;
  if (!options.length) return;
  const { error } = await getDb().from('question_options').insert(
    options.map((o) => ({
      question_id: questionId,
      id: o.id,
      content: o.content,
      order: o.order,
    })),
  );
  if (error) throw error;
}

export async function replaceQuestionTopics(
  questionId: string,
  topicIds: string[],
): Promise<void> {
  const { error: delError } = await getDb()
    .from('question_topic_links')
    .delete()
    .eq('question_id', questionId);
  if (delError) throw delError;
  if (!topicIds.length) return;
  const { error } = await getDb().from('question_topic_links').insert(
    [...new Set(topicIds)].map((topicId) => ({
      question_id: questionId,
      topic_id: topicId,
    })),
  );
  if (error) throw error;
}

export async function updateQuestionRow(
  id: string,
  patch: Partial<{
    type: QuestionType;
    subject_id: TagKey;
    grade: number;
    difficulty: Difficulty;
    content: ContentBlock[];
    answer: QuestionAnswer;
    explanation: QuestionExplanation;
    points: number;
    tags: string[];
    status: QuestionStatus;
    version: number;
  }>,
): Promise<Question> {
  const { error } = await getDb().from('questions').update(patch).eq('id', id);
  if (error) throw error;
  const updated = await findQuestionById(id);
  if (!updated) throw new Error('Question missing after update');
  return updated;
}

export async function deleteQuestion(id: string): Promise<void> {
  const { error } = await getDb().from('questions').delete().eq('id', id);
  if (error) throw error;
}

/** Candidate pool for random selection (published only). */
export async function listPublishedCandidates(filters: {
  subjectId?: TagKey;
  grade?: number;
  topicIds?: string[];
  types?: QuestionType[];
  bankId?: string;
}): Promise<Question[]> {
  let ids: string[] | undefined;

  if (filters.bankId) {
    const { data, error } = await getDb()
      .from('question_bank_items')
      .select('question_id')
      .eq('bank_id', filters.bankId);
    if (error) throw error;
    ids = (data ?? []).map((r: { question_id: string }) => r.question_id);
    if (!ids.length) return [];
  }

  if (filters.topicIds?.length) {
    const { data, error } = await getDb()
      .from('question_topic_links')
      .select('question_id')
      .in('topic_id', filters.topicIds);
    if (error) throw error;
    const topicQids = [
      ...new Set((data ?? []).map((r: { question_id: string }) => r.question_id)),
    ];
    ids = ids ? ids.filter((id) => topicQids.includes(id)) : topicQids;
    if (!ids.length) return [];
  }

  let query = getDb()
    .from('questions')
    .select(QUESTION_COLUMNS)
    .eq('status', 'published');

  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
  if (filters.types?.length) query = query.in('type', filters.types);
  if (ids) query = query.in('id', ids);

  const { data, error } = await query.limit(500);
  if (error) throw error;
  return hydrateQuestions((data ?? []) as QuestionRow[]);
}
