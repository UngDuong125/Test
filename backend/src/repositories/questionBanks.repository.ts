import { getDb } from './db.js';
import { mapQuestionBank, type QuestionBankRow } from './content.mapper.js';
import type { QuestionBank, TagKey } from '../types/domain.js';

const BANK_COLUMNS =
  'id, name, description, subject_id, grade, owner_id, created_at, updated_at';

export async function findQuestionBankById(id: string): Promise<QuestionBank | null> {
  const { data, error } = await getDb()
    .from('question_banks')
    .select(BANK_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapQuestionBank(data as QuestionBankRow);
}

export async function listQuestionBanks(filters: {
  subjectId?: TagKey;
  grade?: number;
  ownerId?: string;
  viewerId?: string;
  viewerIsAdmin?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ items: QuestionBank[]; total: number }> {
  let query = getDb().from('question_banks').select(BANK_COLUMNS, { count: 'exact' });
  if (filters.subjectId) query = query.eq('subject_id', filters.subjectId);
  if (filters.grade !== undefined) query = query.eq('grade', filters.grade);
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
    items: ((data ?? []) as QuestionBankRow[]).map(mapQuestionBank),
    total: count ?? 0,
  };
}

export async function createQuestionBank(input: {
  name: string;
  description: string;
  subjectId: TagKey;
  grade: number;
  ownerId: string;
}): Promise<QuestionBank> {
  const { data, error } = await getDb()
    .from('question_banks')
    .insert({
      name: input.name,
      description: input.description,
      subject_id: input.subjectId,
      grade: input.grade,
      owner_id: input.ownerId,
    })
    .select(BANK_COLUMNS)
    .single();
  if (error) throw error;
  return mapQuestionBank(data as QuestionBankRow);
}

export async function updateQuestionBank(
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    subject_id: TagKey;
    grade: number;
  }>,
): Promise<QuestionBank> {
  const { error } = await getDb().from('question_banks').update(patch).eq('id', id);
  if (error) throw error;
  const bank = await findQuestionBankById(id);
  if (!bank) throw new Error('Bank missing after update');
  return bank;
}

export async function deleteQuestionBank(id: string): Promise<void> {
  const { error } = await getDb().from('question_banks').delete().eq('id', id);
  if (error) throw error;
}

export async function addQuestionsToBank(
  bankId: string,
  questionIds: string[],
): Promise<void> {
  if (!questionIds.length) return;
  const rows = questionIds.map((questionId) => ({
    bank_id: bankId,
    question_id: questionId,
  }));
  const { error } = await getDb()
    .from('question_bank_items')
    .upsert(rows, { onConflict: 'bank_id,question_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeQuestionFromBank(
  bankId: string,
  questionId: string,
): Promise<void> {
  const { error } = await getDb()
    .from('question_bank_items')
    .delete()
    .eq('bank_id', bankId)
    .eq('question_id', questionId);
  if (error) throw error;
}

export async function listBankQuestionIds(bankId: string): Promise<string[]> {
  const { data, error } = await getDb()
    .from('question_bank_items')
    .select('question_id')
    .eq('bank_id', bankId);
  if (error) throw error;
  return (data ?? []).map((r: { question_id: string }) => r.question_id);
}

/** Returns question ids that appear in at least one bank. */
export async function findQuestionIdsInAnyBank(questionIds: string[]): Promise<Set<string>> {
  const found = new Set<string>();
  if (!questionIds.length) return found;
  const { data, error } = await getDb()
    .from('question_bank_items')
    .select('question_id')
    .in('question_id', questionIds);
  if (error) throw error;
  for (const row of (data ?? []) as { question_id: string }[]) {
    found.add(row.question_id);
  }
  return found;
}
