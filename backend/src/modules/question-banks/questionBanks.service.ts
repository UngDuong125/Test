import { AppError } from '../../domain/errors.js';
import type { PublicUser, QuestionBank, TagKey } from '../../types/domain.js';
import {
  addQuestionsToBank,
  createQuestionBank,
  deleteQuestionBank,
  findQuestionBankById,
  listQuestionBanks,
  removeQuestionFromBank,
  updateQuestionBank,
} from '../../repositories/questionBanks.repository.js';
import { findQuestionsByIds, listQuestions } from '../../repositories/questions.repository.js';
import { subjectExists } from '../../repositories/taxonomy.repository.js';
import { selectRandomQuestions } from './random.selection.js';
import type { Difficulty, QuestionType } from '../../types/domain.js';

function assertTeacherOrAdmin(actor: PublicUser) {
  if (actor.role !== 'admin' && actor.role !== 'teacher') {
    throw new AppError(403, 'Forbidden', 'FORBIDDEN');
  }
}

function assertCanManageBank(actor: PublicUser, bank: QuestionBank) {
  assertTeacherOrAdmin(actor);
  if (actor.role === 'admin') return;
  if (bank.ownerId !== actor.id) {
    throw new AppError(403, 'Not the bank owner', 'FORBIDDEN');
  }
}

export async function createBankForUser(
  actor: PublicUser,
  input: {
    name: string;
    description: string;
    subjectId: TagKey;
    grade: number;
  },
): Promise<QuestionBank> {
  assertTeacherOrAdmin(actor);
  if (!(await subjectExists(input.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  try {
    return await createQuestionBank({
      ...input,
      ownerId: actor.id,
    });
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'code' in err ? String((err as { code: string }).code) : '';
    if (message === '23505') {
      throw new AppError(409, 'A bank with this name already exists', 'BANK_NAME_EXISTS');
    }
    throw err;
  }
}

export async function getBankForUser(actor: PublicUser, id: string): Promise<QuestionBank> {
  assertTeacherOrAdmin(actor);
  const bank = await findQuestionBankById(id);
  if (!bank) throw new AppError(404, 'Question bank not found', 'NOT_FOUND');
  if (actor.role !== 'admin' && bank.ownerId !== actor.id) {
    throw new AppError(404, 'Question bank not found', 'NOT_FOUND');
  }
  return bank;
}

export async function listBanksForUser(
  actor: PublicUser,
  filters: {
    subjectId?: TagKey;
    grade?: number;
    ownerId?: string;
    limit?: number;
    offset?: number;
  },
) {
  assertTeacherOrAdmin(actor);
  return listQuestionBanks({
    ...filters,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function updateBankForUser(
  actor: PublicUser,
  id: string,
  patch: Partial<{
    name: string;
    description: string;
    subjectId: TagKey;
    grade: number;
  }>,
): Promise<QuestionBank> {
  const bank = await getBankForUser(actor, id);
  assertCanManageBank(actor, bank);
  if (patch.subjectId && !(await subjectExists(patch.subjectId))) {
    throw new AppError(422, 'Unknown subject', 'INVALID_SUBJECT');
  }
  return updateQuestionBank(id, {
    name: patch.name,
    description: patch.description,
    subject_id: patch.subjectId,
    grade: patch.grade,
  });
}

export async function deleteBankForUser(actor: PublicUser, id: string): Promise<void> {
  const bank = await getBankForUser(actor, id);
  assertCanManageBank(actor, bank);
  await deleteQuestionBank(id);
}

export async function listBankQuestions(
  actor: PublicUser,
  bankId: string,
  filters: {
    status?: 'draft' | 'review' | 'published' | 'archived';
    difficulty?: Difficulty;
    type?: QuestionType;
    limit?: number;
    offset?: number;
  },
) {
  await getBankForUser(actor, bankId);
  return listQuestions({
    bankId,
    status: filters.status,
    difficulty: filters.difficulty,
    type: filters.type,
    limit: filters.limit,
    offset: filters.offset,
    viewerId: actor.id,
    viewerIsAdmin: actor.role === 'admin',
  });
}

export async function addQuestionsToBankForUser(
  actor: PublicUser,
  bankId: string,
  questionIds: string[],
): Promise<{ added: number }> {
  const bank = await getBankForUser(actor, bankId);
  assertCanManageBank(actor, bank);

  const questions = await findQuestionsByIds(questionIds);
  if (questions.length !== questionIds.length) {
    throw new AppError(422, 'One or more questions not found', 'QUESTION_NOT_FOUND');
  }
  for (const q of questions) {
    if (q.subjectId !== bank.subjectId || q.grade !== bank.grade) {
      throw new AppError(422, `Question ${q.id} subject/grade mismatch`, 'BANK_MISMATCH');
    }
    if (actor.role !== 'admin' && q.createdBy !== actor.id && q.status !== 'published') {
      throw new AppError(403, `Cannot add question ${q.id}`, 'FORBIDDEN');
    }
  }

  await addQuestionsToBank(bankId, questionIds);
  return { added: questionIds.length };
}

export async function removeQuestionFromBankForUser(
  actor: PublicUser,
  bankId: string,
  questionId: string,
): Promise<void> {
  const bank = await getBankForUser(actor, bankId);
  assertCanManageBank(actor, bank);
  await removeQuestionFromBank(bankId, questionId);
}

export async function randomFromBank(
  actor: PublicUser,
  bankId: string,
  selection: {
    count: number;
    topicIds?: string[];
    difficulty?: Partial<Record<Difficulty, number>>;
    types?: QuestionType[];
  },
) {
  const bank = await getBankForUser(actor, bankId);
  return selectRandomQuestions({
    bankId: bank.id,
    subjectId: bank.subjectId,
    grade: bank.grade,
    count: selection.count,
    topicIds: selection.topicIds,
    difficulty: selection.difficulty,
    types: selection.types,
  });
}
